import { describe, expect, it, vi } from "vitest";
import { createFileListPreferenceStore, DEFAULT_FILE_LIST_PREFERENCES, FILE_LIST_PREFERENCES_KEY, parseFileListPreferences } from "./fileListPreferences";

describe("file list preferences", () => {
  it("restores each display choice without carrying search terms or selections", () => {
    expect(parseFileListPreferences(JSON.stringify({
      version: 1, purpose: "endurance", sort: "size", columns: 1,
      search: "private name", selectedKeys: ["training:file.mp4"],
    }))).toEqual({ purpose: "endurance", sort: "size", columns: 1 });
  });

  it("keeps valid choices while rejecting private-purpose filters and invalid column counts", () => {
    expect(parseFileListPreferences('{"version":1,"purpose":"chastity","sort":"name","columns":100}'))
      .toEqual({ purpose: "all", sort: "name", columns: 3 });
    expect(parseFileListPreferences('{"version":1,"purpose":"training","sort":"broken","columns":2}'))
      .toEqual({ purpose: "training", sort: "newest", columns: 2 });
  });

  it.each([null, "{", "null", "[]", '{"version":2,"columns":1}', '{"version":1,"columns":"2"}'])
    ("safely falls back for unavailable or incompatible preferences: %s", (raw) => {
      expect(parseFileListPreferences(raw)).toEqual(DEFAULT_FILE_LIST_PREFERENCES);
    });

  it("reads existing settings without first writing defaults", async () => {
    const storage = {
      getItem: vi.fn().mockResolvedValue('{"version":1,"purpose":"punishment","sort":"oldest","columns":2}'),
      setItem: vi.fn().mockResolvedValue(undefined),
    };
    expect(await createFileListPreferenceStore(storage).load()).toEqual({ purpose: "punishment", sort: "oldest", columns: 2 });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("serializes rapid changes and waits for the latest saved settings when reopening", async () => {
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let value: string | null = null;
    let calls = 0;
    const storage = {
      getItem: vi.fn(async () => value),
      setItem: vi.fn(async (_key: string, next: string) => {
        if (++calls === 1) await firstWrite;
        value = next;
      }),
    };
    const store = createFileListPreferenceStore(storage);
    const first = store.save({ purpose: "training", sort: "name", columns: 1 });
    const latest = { purpose: "endurance" as const, sort: "oldest" as const, columns: 2 as const };
    const second = store.save(latest);
    const reopened = store.load();
    await Promise.resolve();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem).not.toHaveBeenCalled();
    releaseFirst();
    await Promise.all([first, second]);
    expect(await reopened).toEqual(latest);
    expect(storage.getItem).toHaveBeenCalledWith(FILE_LIST_PREFERENCES_KEY);
  });

  it("reports a failed write and still allows a later retry", async () => {
    const storage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValueOnce(undefined),
    };
    const store = createFileListPreferenceStore(storage);
    await expect(store.save(DEFAULT_FILE_LIST_PREFERENCES)).rejects.toThrow("disk full");
    await expect(store.save({ ...DEFAULT_FILE_LIST_PREFERENCES, columns: 1 })).resolves.toBeUndefined();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });
});
