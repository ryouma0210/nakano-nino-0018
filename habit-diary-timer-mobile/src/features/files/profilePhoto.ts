export const PROFILE_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const invalidProfilePhotoMessage = "PNG・JPEG・WebP・GIFの画像を選択してください。";

export function isProfilePhotoMetadata(name: string, mimeType: string) {
  const types: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
  return types[name.split(".").pop()?.toLowerCase() ?? ""] === mimeType;
}

export function profilePhotoMatchesSignature(bytes: Uint8Array, mimeType: string) {
  const startsWith = (expected: number[]) => expected.every((value, index) => bytes[index] === value);
  if (mimeType === "image/png") return startsWith([137, 80, 78, 71, 13, 10, 26, 10]);
  if (mimeType === "image/jpeg") return startsWith([255, 216, 255]);
  if (mimeType === "image/gif") return startsWith([71, 73, 70, 56]) && [55, 57].includes(bytes[4]) && bytes[5] === 97;
  if (mimeType === "image/webp") return startsWith([82, 73, 70, 70])
    && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
  return false;
}
