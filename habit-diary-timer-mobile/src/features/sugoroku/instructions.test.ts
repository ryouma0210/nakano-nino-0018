import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n";
import en from "../../i18n/en.json";
import ko from "../../i18n/ko.json";
import zh from "../../i18n/zh.json";
import { SUGOROKU_TILES } from "./game";
import { getSugorokuInstruction, SUGOROKU_INSTRUCTIONS } from "./instructions";

describe("sugoroku instructions", () => {
  it("covers every command tile, including negative spaces, stops and endings", () => {
    const commandTiles = SUGOROKU_TILES.filter((tile) => tile.id !== "start");
    expect(Object.keys(SUGOROKU_INSTRUCTIONS).sort()).toEqual(commandTiles.map((tile) => tile.id).sort());
    for (const tile of commandTiles) {
      expect(getSugorokuInstruction(tile.id)?.trim().length, tile.id).toBeGreaterThan(0);
    }
    expect(getSugorokuInstruction("start")).toBeNull();
    expect(getSugorokuInstruction("unknown")).toBeNull();
  });

  it.each([
    ["en", en], ["ko", ko], ["zh", zh],
  ] as const)("fully translates commands into %s without changing counts or durations", (language, catalog) => {
    for (const [tileId, source] of Object.entries(SUGOROKU_INSTRUCTIONS)) {
      if (!source) throw new Error(`Missing instruction: ${tileId}`);
      const expected = (catalog as Record<string, string>)[source];
      expect(expected?.length, `${language}: ${tileId}`).toBeGreaterThan(0);
      const translated = translateText(source, language);
      expect(translated, `${language}: ${tileId}`).toBe(expected);
      expect(translated).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}]/u);
      const numericCounts = language === "en" ? translated.replace(/\bonce\b/g, "1") : translated;
      expect(numericCounts.match(/\d+/g), `${language}: ${tileId}`).toEqual(source.match(/\d+/g));
    }
  });
});
