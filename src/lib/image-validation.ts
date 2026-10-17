const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validateImageFile(
  file: Pick<File, "type" | "size">,
): string | null {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return "JPEG・PNG・WebP形式の画像を選択してください。";
  }
  if (file.size === 0) {
    return "空の画像ファイルは使用できません。";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "画像サイズは5MB以下にしてください。";
  }
  return null;
}
