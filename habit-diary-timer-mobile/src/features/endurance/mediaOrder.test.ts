import { describe, expect, it, vi } from "vitest";
import { orderEnduranceMedia } from "./mediaOrder";
import { ENDURANCE_PRESETS } from "./game";

describe("endurance media ordering", () => {
  it("keeps every bundled preset in registration order without drawing random numbers", () => {
    const random = vi.fn(() => { throw new Error("Presets must not shuffle"); });
    const media = Object.freeze([1, 2, 3, 4]);
    for (const preset of ENDURANCE_PRESETS.filter((entry) => entry !== "custom")) {
      expect(orderEnduranceMedia(preset, media, random)).toEqual([1, 2, 3, 4]);
    }
    expect(random).not.toHaveBeenCalled();
  });

  it("can produce each permutation without mutating, dropping or repeating selected media", () => {
    const media = Object.freeze([{ id: "image" }, { id: "video" }, { id: "second-image" }]);
    const permutations = new Set<string>();
    for (let first = 0; first < 3; first += 1) for (let second = 0; second < 2; second += 1) {
      const random = vi.fn().mockReturnValueOnce(first / 3).mockReturnValueOnce(second / 2);
      const ordered = orderEnduranceMedia("custom", media, random);
      expect(random).toHaveBeenCalledTimes(2);
      expect(ordered).toHaveLength(3);
      for (const item of media) expect(ordered.filter((entry) => entry === item)).toHaveLength(1);
      permutations.add(ordered.map((item) => item.id).join(","));
    }
    expect(permutations.size).toBe(6);
    expect(media.map((item) => item.id)).toEqual(["image", "video", "second-image"]);
  });

  it("handles one file and empty selections without sampling", () => {
    const random = vi.fn();
    expect(orderEnduranceMedia("custom", [], random)).toEqual([]);
    expect(orderEnduranceMedia("custom", ["single"], random)).toEqual(["single"]);
    expect(random).not.toHaveBeenCalled();
  });
});
