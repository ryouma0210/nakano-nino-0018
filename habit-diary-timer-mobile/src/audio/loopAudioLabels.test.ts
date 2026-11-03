import { describe, expect, it } from "vitest";
import { loopAudioOptions, loopMediaTitle } from "./loopAudioLabels";

describe("loop notification title", () => {
  it("places breath immediately before ear licking in selectors and playback titles", () => {
    const earLickIndex = loopAudioOptions.findIndex(({ key }) => key === "earLick");
    expect(loopAudioOptions[earLickIndex - 1]).toEqual({ key: "breath", title: "吐息" });
    expect(loopMediaTitle(["earLick", "breath"], (text) => text)).toBe("吐息 / 耳舐め");
  });

  it("uses selector order rather than start order and includes each selected sound once", () => {
    const [first, second, third] = loopAudioOptions;
    expect(loopMediaTitle([third.key, first.key, second.key, first.key], (text) => text))
      .toBe(`${first.title} / ${second.title} / ${third.title}`);
    expect(loopMediaTitle([third.key, first.key], (text) => text)).toBe(`${first.title} / ${third.title}`);
  });

  it("translates every name and the empty-selection fallback", () => {
    const translations = new Map([[loopAudioOptions[0].title, "First"], [loopAudioOptions[1].title, "Second"], ["ループ音声", "Loop audio"]]);
    const translate = (text: string) => translations.get(text) ?? text;
    expect(loopMediaTitle([loopAudioOptions[1].key, loopAudioOptions[0].key], translate)).toBe("First / Second");
    expect(loopMediaTitle([], translate)).toBe("Loop audio");
  });
});
