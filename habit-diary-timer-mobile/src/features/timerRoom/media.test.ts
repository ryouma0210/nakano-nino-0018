import { describe, expect, it } from "vitest";
import type { StoredFile } from "../../services/fileStorageService";
import {
  defaultTimerRoomMedia, moveTimerRoomMedia, parseTimerRoomMedia, resolveTimerRoomMedia,
  selectTimerRoomMediaSource, timerRoomFiles, type TimerRoomMediaPreferences,
} from "./media";

const image: StoredFile = { name: "first.png", displayName: "Renamed image", purpose: "training", usages: ["training", "confinement"], size: 100, uri: "file://first" };
const video: StoredFile = { name: "second.mp4", purpose: "confinement", size: 200, uri: "file://second" };
const filePreferences = (): TimerRoomMediaPreferences => ({ version: 2, source: "files", selectedKeys: ["confinement:second.mp4", "training:first.png"], currentKey: "confinement:second.mp4" });

describe("timer room manual media", () => {
  it("shows a default image for a new room with no stored-file selection", () => {
    expect(parseTimerRoomMedia(null)).toEqual(defaultTimerRoomMedia());
    expect(defaultTimerRoomMedia()).toEqual({ version: 2, source: "default", selectedKeys: [], currentKey: null });
    expect(resolveTimerRoomMedia(defaultTimerRoomMedia(), []).current.key).toBe("default");
  });
  it("uses confinement images/videos and excludes unrelated or private files", () => {
    expect(timerRoomFiles([image, video, { ...image, usages: ["training"] },
      { ...image, purpose: "profile", usages: ["confinement"] }, { ...image, purpose: "chastity" },
      { ...image, name: "paper.pdf" }, { ...image, name: "sound.m4a" }])).toEqual([image, video]);
  });
  it("retains selected order and original identity across display-name and usage changes", () => {
    const preferences = parseTimerRoomMedia(JSON.stringify({ ...filePreferences(), currentKey: "training:first.png" }));
    const resolved = resolveTimerRoomMedia(preferences, [image, video]);
    expect(resolved.items.map((item) => item.key)).toEqual(preferences.selectedKeys);
    expect(resolved.current.label).toBe("Renamed image");
    expect(resolved.current.uri).toBe("file://first");
    expect(resolveTimerRoomMedia(preferences, [{ ...image, usages: ["confinement"] }, video]).current.key).toBe("training:first.png");
  });
  it("migrates mixed v1 selections into separate source and ordered file choices", () => {
    const stored = parseTimerRoomMedia(JSON.stringify({ version: 1, selectedKeys: ["default", "endurance:old.mp4", "training:first.png"], currentKey: "training:first.png" }));
    expect(stored).toEqual({ version: 2, source: "files", selectedKeys: ["endurance:old.mp4", "training:first.png"], currentKey: "training:first.png" });
    const showingDefault = parseTimerRoomMedia(JSON.stringify({ version: 1, selectedKeys: ["default", "training:first.png"], currentKey: "default" }));
    expect(showingDefault).toEqual({ version: 2, source: "default", selectedKeys: ["training:first.png"], currentKey: "training:first.png" });
    expect(parseTimerRoomMedia(JSON.stringify({ version: 1, selectedKeys: ["default"], currentKey: "default" }))).toEqual(defaultTimerRoomMedia());
  });
  it("does not render legacy files whose confinement usage was not added", () => {
    const preferences = parseTimerRoomMedia(JSON.stringify({ version: 1, selectedKeys: ["training:first.png"], currentKey: "training:first.png" }));
    const resolved = resolveTimerRoomMedia(preferences, [{ ...image, usages: ["training"] }]);
    expect(resolved.missing).toBe(true);
    expect(resolved.current.key).toBe("default");
  });
  it("switches to default and back without losing file order or current position", () => {
    const preferences = { ...filePreferences(), currentKey: "training:first.png" };
    const showingDefault = selectTimerRoomMediaSource(preferences, "default");
    expect(resolveTimerRoomMedia(showingDefault, [image, video]).current.key).toBe("default");
    const restored = parseTimerRoomMedia(JSON.stringify(selectTimerRoomMediaSource(showingDefault, "files")));
    expect(restored).toEqual(preferences);
    expect(resolveTimerRoomMedia(restored, [image, video]).current.key).toBe("training:first.png");
  });
  it("allows file mode with no selection so the picker can be opened without inventing media", () => {
    const preferences = parseTimerRoomMedia(JSON.stringify(selectTimerRoomMediaSource(defaultTimerRoomMedia(), "files")));
    expect(preferences.selectedKeys).toEqual([]);
    expect(resolveTimerRoomMedia(preferences, [image, video]).current.key).toBe("default");
  });
  it("moves only when requested, wrapping among selected files rather than the default source", () => {
    const preferences = filePreferences();
    const { items } = resolveTimerRoomMedia(preferences, [image, video]);
    expect(moveTimerRoomMedia(preferences, items, preferences.currentKey!, 1).currentKey).toBe("training:first.png");
    expect(moveTimerRoomMedia(preferences, items, "training:first.png", 1).currentKey).toBe("confinement:second.mp4");
    expect(moveTimerRoomMedia(preferences, items, "confinement:second.mp4", -1).currentKey).toBe("training:first.png");
    expect(moveTimerRoomMedia(preferences, items, "confinement:second.mp4", -1).selectedKeys).toEqual(preferences.selectedKeys);
  });
  it("falls back to default when the current file is deleted or loses confinement usage", () => {
    const preferences = filePreferences();
    const resolved = resolveTimerRoomMedia(preferences, [image]);
    expect(resolved.missing).toBe(true);
    expect(resolved.current.key).toBe("default");
    expect(resolved.items.map((item) => item.key)).toEqual(["default", "training:first.png"]);
    expect(moveTimerRoomMedia(preferences, resolved.items, "default", 1).currentKey).toBe("training:first.png");
    expect(moveTimerRoomMedia(preferences, resolved.items, "default", -1).currentKey).toBe("training:first.png");
    expect(preferences.selectedKeys).toEqual(["confinement:second.mp4", "training:first.png"]);
  });
  it("keeps the current file when an unrelated selected file is deleted", () => {
    expect(resolveTimerRoomMedia({ ...filePreferences(), currentKey: "training:first.png" }, [image]).current.key).toBe("training:first.png");
  });
  it.each([
    "broken", "null", JSON.stringify({ version: 3 }),
    JSON.stringify({ version: 1, selectedKeys: [], currentKey: "default" }),
    JSON.stringify({ version: 1, selectedKeys: ["default", "default"], currentKey: "default" }),
    JSON.stringify({ version: 1, selectedKeys: ["profile:photo.png"], currentKey: "profile:photo.png" }),
    JSON.stringify({ version: 1, selectedKeys: ["default"], currentKey: "training:missing.png" }),
    JSON.stringify({ version: 1, selectedKeys: Array.from({ length: 101 }, (_, n) => `training:${n}.png`), currentKey: "training:0.png" }),
    JSON.stringify({ version: 2, source: "files", selectedKeys: ["default"], currentKey: "default" }),
    JSON.stringify({ version: 2, source: "unknown", selectedKeys: [], currentKey: null }),
    JSON.stringify({ version: 2, source: "files", selectedKeys: [], currentKey: "training:first.png" }),
    JSON.stringify({ version: 2, source: "default", selectedKeys: ["training:first.png"], currentKey: null }),
  ])("rejects corrupt or private media preferences", (raw) => {
    expect(() => parseTimerRoomMedia(raw)).toThrow();
  });
});
