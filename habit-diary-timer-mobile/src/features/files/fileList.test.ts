import { describe, expect, it } from "vitest";
import type { StoredFile } from "../../services/fileStorageService";
import { displayedFileName, filterAndSortFiles, filterFilesByName, selectedVisibleFiles, storedFileKey } from "./fileList";

function file(name: string, purpose: StoredFile["purpose"] = "training", size = 10): StoredFile {
  return { name, purpose, size, uri: "data:video/mp4;base64,c2FtZQ==" };
}

describe("stored file list", () => {
  it("uses editable usages without changing stable identity or exposing private daily photos", () => {
    const shared = { ...file("shared.mp4"), usages: ["punishment", "endurance"] as const };
    const stored: StoredFile = { ...shared, usages: [...shared.usages] };
    const privatePhoto = file("daily.png", "chastity");
    expect(filterAndSortFiles([stored, privatePhoto], "training", "", "name")).toEqual([]);
    expect(filterAndSortFiles([stored, privatePhoto], "punishment", "", "name")).toEqual([stored]);
    expect(filterAndSortFiles([stored, privatePhoto], "endurance", "", "name")).toEqual([stored]);
    expect(filterAndSortFiles([stored, privatePhoto], "all", "", "name")).toEqual([stored]);
    expect(storedFileKey(stored)).toBe("training:shared.mp4");
  });

  it("combines a case-insensitive partial name search with the room filter", () => {
    const match = file("1700000000000_1_Summer Holiday.MP4");
    const otherRoom = file("1700000000001_2_summer.mp4", "punishment");
    const unrelated = file("1700000000002_3_Winter.mp4");
    expect(filterAndSortFiles([match, otherRoom, unrelated], "training", " SUMmER ", "name")).toEqual([match]);
    expect(displayedFileName(match)).toBe("Summer Holiday.MP4");
  });

  it("searches game media names without reordering sources or dropping hidden selections", () => {
    const first = file("1700000000000_2_Holiday 10.MP4");
    const second = file("1700000000001_1_holiday 2.png", "endurance");
    const hidden = file("Winter.mp4");
    const source = [first, hidden, second];
    const selected = new Set([storedFileKey(first), storedFileKey(hidden)]);
    expect(filterFilesByName(source, " HOLIDAY ")).toEqual([first, second]);
    expect(filterFilesByName(source, "missing")).toEqual([]);
    expect(filterFilesByName(source, "")).toEqual(source);
    expect(selectedVisibleFiles(source, selected)).toEqual([first, hidden]);
    expect(source[0].uri).toBe(first.uri);
  });

  it("matches full-width names and half-width kana without changing stored names, media, or order", () => {
    const wide = file("1700000000000_1_ＨＯＬＩＤＡＹ　ガイド.MP4");
    const narrow = file("1700000000001_2_Holiday ｶﾞｲﾄﾞ.png");
    const source = [narrow, wide];
    expect(filterFilesByName(source, " ｈｏｌｉｄａｙ ガイド ")).toEqual(source);
    expect(filterFilesByName(source, "HOLIDAY ｶﾞｲﾄﾞ")).toEqual(source);
    expect(displayedFileName(wide)).toBe("ＨＯＬＩＤＡＹ　ガイド.MP4");
    expect(storedFileKey(wide)).toBe("training:1700000000000_1_ＨＯＬＩＤＡＹ　ガイド.MP4");
    expect(filterFilesByName(source, "ガイド")[0]).toBe(narrow);
  });

  it("orders import dates numerically and leaves undated legacy files at the end", () => {
    const old = file("1700000000000_old.mp4");
    const first = file("1700000000001_9_first.mp4");
    const next = file("1700000000001_10_next.mp4");
    const legacy = file("legacy.mp4");
    const source = [legacy, next, old, first];
    expect(filterAndSortFiles(source, "all", "", "newest")).toEqual([next, first, old, legacy]);
    expect(filterAndSortFiles(source, "all", "", "oldest")).toEqual([old, first, next, legacy]);
    expect(source).toEqual([legacy, next, old, first]);
  });

  it("finds numeric original names from legacy backups even when they resemble an import prefix", () => {
    const legacy = file("1700000000000_2024_trip.jpg");
    expect(filterAndSortFiles([legacy], "all", "2024", "name")).toEqual([legacy]);
    expect(filterAndSortFiles([legacy], "all", "2024_TRIP", "name")).toEqual([legacy]);
  });

  it("sorts by the original name or largest size instead of the generated prefix", () => {
    const second = file("1700000000001_2_clip2.mp4", "training", 10);
    const tenth = file("1700000000000_1_clip10.mp4", "training", 30);
    expect(filterAndSortFiles([tenth, second], "all", "", "name")).toEqual([second, tenth]);
    expect(filterAndSortFiles([second, tenth], "all", "", "size")).toEqual([tenth, second]);
  });

  it("limits deletion targets to selected visible entries, keeping identical content separate", () => {
    const visible = file("first.mp4");
    const otherRoom = file("first.mp4", "punishment");
    const hiddenBySearch = file("second.mp4");
    const visibleFiles = filterAndSortFiles([visible, otherRoom, hiddenBySearch], "training", "first", "name");
    const allSelected = new Set([visible, otherRoom, hiddenBySearch].map(storedFileKey));
    expect(selectedVisibleFiles(visibleFiles, allSelected)).toEqual([visible]);
    expect(selectedVisibleFiles([visible, otherRoom], new Set([storedFileKey(visible)]))).toEqual([visible]);
  });
});
