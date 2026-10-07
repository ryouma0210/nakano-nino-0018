import { describe, expect, it } from "vitest";
import { searchManual } from "./search";

const sections = [{ id: "settings", title: "設定", entries: [
  { id: "backup", title: "バックアップ", summary: "端末に保存", details: ["ZIP形式で画像も保存できます。"] },
  { id: "sound", title: "音声", summary: "再生", details: ["停止タイマーを設定します。"] },
] }];

describe("manual full-text search", () => {
  it("searches details and combines words across fields", () => {
    expect(searchManual(sections, "設定　ｚｉｐ 画像").map(({ entry }) => entry.id)).toEqual(["backup"]);
    expect(searchManual(sections, "ZIP 停止")).toEqual([]);
  });
  it("also searches the displayed translation", () => {
    expect(searchManual(sections, "sleep timer", (text) => text === "停止タイマーを設定します。" ? "Set a sleep timer." : text).map(({ entry }) => entry.id)).toEqual(["sound"]);
  });
  it("handles empty and unmatched queries", () => {
    expect(searchManual(sections, "  ")).toHaveLength(2);
    expect(searchManual(sections, "見つからない項目")).toEqual([]);
  });
});
