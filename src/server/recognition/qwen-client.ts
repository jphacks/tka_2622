import {
  RECOGNITION_SYSTEM_PROMPT,
  RECOGNITION_USER_PROMPT,
} from "./recognition-prompt";
import { readChatCompletionStream } from "./qwen-stream";

export type RecognitionServiceErrorCode =
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "AI_RESPONSE_INVALID"
  | "SERVER_CONFIG_ERROR";

export class RecognitionServiceError extends Error {
  constructor(
    public readonly code: RecognitionServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RecognitionServiceError";
  }
}

interface QwenVisionInput {
  imageBase64: string;
  mimeType: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

function readConfiguration() {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  const model = process.env.QWEN_VISION_MODEL?.trim();
  const baseUrl = process.env.QWEN_BASE_URL?.trim().replace(/\/+$/, "");

  if (!apiKey || !model || !baseUrl) {
    throw new RecognitionServiceError(
      "SERVER_CONFIG_ERROR",
      "Qwen Vision のサーバー設定が不足しています。",
    );
  }

  return { apiKey, model, baseUrl };
}

function getTextContent(payload: unknown): string {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("choices" in payload) ||
    !Array.isArray(payload.choices)
  ) {
    throw new RecognitionServiceError(
      "AI_RESPONSE_INVALID",
      "Qwen Vision から有効な分析結果を取得できませんでした。",
    );
  }

  const firstChoice: unknown = payload.choices[0];
  if (
    typeof firstChoice !== "object" ||
    firstChoice === null ||
    !("message" in firstChoice) ||
    typeof firstChoice.message !== "object" ||
    firstChoice.message === null ||
    !("content" in firstChoice.message) ||
    typeof firstChoice.message.content !== "string"
  ) {
    throw new RecognitionServiceError(
      "AI_RESPONSE_INVALID",
      "Qwen Vision から有効な分析結果を取得できませんでした。",
    );
  }

  return firstChoice.message.content;
}

/**
 * Returns the model's JSON text. With `onText`, the response is streamed and
 * `onText` receives the accumulated text as it arrives.
 */
export async function requestQwenVision(
  input: QwenVisionInput,
  onText?: (text: string) => void,
): Promise<string> {
  const { apiKey, model, baseUrl } = readConfiguration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: RECOGNITION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: RECOGNITION_USER_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${input.mimeType};base64,${input.imageBase64}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        ...(onText ? { stream: true } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("Qwen Vision request failed", {
        status: response.status,
      });
      throw new RecognitionServiceError(
        "AI_UNAVAILABLE",
        "AI分析サービスを利用できません。時間をおいて再度お試しください。",
      );
    }

    if (onText) {
      return await readChatCompletionStream(response, onText);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new RecognitionServiceError(
        "AI_RESPONSE_INVALID",
        "Qwen Vision から有効な分析結果を取得できませんでした。",
      );
    }

    return getTextContent(payload);
  } catch (error) {
    if (error instanceof RecognitionServiceError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new RecognitionServiceError(
        "AI_TIMEOUT",
        "画像分析がタイムアウトしました。もう一度お試しください。",
      );
    }
    console.error("Qwen Vision request failed before receiving a response", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    throw new RecognitionServiceError(
      "AI_UNAVAILABLE",
      "AI分析サービスに接続できません。時間をおいて再度お試しください。",
    );
  } finally {
    clearTimeout(timeout);
  }
}
