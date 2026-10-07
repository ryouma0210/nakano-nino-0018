import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "@nino/shared/search";

describe("shared search normalization", () => {
  it("matches full-width Latin text, numbers, and punctuation with their normal-width forms", () => {
    expect(normalizeSearchText("ＺＩＰ１２３．ＭＰ４")).toBe(normalizeSearchText("zip123.mp4"));
  });
  it("matches half-width kana and composed accents without removing meaningful characters", () => {
    expect(normalizeSearchText("ｶﾞｲﾄﾞ Ｃａｆｅ\u0301")).toBe(normalizeSearchText("ガイド Café"));
    expect(normalizeSearchText("カイド")).not.toBe(normalizeSearchText("ガイド"));
  });
  it("preserves token boundaries and lets each search choose its whitespace semantics", () => {
    expect(normalizeSearchText("　Ｗｏｒｋ\n音声　")).toBe(" work\n音声 ");
    expect(normalizeSearchText("")).toBe("");
  });
});
