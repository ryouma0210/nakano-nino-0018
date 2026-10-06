import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n";
import { getOutsideLossMemoryLabel } from "./lossMemoryLabel";

const savedScenes = [
  ["beginner:chest", "初級サキュバス / おっぱい"],
  ["beginner:back", "初級サキュバス / お尻"],
  ["beginner:foot", "初級サキュバス / 足裏"],
  ["middle:chest", "上級サキュバス / おっぱい"],
  ["middle:back", "上級サキュバス / お尻"],
  ["middle:foot", "上級サキュバス / 足裏"],
  ["queen:chest", "女王サキュバス / おっぱい"],
  ["queen:back", "女王サキュバス / お尻"],
  ["queen:foot", "女王サキュバス / 足裏"],
] as const;

describe("outside loss memory display", () => {
  it.each(savedScenes)("displays the previously stored key %s using the scene's Japanese name", (key, label) => {
    expect(getOutsideLossMemoryLabel(key)).toBe(label);
  });

  it("preserves readable legacy values and unknown future keys", () => {
    for (const value of ["初級サキュバス / おっぱい", "new-stage:new-scene", "constructor:chest"]) {
      expect(getOutsideLossMemoryLabel(value)).toBe(value);
    }
    expect(getOutsideLossMemoryLabel(null)).toBe("");
  });

  it("uses scene names that localize in all supported languages", () => {
    for (const [key] of savedScenes) {
      const label = getOutsideLossMemoryLabel(key);
      for (const language of ["en", "ko", "zh"] as const) {
        const translated = translateText(label, language);
        expect(translated).not.toMatch(language === "zh"
          ? /[\p{Script=Hiragana}\p{Script=Katakana}]/u
          : /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
        expect(translated).toContain(" / ");
      }
    }
  });
});
