import { analyzeItem } from "../../../server/recognition/analyze-item";
import { RecognitionServiceError } from "../../../server/recognition/qwen-client";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(
      "INVALID_IMAGE",
      "画像ファイルを送信してください。",
      400,
    );
  }

  const image = formData.get("image");
  if (image === null || typeof image === "string" || image.size === 0) {
    return errorResponse(
      "INVALID_IMAGE",
      "有効な画像ファイルを選択してください。",
      400,
    );
  }

  if (image.size > MAX_IMAGE_BYTES) {
    return errorResponse(
      "IMAGE_TOO_LARGE",
      "画像サイズは5MB以下にしてください。",
      413,
    );
  }

  if (!SUPPORTED_IMAGE_TYPES.has(image.type)) {
    return errorResponse(
      "INVALID_IMAGE",
      "JPEG、PNG、WebP形式の画像を選択してください。",
      400,
    );
  }

  try {
    const imageBase64 = Buffer.from(await image.arrayBuffer()).toString(
      "base64",
    );
    const result = await analyzeItem({
      imageBase64,
      mimeType: image.type,
    });
    return Response.json(result);
  } catch (error) {
    if (!(error instanceof RecognitionServiceError)) {
      throw error;
    }

    const statusByCode = {
      AI_TIMEOUT: 504,
      AI_UNAVAILABLE: 502,
      AI_RESPONSE_INVALID: 502,
      SERVER_CONFIG_ERROR: 500,
    } as const;

    return errorResponse(error.code, error.message, statusByCode[error.code]);
  }
}
