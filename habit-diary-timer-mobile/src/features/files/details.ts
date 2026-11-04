export const MAX_FILE_DISPLAY_NAME_LENGTH = 255;
export const invalidFileDisplayNameMessage = "ファイル名を1〜255文字で入力してください。";

/** Optional persisted metadata must already be normalized. */
export function isValidFileDisplayName(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length > 0
    && value.length <= MAX_FILE_DISPLAY_NAME_LENGTH && value === value.trim()
    && !/[\p{Cc}\u2028\u2029]/u.test(value));
}

export function normalizeFileDisplayName(value: string): string {
  if (typeof value !== "string" || /[\p{Cc}\u2028\u2029]/u.test(value)) throw new Error(invalidFileDisplayNameMessage);
  const normalized = value.trim();
  if (!isValidFileDisplayName(normalized)) throw new Error(invalidFileDisplayNameMessage);
  return normalized;
}
