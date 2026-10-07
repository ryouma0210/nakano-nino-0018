import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHASTITY_STORAGE_KEY, chastityHistoryService, parseChastityHistory, type ChastityDailyDetails, type ChastityRecordInput } from "./chastityHistoryService";
import type { StoredFile } from "./fileStorageService";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), removeKey: vi.fn(), list: vi.fn(), removeFile: vi.fn(), pick: vi.fn(), exclusive: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: mocks.get, setItem: mocks.set, removeItem: mocks.removeKey } }));
vi.mock("./fileStorageService", () => ({ fileStorageService: {
  list: mocks.list, remove: mocks.removeFile, pickImageAndStore: mocks.pick, withExclusiveFiles: mocks.exclusive,
} }));
const input: ChastityRecordInput = { recordDate: "2026-10-05", status: "locked", note: " 自分のメモ\n  二行目 " };
let raw: string | null;
let files: StoredFile[];
const photo = (name: string): StoredFile => ({ name, purpose: "chastity", size: 4, uri: `blob:${name}` });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 6, 12));
  raw = null;
  files = [];
  mocks.get.mockImplementation(async () => raw);
  mocks.set.mockImplementation(async (_key: string, value: string) => { raw = value; });
  mocks.removeKey.mockImplementation(async () => { raw = null; });
  mocks.list.mockImplementation(async () => [...files]);
  mocks.removeFile.mockImplementation(async (file: StoredFile) => { files = files.filter((entry) => entry.name !== file.name); });
  mocks.exclusive.mockImplementation(async (operation: () => Promise<unknown>) => operation());
  mocks.pick.mockImplementation(async (_purpose: string, saved: (file: StoredFile) => Promise<unknown>) => {
    const file = photo(`image-${files.length}.png`);
    files.push(file);
    try { return await saved(file); }
    catch (error) { await mocks.removeFile(file); throw error; }
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("chastity records and shared daily photographs", () => {
  it("loads empty without writing and retains several independent statuses on the same day", async () => {
    expect(await chastityHistoryService.load()).toEqual({ records: [], photos: {}, dailyDetails: {}, calendarDisplay: "icons" });
    expect(mocks.set).not.toHaveBeenCalled();
    await chastityHistoryService.add(input);
    vi.setSystemTime(new Date(2026, 9, 6, 13));
    const { records } = await chastityHistoryService.add({ ...input, status: "washing", note: "" });
    expect(records.map((record) => record.status)).toEqual(["washing", "locked"]);
    expect(records[1].note).toBe("自分のメモ\n  二行目");
    expect(new Set(records.map((record) => record.id)).size).toBe(2);
    expect(await chastityHistoryService.load()).toEqual({ records, photos: {}, dailyDetails: {}, calendarDisplay: "icons" });
  });

  it("edits dates/status/notes preserving identity and does not move or remove the shared photo", async () => {
    const { records: [created] } = await chastityHistoryService.add(input);
    await chastityHistoryService.pickPhoto(input.recordDate);
    vi.setSystemTime(new Date(2026, 9, 6, 14));
    const edited = await chastityHistoryService.update(created.id, { recordDate: "2026-10-04", status: "wetDream" });
    expect(edited.records[0]).toMatchObject({ id: created.id, createdAt: created.createdAt, recordDate: "2026-10-04", status: "wetDream", note: "" });
    expect(edited.records[0].updatedAt).not.toBe(created.updatedAt);
    expect(Object.keys(edited.photos)).toEqual([input.recordDate]);
    const removed = await chastityHistoryService.remove(created.id);
    expect(removed.records).toEqual([]);
    expect(Object.keys(removed.photos)).toEqual([input.recordDate]);
    expect(mocks.removeFile).not.toHaveBeenCalled();
  });

  it("snapshots caller inputs and serializes overlapping writes", async () => {
    const changing = { ...input };
    const first = chastityHistoryService.add(changing);
    changing.status = "washing";
    const second = chastityHistoryService.add({ ...input, status: "ejaculation" });
    await Promise.all([first, second]);
    const records = (await chastityHistoryService.load()).records;
    expect(records.map((record) => record.status).sort()).toEqual(["ejaculation", "locked"]);
    records[0].note = "not saved";
    expect((await chastityHistoryService.load()).records.every((record) => record.note !== "not saved")).toBe(true);
  });

  it("keeps exactly one attached photo per date and deletes only that date's previous image", async () => {
    const first = await chastityHistoryService.pickPhoto("2026-10-05");
    const other = await chastityHistoryService.pickPhoto("2026-10-04");
    const replaced = await chastityHistoryService.pickPhoto("2026-10-05");
    expect(replaced!.photos["2026-10-04"]).toEqual(other!.photos["2026-10-04"]);
    expect(replaced!.photos["2026-10-05"].name).not.toBe(first!.photos["2026-10-05"].name);
    expect(files).toHaveLength(2);
    expect(mocks.removeFile).toHaveBeenCalledExactlyOnceWith(first!.photos["2026-10-05"]);
    expect(raw).not.toContain("blob:");
    expect(raw).not.toContain("data:");
  });

  it("cancels the chooser without changing records, metadata or existing image", async () => {
    const before = await chastityHistoryService.pickPhoto(input.recordDate);
    const persisted = raw;
    mocks.pick.mockResolvedValueOnce(null);
    expect(await chastityHistoryService.pickPhoto(input.recordDate)).toBeNull();
    expect(raw).toBe(persisted);
    expect(await chastityHistoryService.load()).toEqual(before);
    expect(mocks.removeFile).not.toHaveBeenCalled();
  });

  it("keeps the previous image if the new metadata cannot be saved and recovers for retry", async () => {
    const before = await chastityHistoryService.pickPhoto(input.recordDate);
    const persisted = raw;
    mocks.set.mockRejectedValueOnce(new Error("disk full"));
    await expect(chastityHistoryService.pickPhoto(input.recordDate)).rejects.toThrow("disk full");
    expect(raw).toBe(persisted);
    expect(files).toEqual(Object.values(before!.photos));
    expect(await chastityHistoryService.load()).toEqual(before);
    await expect(chastityHistoryService.pickPhoto(input.recordDate)).resolves.not.toBeNull();
  });

  it("keeps a successfully committed replacement even if old-image cleanup fails", async () => {
    const before = await chastityHistoryService.pickPhoto(input.recordDate);
    mocks.removeFile.mockRejectedValueOnce(new Error("old image busy"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const replaced = await chastityHistoryService.pickPhoto(input.recordDate);
    expect(replaced!.photos[input.recordDate].name).not.toBe(before!.photos[input.recordDate].name);
    expect(await chastityHistoryService.load()).toEqual(replaced);
    expect(files).toHaveLength(2);
  });

  it("removes a shared photo without deleting status records and supports a photo-only day", async () => {
    await chastityHistoryService.add(input);
    await chastityHistoryService.pickPhoto(input.recordDate);
    await chastityHistoryService.pickPhoto("2026-10-04");
    const removed = await chastityHistoryService.removePhoto(input.recordDate);
    expect(removed.records).toHaveLength(1);
    expect(Object.keys(removed.photos)).toEqual(["2026-10-04"]);
    expect(files).toHaveLength(1);
  });

  it("does not delete a photo if its metadata removal fails", async () => {
    const before = await chastityHistoryService.pickPhoto(input.recordDate);
    mocks.set.mockRejectedValueOnce(new Error("write failed"));
    await expect(chastityHistoryService.removePhoto(input.recordDate)).rejects.toThrow("write failed");
    expect(await chastityHistoryService.load()).toEqual(before);
    expect(mocks.removeFile).not.toHaveBeenCalled();
  });

  it("resolves photo URIs afresh and falls back when a record-only backup has no matching files", async () => {
    await chastityHistoryService.add(input);
    await chastityHistoryService.pickPhoto(input.recordDate);
    const persisted = raw;
    const original = files;
    files = [];
    const missing = await chastityHistoryService.load();
    expect(missing.records).toHaveLength(1);
    expect(missing.photos).toEqual({});
    expect(raw).toBe(persisted);
    files = original.map((file) => ({ ...file, uri: "blob:after-reload" }));
    expect((await chastityHistoryService.load()).photos[input.recordDate].uri).toBe("blob:after-reload");
  });

  it("persists calendar display through reload without changing records or photos", async () => {
    await chastityHistoryService.add(input);
    const before = await chastityHistoryService.pickPhoto(input.recordDate);
    expect(await chastityHistoryService.setCalendarDisplay("photos")).toEqual({ ...before, calendarDisplay: "photos" });
    expect((await chastityHistoryService.load()).calendarDisplay).toBe("photos");
  });

  it("clears only its records and every owned image, including unreferenced leftovers, without nesting a file lock", async () => {
    await chastityHistoryService.add(input);
    await chastityHistoryService.saveDailyDetails(input.recordDate, { limitLevel: 25, feelings: "A daily note" });
    await chastityHistoryService.pickPhoto(input.recordDate);
    files.push(photo("orphan.png"));
    mocks.exclusive.mockClear();
    await chastityHistoryService.clear();
    expect(mocks.exclusive).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenLastCalledWith("chastity");
    expect(mocks.removeKey).toHaveBeenCalledExactlyOnceWith(CHASTITY_STORAGE_KEY);
    expect(files).toEqual([]);
    expect(await chastityHistoryService.load()).toEqual({ records: [], photos: {}, dailyDetails: {}, calendarDisplay: "icons" });
  });

  it("rejects unknown record edits/deletions and invalid input without changing history", async () => {
    const before = await chastityHistoryService.add(input);
    await expect(chastityHistoryService.update("missing", input)).rejects.toThrow("見つかりません");
    await expect(chastityHistoryService.remove("missing")).rejects.toThrow("見つかりません");
    expect(await chastityHistoryService.load()).toEqual(before);
  });

  it.each([
    { recordDate: "2026-02-30" }, { recordDate: "2026-10-07" }, { status: "unknown" }, { note: "x".repeat(4001) },
  ])("rejects invalid input %j", async (invalid) => {
    await expect(chastityHistoryService.add({ ...input, ...invalid } as ChastityRecordInput)).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("preserves corrupted stored data instead of overwriting it with a new record", async () => {
    raw = "{broken";
    await expect(chastityHistoryService.add(input)).rejects.toThrow("読み込めません");
    expect(raw).toBe("{broken");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("validates duplicate IDs, invalid status, unsafe names and shared filenames before restore", async () => {
    const { records } = await chastityHistoryService.add(input);
    const base = { version: 1, records, photos: {}, calendarDisplay: "icons" };
    for (const invalid of [
      { ...base, records: [...records, ...records] },
      { ...base, records: [{ ...records[0], status: "unknown" }] },
      { ...base, photos: { "2026-10-05": "../file.png" } },
      { ...base, photos: { "2026-10-05": "same.png", "2026-10-04": "same.png" } },
      { ...base, calendarDisplay: "unknown" },
    ]) expect(() => parseChastityHistory(JSON.stringify(invalid))).toThrow("読み込めません");
  });
});

describe("independent daily details", () => {
  const firstDate = "2026-10-05";
  const otherDate = "2026-10-04";
  const details: ChastityDailyDetails = { limitLevel: 50, feelings: "Today’s note\nSecond line" };

  it("accepts legacy histories without details and preserves records and photo references", async () => {
    const { records } = await chastityHistoryService.add(input);
    const legacy = { version: 1, records, photos: { [firstDate]: "missing.png" }, calendarDisplay: "photos" };
    raw = JSON.stringify(legacy);
    expect(parseChastityHistory(raw)).toEqual({ ...legacy, dailyDetails: {} });
    expect((await chastityHistoryService.load()).dailyDetails).toEqual({});
    expect(raw).toBe(JSON.stringify(legacy));
    await chastityHistoryService.saveDailyDetails(firstDate, details);
    expect(parseChastityHistory(raw)).toEqual({ ...legacy, dailyDetails: { [firstDate]: details } });
  });

  it("saves and updates each date independently while leaving multiple status records and shared photos intact", async () => {
    await chastityHistoryService.add(input);
    await chastityHistoryService.add({ ...input, status: "washing" });
    const before = (await chastityHistoryService.pickPhoto(firstDate))!;
    await chastityHistoryService.saveDailyDetails(firstDate, details);
    await chastityHistoryService.saveDailyDetails(otherDate, { limitLevel: null, feelings: " Note only " });
    const changed = await chastityHistoryService.saveDailyDetails(firstDate, { limitLevel: 100, feelings: "  Updated\n  Note  " });
    expect(changed.records).toEqual(before.records);
    expect(changed.photos).toEqual(before.photos);
    expect(changed.dailyDetails).toEqual({
      [firstDate]: { limitLevel: 100, feelings: "Updated\n  Note" },
      [otherDate]: { limitLevel: null, feelings: "Note only" },
    });
    expect(await chastityHistoryService.load()).toEqual(changed);
    expect(mocks.removeFile).not.toHaveBeenCalled();
  });

  it("supports details without records or a photo, both level boundaries, and the full note length", async () => {
    await chastityHistoryService.saveDailyDetails(firstDate, { limitLevel: 1, feelings: "" });
    const saved = await chastityHistoryService.saveDailyDetails(otherDate, { limitLevel: 100, feelings: "x".repeat(4000) });
    expect(saved.records).toEqual([]);
    expect(saved.photos).toEqual({});
    expect(saved.dailyDetails).toEqual({
      [firstDate]: { limitLevel: 1, feelings: "" },
      [otherDate]: { limitLevel: 100, feelings: "x".repeat(4000) },
    });
    expect(parseChastityHistory(raw).dailyDetails).toEqual(saved.dailyDetails);
  });

  it("persists the help state separately from legacy maximum and intermediate levels without changing the format version", async () => {
    const legacyDetails = {
      [otherDate]: { limitLevel: 45, feelings: "Existing note" },
      "2026-10-03": { limitLevel: 100, feelings: "" },
    };
    raw = JSON.stringify({ version: 1, records: [], photos: {}, calendarDisplay: "icons", dailyDetails: legacyDetails });
    expect((await chastityHistoryService.load()).dailyDetails).toEqual(legacyDetails);
    const helped = { limitLevel: 100, limitState: "help", feelings: "Saved note\nSecond line" } as const;
    const saved = await chastityHistoryService.saveDailyDetails(firstDate, { ...helped, feelings: ` ${helped.feelings} ` });
    expect(saved.dailyDetails).toEqual({ ...legacyDetails, [firstDate]: helped });
    expect(await chastityHistoryService.load()).toEqual(saved);
    expect(parseChastityHistory(raw)).toMatchObject({ version: 1, dailyDetails: saved.dailyDetails });
  });

  it.each([
    { limitLevel: 100, feelings: "Ordinary maximum" },
    { limitLevel: 100, limitState: undefined, feelings: "Ordinary maximum" },
    { limitLevel: 45, feelings: "Updated note" },
    { limitLevel: null, feelings: "Note only" },
    { limitLevel: null, feelings: "" },
  ])("removes a previous help state when returning to an ordinary selection: %j", async (next) => {
    await chastityHistoryService.saveDailyDetails(firstDate, { limitLevel: 100, limitState: "help", feelings: "Before" });
    const saved = await chastityHistoryService.saveDailyDetails(firstDate, next);
    const expected = next.limitLevel === null && !next.feelings ? {} : {
      [firstDate]: { limitLevel: next.limitLevel, feelings: next.feelings },
    };
    expect(saved.dailyDetails).toEqual(expected);
    expect(await chastityHistoryService.load()).toEqual(saved);
    expect(raw).not.toContain("limitState");
  });

  it("snapshots the help state before queued writes and permits an overlapping reset to ordinary maximum", async () => {
    const changing: ChastityDailyDetails = { limitLevel: 100, limitState: "help", feelings: "Before" };
    const first = chastityHistoryService.saveDailyDetails(firstDate, changing);
    delete changing.limitState;
    changing.feelings = "After";
    const second = chastityHistoryService.saveDailyDetails(firstDate, changing);
    const [savedFirst, savedSecond] = await Promise.all([first, second]);
    expect(savedFirst.dailyDetails[firstDate]).toEqual({ limitLevel: 100, limitState: "help", feelings: "Before" });
    expect(savedSecond.dailyDetails[firstDate]).toEqual({ limitLevel: 100, feelings: "After" });
    expect(await chastityHistoryService.load()).toEqual(savedSecond);
  });

  it.each([
    { limitLevel: 100, limitState: null }, { limitLevel: 100, limitState: "unknown" },
    { limitLevel: 100, limitState: true }, { limitLevel: 99, limitState: "help" },
    { limitLevel: null, limitState: "help" },
  ])("rejects invalid limit states before writing: %j", async (invalid) => {
    const before = await chastityHistoryService.saveDailyDetails(firstDate, details);
    mocks.set.mockClear();
    await expect(chastityHistoryService.saveDailyDetails(firstDate, { ...invalid, feelings: "" } as ChastityDailyDetails))
      .rejects.toThrow("状態を選択してください。");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(await chastityHistoryService.load()).toEqual(before);
  });

  it("clears just that date's details when both fields are blank", async () => {
    await chastityHistoryService.add(input);
    await chastityHistoryService.pickPhoto(firstDate);
    await chastityHistoryService.saveDailyDetails(firstDate, details);
    const before = await chastityHistoryService.saveDailyDetails(otherDate, details);
    const cleared = await chastityHistoryService.saveDailyDetails(firstDate, { limitLevel: null, feelings: " \n " });
    expect(cleared).toEqual({ ...before, dailyDetails: { [otherDate]: details } });
    expect(parseChastityHistory(raw).dailyDetails).toEqual({ [otherDate]: details });
    expect(mocks.removeFile).not.toHaveBeenCalled();
  });

  it("preserves both dates' details across record, photo and calendar mutations", async () => {
    await chastityHistoryService.saveDailyDetails(firstDate, { limitLevel: 100, limitState: "help", feelings: "A daily note" });
    const expected = (await chastityHistoryService.saveDailyDetails(otherDate, { limitLevel: 1, feelings: "" })).dailyDetails;
    const added = await chastityHistoryService.add(input);
    expect(added.dailyDetails).toEqual(expected);
    expect((await chastityHistoryService.update(added.records[0].id, { ...input, recordDate: otherDate })).dailyDetails).toEqual(expected);
    expect((await chastityHistoryService.remove(added.records[0].id)).dailyDetails).toEqual(expected);
    expect((await chastityHistoryService.pickPhoto(firstDate))!.dailyDetails).toEqual(expected);
    expect((await chastityHistoryService.pickPhoto(firstDate))!.dailyDetails).toEqual(expected);
    expect((await chastityHistoryService.setCalendarDisplay("photos")).dailyDetails).toEqual(expected);
    expect((await chastityHistoryService.removePhoto(firstDate)).dailyDetails).toEqual(expected);
  });

  it("snapshots caller values, serializes overlapping changes, and does not retain returned objects", async () => {
    const changing = { ...details };
    const first = chastityHistoryService.saveDailyDetails(firstDate, changing);
    changing.limitLevel = 99;
    changing.feelings = "Changed after save started";
    const second = chastityHistoryService.saveDailyDetails(otherDate, { limitLevel: 1, feelings: "" });
    const record = chastityHistoryService.add(input);
    const [savedFirst] = await Promise.all([first, second, record]);
    expect(savedFirst.dailyDetails[firstDate]).toEqual(details);
    const loaded = await chastityHistoryService.load();
    expect(loaded.records).toHaveLength(1);
    expect(loaded.dailyDetails).toEqual({ [firstDate]: details, [otherDate]: { limitLevel: 1, feelings: "" } });
    loaded.dailyDetails[firstDate].feelings = "Not saved";
    expect((await chastityHistoryService.load()).dailyDetails[firstDate]).toEqual(details);
    expect(mocks.exclusive).toHaveBeenCalledTimes(3);
  });

  it.each([0, 101, 1.5, "50", undefined, NaN])("rejects invalid levels without writing: %s", async (limitLevel) => {
    await expect(chastityHistoryService.saveDailyDetails(firstDate, { ...details, limitLevel } as ChastityDailyDetails)).rejects.toThrow("1〜100");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("rejects invalid dates and note values before changing history", async () => {
    for (const date of ["2026-02-30", "2026-10-07"]) {
      await expect(chastityHistoryService.saveDailyDetails(date, details)).rejects.toThrow("日付");
    }
    for (const feelings of ["x".repeat(4001), null, 5]) {
      await expect(chastityHistoryService.saveDailyDetails(firstDate, { ...details, feelings } as ChastityDailyDetails)).rejects.toThrow("4000文字");
    }
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("preserves saved data on a write failure and permits retry", async () => {
    const before = await chastityHistoryService.saveDailyDetails(firstDate, details);
    mocks.set.mockRejectedValueOnce(new Error("disk full"));
    await expect(chastityHistoryService.saveDailyDetails(firstDate, { limitLevel: null, feelings: "" })).rejects.toThrow("disk full");
    expect(await chastityHistoryService.load()).toEqual(before);
    expect((await chastityHistoryService.saveDailyDetails(firstDate, { limitLevel: 1, feelings: "Retry" })).dailyDetails[firstDate])
      .toEqual({ limitLevel: 1, feelings: "Retry" });
  });

  it("refuses to overwrite corrupt details even when clearing them", async () => {
    raw = JSON.stringify({ version: 1, records: [], photos: {}, calendarDisplay: "icons", dailyDetails: { [firstDate]: { limitLevel: 101, feelings: "" } } });
    const corrupted = raw;
    await expect(chastityHistoryService.saveDailyDetails(firstDate, { limitLevel: null, feelings: "" })).rejects.toThrow("読み込めません");
    expect(raw).toBe(corrupted);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("rejects malformed daily-detail maps, dates, levels and notes in stored or backup data", () => {
    const base = { version: 1, records: [], photos: {}, calendarDisplay: "icons" };
    const invalidEntries = [
      null, [], {}, { limitLevel: null }, { feelings: "" },
      ...[0, 101, 1.5, "50"].map((limitLevel) => ({ limitLevel, feelings: "" })),
      { limitLevel: 50, feelings: null }, { limitLevel: 50, feelings: "x".repeat(4001) },
      ...[null, "unknown", true, 100].map((limitState) => ({ limitLevel: 100, limitState, feelings: "" })),
      { limitLevel: 99, limitState: "help", feelings: "" }, { limitLevel: null, limitState: "help", feelings: "" },
    ];
    for (const dailyDetails of [null, [], "details", { "2026-02-30": details },
      ...invalidEntries.map((value) => ({ [firstDate]: value }))]) {
      expect(() => parseChastityHistory(JSON.stringify({ ...base, dailyDetails }))).toThrow("読み込めません");
    }
  });
});
