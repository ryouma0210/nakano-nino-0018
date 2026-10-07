import { describe, expect, it } from "vitest";
import { MAX_CUSTOM_MEDIA } from "./game";
import { reconcileEnduranceFileSelection, toggleEnduranceFileSelection } from "./fileSelection";

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
});
