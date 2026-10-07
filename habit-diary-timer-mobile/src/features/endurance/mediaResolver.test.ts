import { describe, expect, it } from "vitest";
import { resolveEnduranceMedia } from "./mediaResolver";
import type { EnduranceMediaItem } from "./media";

const available: EnduranceMediaItem[] = [
  { id: "endurance:one.png", label: "one", kind: "image", source: { uri: "blob:fresh-one" } },
  { id: "training:two.webm", label: "two", kind: "video", source: { uri: "blob:fresh-two" } },
  { id: "endurance:new.png", label: "new", kind: "image", source: { uri: "blob:new" } },
];

describe("saved endurance media", () => {
  it("uses refreshed sources in the exact saved order, excluding newly added files", () => {
    const ids = Object.freeze(["training:two.webm", "endurance:one.png"]);
    expect(resolveEnduranceMedia(ids, available)).toEqual([available[1], available[0]]);
    expect(ids).toEqual(["training:two.webm", "endurance:one.png"]);
  });

  it("refuses the complete resume if any saved file was deleted or lost its endurance usage", () => {
    expect(resolveEnduranceMedia(["training:two.webm", "endurance:one.png"], [available[1], available[2]])).toBeNull();
    // A file with the same displayed name in a different directory is not a replacement.
    expect(resolveEnduranceMedia(["endurance:two.webm"], available)).toBeNull();
  });
});
