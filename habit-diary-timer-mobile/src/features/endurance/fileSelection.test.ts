import { describe, expect, it } from "vitest";
import { MAX_CUSTOM_MEDIA } from "./game";
import { randomizeEnduranceFileSelection, reconcileEnduranceFileSelection, toggleEnduranceFileSelection } from "./fileSelection";

const empty = { knownKeys: [], selectedKeys: [] };

describe("endurance file selection", () => {
  it("selects all files on the first successful load, including after an initially empty folder", () => {
    const initial = reconcileEnduranceFileSelection(empty, []);
    expect(reconcileEnduranceFileSelection(initial, ["image", "video"]).selectedKeys).toEqual(["image", "video"]);
  });

  it("keeps unchecked files unchecked when the picker reopens or files are reordered", () => {
    const initial = reconcileEnduranceFileSelection(empty, ["image", "video"]);
    const unchecked = toggleEnduranceFileSelection(initial, "image");
    expect(reconcileEnduranceFileSelection(unchecked, ["video", "image"]).selectedKeys).toEqual(["video"]);
    const none = toggleEnduranceFileSelection(unchecked, "video");
    expect(reconcileEnduranceFileSelection(none, ["image", "video"]).selectedKeys).toEqual([]);
  });

  it("removes deleted or no-longer-eligible files and selects newly eligible files", () => {
    const initial = reconcileEnduranceFileSelection(empty, ["removed", "unchecked", "kept"]);
    const unchecked = toggleEnduranceFileSelection(initial, "unchecked");
    expect(reconcileEnduranceFileSelection(unchecked, ["unchecked", "kept", "new"])).toEqual({
      knownKeys: ["unchecked", "kept", "new"], selectedKeys: ["kept", "new"],
    });
  });

  it("caps defaults and manual selection at 100 without reselecting overflow files", () => {
    const keys = Array.from({ length: MAX_CUSTOM_MEDIA + 1 }, (_, index) => `file-${index}`);
    const initial = reconcileEnduranceFileSelection(empty, keys);
    expect(initial.selectedKeys).toEqual(keys.slice(0, MAX_CUSTOM_MEDIA));
    expect(toggleEnduranceFileSelection(initial, keys[MAX_CUSTOM_MEDIA]).selectedKeys).toHaveLength(MAX_CUSTOM_MEDIA);
    const unchecked = toggleEnduranceFileSelection(initial, keys[0]);
    const refreshed = reconcileEnduranceFileSelection(unchecked, keys);
    expect(refreshed.selectedKeys).toHaveLength(MAX_CUSTOM_MEDIA - 1);
    expect(toggleEnduranceFileSelection(refreshed, keys[MAX_CUSTOM_MEDIA]).selectedKeys).toContain(keys[MAX_CUSTOM_MEDIA]);
  });

  it("deduplicates identities and ignores stale checkbox events after a refresh", () => {
    const initial = reconcileEnduranceFileSelection(empty, ["same", "same"]);
    expect(initial).toEqual({ knownKeys: ["same"], selectedKeys: ["same"] });
    expect(toggleEnduranceFileSelection(initial, "deleted")).toBe(initial);
  });

  it("leaves an empty candidate list empty without drawing randomness", () => {
    expect(randomizeEnduranceFileSelection({ knownKeys: [], selectedKeys: ["stale"] }, () => {
      throw new Error("Empty selection must not need randomness");
    })).toEqual(empty);
  });

  it("selects the only available file and deduplicates candidate identities", () => {
    expect(randomizeEnduranceFileSelection({ knownKeys: ["only", "only"], selectedKeys: [] }, () => 0.999999)).toEqual({
      knownKeys: ["only"], selectedKeys: ["only"],
    });
  });

  it.each([5, 20, MAX_CUSTOM_MEDIA + 37])("can draw every allowed selection size from %i candidates without duplicates", (candidateCount) => {
    const knownKeys = Array.from({ length: candidateCount }, (_, index) => `file-${index}`);
    const maxCount = Math.min(candidateCount, MAX_CUSTOM_MEDIA);
    for (let count = 1; count <= maxCount; count++) {
      let firstDraw = true;
      const result = randomizeEnduranceFileSelection({ knownKeys, selectedKeys: [] }, () => {
        if (firstDraw) { firstDraw = false; return (count - 0.5) / maxCount; }
        return 0.75;
      });
      expect(result.selectedKeys).toHaveLength(count);
      expect(new Set(result.selectedKeys).size).toBe(count);
      expect(result.selectedKeys.every((key) => knownKeys.includes(key))).toBe(true);
      expect(result.knownKeys).toEqual(knownKeys);
    }
    expect(randomizeEnduranceFileSelection({ knownKeys, selectedKeys: [] }, () => 0).selectedKeys).toHaveLength(1);
    expect(randomizeEnduranceFileSelection({ knownKeys, selectedKeys: [] }, () => 1 - Number.EPSILON).selectedKeys).toHaveLength(maxCount);
  });

  it("can select any candidate, including candidates beyond the first 100", () => {
    const knownKeys = Array.from({ length: MAX_CUSTOM_MEDIA + 25 }, (_, index) => `file-${index}`);
    for (let chosen = 0; chosen < knownKeys.length; chosen++) {
      const draws = [0, (chosen + 0.5) / knownKeys.length];
      const result = randomizeEnduranceFileSelection({ knownKeys, selectedKeys: knownKeys.slice(0, MAX_CUSTOM_MEDIA) }, () => draws.shift()!);
      expect(result.selectedKeys).toEqual([knownKeys[chosen]]);
    }
  });

  it("gives each ordered pair of five candidates one equal-sized random outcome", () => {
    const knownKeys = ["a", "b", "c", "d", "e"];
    const outcomes = new Set<string>();
    for (let first = 0; first < 5; first++) {
      for (let second = 0; second < 4; second++) {
        const draws = [0.3, (first + 0.5) / 5, (second + 0.5) / 4];
        const { selectedKeys } = randomizeEnduranceFileSelection({ knownKeys, selectedKeys: [] }, () => draws.shift()!);
        expect(selectedKeys).toHaveLength(2);
        expect(selectedKeys[0]).not.toBe(selectedKeys[1]);
        outcomes.add(selectedKeys.join(","));
      }
    }
    expect(outcomes.size).toBe(20);
  });

  it("replaces the previous selection without mutation and keeps excluded files unchecked on reopen", () => {
    const previous = { knownKeys: ["a", "b", "c", "d", "e"], selectedKeys: ["b", "c", "d", "e", "stale"] };
    const result = randomizeEnduranceFileSelection(previous, () => 0);
    expect(result).toEqual({ knownKeys: previous.knownKeys, selectedKeys: ["a"] });
    expect(previous).toEqual({ knownKeys: ["a", "b", "c", "d", "e"], selectedKeys: ["b", "c", "d", "e", "stale"] });
    expect(reconcileEnduranceFileSelection(result, ["e", "d", "c", "b", "a"]).selectedKeys).toEqual(["a"]);
    expect(toggleEnduranceFileSelection(result, "e").selectedKeys).toEqual(["a", "e"]);
  });
});
