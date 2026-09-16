import { describe, expect, it } from "vitest";
import type { StoredFile } from "../../services/fileStorageService";
import { displayedFileName, filterAndSortFiles, selectedVisibleFiles, storedFileKey } from "./fileList";

function file(name: string, purpose: StoredFile["purpose"] = "training", size = 10): StoredFile {
  return { name, purpose, size, uri: "data:video/mp4;base64,c2FtZQ==" };
}

describe("stored file list", () => {
  it("combines a case-insensitive partial name search with the room filter", () => {
    const match = file("1700000000000_1_Summer Holiday.MP4");
    const otherRoom = file("1700000000001_2_summer.mp4", "punishment");
    const unrelated = file("1700000000002_3_Winter.mp4");
    expect(filterAndSortFiles([match, otherRoom, unrelated], "training", " SUMmER ", "name")).toEqual([match]);
    expect(displayedFileName(match)).toBe("Summer Holiday.MP4");
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
