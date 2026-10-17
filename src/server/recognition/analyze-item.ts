import {
  AnalyzeResponseSchema,
  type AnalyzeResponse,
} from "../../types/recognition";
import { RecognitionServiceError, requestQwenVision } from "./qwen-client";

interface AnalyzeImageInput {
  imageBase64: string;
  mimeType: string;
}

export async function analyzeItem(
  input: AnalyzeImageInput,
): Promise<AnalyzeResponse> {
  const content = await requestQwenVision(input);
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("Qwen Vision response was not valid JSON", {
      reason: "invalid_json",
    });
    throw new RecognitionServiceError(
      "AI_RESPONSE_INVALID",
      "分析結果を確認できませんでした。もう一度お試しください。",
    );
  }

  const result = AnalyzeResponseSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Qwen Vision response failed schema validation", {
      reason: "schema_validation_failed",
      issueCount: result.error.issues.length,
    });
    throw new RecognitionServiceError(
      "AI_RESPONSE_INVALID",
      "分析結果を確認できませんでした。もう一度お試しください。",
    );
  }

  return result.data;
}
