import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { disposalHistoryService, getDailyDisposalCounts } from "./disposalHistoryService";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));

const key = "nino-room:disposal-history:v1";
const input = { recordDate: "2026-10-05", count: 2, note: "メモ\n二行目" };
let raw: string | null;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 5, 12));
  raw = null;
  storage.getItem.mockImplementation(async () => raw);
  storage.setItem.mockImplementation(async (_key: string, value: string) => { raw = value; });
  storage.removeItem.mockImplementation(async () => { raw = null; });
});

afterEach(() => vi.useRealTimers());

describe("disposal history persistence", () => {
  it("loads a missing key as empty without writing", async () => {
    expect(await disposalHistoryService.load()).toEqual([]);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(key);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("persists additions, edits and deletion with stable IDs and creation times", async () => {
    const [record] = await disposalHistoryService.add(input);
    expect(record).toMatchObject(input);
    expect(record.id).not.toBe("");
    expect(await disposalHistoryService.load()).toEqual([record]);
    vi.setSystemTime(new Date(2026, 9, 5, 13));
    const [edited] = await disposalHistoryService.update(record.id, { recordDate: "2026-10-04", count: 4 });
    expect(edited).toMatchObject({ id: record.id, createdAt: record.createdAt, recordDate: "2026-10-04", count: 4, note: "" });
    expect(edited.updatedAt).not.toBe(record.updatedAt);
    expect(await disposalHistoryService.load()).toEqual([edited]);
    expect(await disposalHistoryService.remove(record.id)).toEqual([]);
    expect(await disposalHistoryService.load()).toEqual([]);
    expect(storage.setItem.mock.calls.every(([storageKey]) => storageKey === key)).toBe(true);
  });

  it("totals all records for a day and sorts dates and same-day creation times newest first", async () => {
    const [older] = await disposalHistoryService.add({ recordDate: "2026-09-30", count: 3 });
    const [first] = await disposalHistoryService.add(input);
    vi.setSystemTime(new Date(2026, 9, 5, 13));
    const [second] = await disposalHistoryService.add({ ...input, count: 4 });
    const records = await disposalHistoryService.load();
    expect(records.map(({ id }) => id)).toEqual([second.id, first.id, older.id]);
    expect(getDailyDisposalCounts(records)).toEqual({ "2026-10-05": 6, "2026-09-30": 3 });
    await disposalHistoryService.update(first.id, { recordDate: "2026-09-30", count: 1 });
    expect(getDailyDisposalCounts(await disposalHistoryService.load())).toEqual({ "2026-10-05": 4, "2026-09-30": 4 });
    expect(getDailyDisposalCounts([])).toEqual({});
  });

  it("allows omitted and blank notes, preserving internal multiline personal text", async () => {
    expect((await disposalHistoryService.add({ recordDate: input.recordDate, count: 1 }))[0].note).toBe("");
    expect((await disposalHistoryService.add({ ...input, note: " \n " }))[0].note).toBe("");
    expect((await disposalHistoryService.add({ ...input, note: "  好きな作品\n  自分のメモ  " }))[0].note).toBe("好きな作品\n  自分のメモ");
  });

  it("keeps snapshots of submitted values and never persists mutations to returned objects", async () => {
    const changing = { ...input };
    const adding = disposalHistoryService.add(changing);
    changing.count = 8;
    changing.note = "changed after submission";
    const [record] = await adding;
    expect(record).toMatchObject(input);
    const changingEdit = { ...input, count: 3 };
    const editing = disposalHistoryService.update(record.id, changingEdit);
    changingEdit.count = 9;
    const [edited] = await editing;
    expect(edited.count).toBe(3);
    edited.count = 99;
    const reloaded = await disposalHistoryService.load();
    expect(reloaded[0].count).toBe(3);
    reloaded.length = 0;
    expect(await disposalHistoryService.load()).toHaveLength(1);
  });

  it("serializes overlapping additions and reads so neither record is lost", async () => {
    const entered = deferred();
    const release = deferred();
    storage.setItem.mockImplementationOnce(async (_key: string, value: string) => {
      entered.resolve();
      await release.promise;
      raw = value;
    });
    const first = disposalHistoryService.add(input);
    await entered.promise;
    const second = disposalHistoryService.add({ ...input, count: 3 });
    const loading = disposalHistoryService.load();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    release.resolve();
    await Promise.all([first, second]);
    const records = await loading;
    expect(records).toHaveLength(2);
    expect(new Set(records.map(({ id }) => id)).size).toBe(2);
    expect(getDailyDisposalCounts(records)).toEqual({ "2026-10-05": 5 });
  });

  it("orders clear between queued writes and reads and clears only its own key", async () => {
    const adding = disposalHistoryService.add(input);
    const clearing = disposalHistoryService.clear();
    const loading = disposalHistoryService.load();
    await Promise.all([adding, clearing]);
    expect(await loading).toEqual([]);
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(key);
    expect((await disposalHistoryService.add(input))).toHaveLength(1);
  });

  it("preserves stored records after failed updates and allows a later retry", async () => {
    const [record] = await disposalHistoryService.add(input);
    const previous = raw;
    const failure = new Error("disk full");
    storage.setItem.mockRejectedValueOnce(failure);
    await expect(disposalHistoryService.update(record.id, { ...input, count: 4 })).rejects.toBe(failure);
    expect(raw).toBe(previous);
    expect(await disposalHistoryService.load()).toEqual([record]);
    expect((await disposalHistoryService.update(record.id, { ...input, count: 4 }))[0].count).toBe(4);
  });

  it("propagates read and clear failures without discarding saved records", async () => {
    const [record] = await disposalHistoryService.add(input);
    const previous = raw;
    storage.setItem.mockClear();
    storage.getItem.mockRejectedValueOnce(new Error("read failed"));
    await expect(disposalHistoryService.add(input)).rejects.toThrow("read failed");
    expect(storage.setItem).not.toHaveBeenCalled();
    storage.removeItem.mockRejectedValueOnce(new Error("remove failed"));
    await expect(disposalHistoryService.clear()).rejects.toThrow("remove failed");
    expect(raw).toBe(previous);
    expect(await disposalHistoryService.load()).toEqual([record]);
  });

  it("rejects edits and deletion of a missing ID without altering history", async () => {
    const records = await disposalHistoryService.add(input);
    storage.setItem.mockClear();
    await expect(disposalHistoryService.update("missing", input)).rejects.toThrow("変更する記録が見つかりませんでした。");
    await expect(disposalHistoryService.remove("missing")).rejects.toThrow("削除する記録が見つかりませんでした。");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(await disposalHistoryService.load()).toEqual(records);
  });

  it("loads fresh storage contents after backup replacement without a stale in-memory cache", async () => {
    const original = await disposalHistoryService.add(input);
    const backup = raw;
    await disposalHistoryService.add({ ...input, count: 1 });
    raw = backup;
    expect(await disposalHistoryService.load()).toEqual(original);
  });
});

describe("disposal record validation", () => {
  it.each(["", "2026-1-01", "2026-02-29", "2024-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2026-10-00", "0000-01-01", "2026-10-06"])(
    "rejects invalid or future calendar date %s before writing", async (recordDate) => {
      await expect(disposalHistoryService.add({ ...input, recordDate })).rejects.toThrow("日付は今日以前の正しい日付を指定してください。");
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("accepts leap days and compares today in the local calendar", async () => {
    await disposalHistoryService.add({ ...input, recordDate: "2024-02-29" });
    vi.setSystemTime(new Date(2026, 9, 5, 0, 1));
    expect((await disposalHistoryService.add(input))[0].recordDate).toBe("2026-10-05");
    await expect(disposalHistoryService.add({ ...input, recordDate: "2026-10-06" })).rejects.toThrow();
  });

  it.each([0, -1, 1.5, NaN, Infinity, 10000])("rejects invalid count %s", async (count) => {
    await expect(disposalHistoryService.add({ ...input, count })).rejects.toThrow("回数は1〜9999の整数で入力してください。");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("accepts maximum count and note length while rejecting an oversized note", async () => {
    const [record] = await disposalHistoryService.add({ ...input, count: 9999, note: "a".repeat(4000) });
    expect(record.count).toBe(9999);
    expect(record.note).toHaveLength(4000);
    await expect(disposalHistoryService.update(record.id, { ...input, note: "a".repeat(4001) })).rejects.toThrow("内容は4000文字以内で入力してください。");
    expect(await disposalHistoryService.load()).toEqual([record]);
  });

  it("does not treat existing records as corrupt when the device clock is moved backwards", async () => {
    const records = await disposalHistoryService.add(input);
    vi.setSystemTime(new Date(2026, 8, 1, 12));
    expect(await disposalHistoryService.load()).toEqual(records);
  });

  it.each(["{", "null", "[]", '{"version":2,"records":[]}', '{"version":1,"records":{}}'])(
    "preserves unrecognized stored data %s instead of overwriting it", async (invalid) => {
      raw = invalid;
      await expect(disposalHistoryService.load()).rejects.toThrow("廃棄履歴の保存データを読み込めませんでした。");
      await expect(disposalHistoryService.add(input)).rejects.toThrow("廃棄履歴の保存データを読み込めませんでした。");
      expect(raw).toBe(invalid);
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed records and duplicate IDs while retaining the original storage", async () => {
    const [record] = await disposalHistoryService.add(input);
    const invalidRecords = [
      [record, record],
      [{ ...record, id: "" }],
      [{ ...record, recordDate: "2026-02-30" }],
      [{ ...record, count: 0 }],
      [{ ...record, note: null }],
      [{ ...record, createdAt: "invalid" }],
      [{ ...record, updatedAt: null }],
    ];
    storage.setItem.mockClear();
    for (const records of invalidRecords) {
      raw = JSON.stringify({ version: 1, records });
      const previous = raw;
      await expect(disposalHistoryService.add(input)).rejects.toThrow("廃棄履歴の保存データを読み込めませんでした。");
      expect(raw).toBe(previous);
    }
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
