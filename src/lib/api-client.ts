import {
  AnalyzeResponseSchema,
  type AnalyzeResponse,
} from "../types/recognition";

interface ApiError {
  error?: {
    message?: string;
  };
}

export async function analyzeImage(file: File): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append("image", file);

  let response: Response;
  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("サーバーに接続できません。接続を確認して再度お試しください。");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("サーバーから正しい応答を受け取れませんでした。");
  }

  if (!response.ok) {
    const error = payload as ApiError;
    throw new Error(
      error.error?.message ??
        "画像を分析できませんでした。時間をおいて再度お試しください。",
    );
  }

  const result = AnalyzeResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      "分析結果を確認できませんでした。別の写真で再度お試しください。",
    );
  }
  return result.data;
}
