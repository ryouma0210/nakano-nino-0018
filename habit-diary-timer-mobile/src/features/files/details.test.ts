import { describe, expect, it } from "vitest";
import { isValidFileDisplayName, MAX_FILE_DISPLAY_NAME_LENGTH, normalizeFileDisplayName } from "./details";

describe("file display names", () => {
  it("trims human-readable names without interpreting them as paths or changing extensions", () => {
    expect(normalizeFileDisplayName("  お気に入り / 夜: part 1  ")).toBe("お気に入り / 夜: part 1");
    expect(normalizeFileDisplayName("表示名だけ")).toBe("表示名だけ");
  });

  it("accepts optional legacy metadata but requires persisted names to already be trimmed", () => {
    expect(isValidFileDisplayName(undefined)).toBe(true);
    expect(isValidFileDisplayName("a")).toBe(true);
    expect(isValidFileDisplayName("あ".repeat(MAX_FILE_DISPLAY_NAME_LENGTH))).toBe(true);
    for (const value of [null, 10, "", " ", " name", "name ", "a".repeat(256)]) expect(isValidFileDisplayName(value)).toBe(false);
  });

  it("rejects empty, excessive and control-containing input before saving", () => {
    for (const value of ["", "　 ", "a".repeat(256), "a\0b", "a\nb", "a\tb", "a\u007fb", "a\u0085b", "a\u2028b", "\nname"]) {
      expect(isValidFileDisplayName(value)).toBe(false);
      expect(() => normalizeFileDisplayName(value)).toThrow("ファイル名を1〜255文字で入力してください。");
    }
  });
});
