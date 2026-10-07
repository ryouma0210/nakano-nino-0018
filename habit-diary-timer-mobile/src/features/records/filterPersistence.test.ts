import { describe, expect, it, vi } from "vitest";
import { createRecordFilterStore } from "./filterPersistence";
import { emptyRecordFilters, journalFilterTypeValues } from "./filters";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }) };
}

describe("persistent record filters", () => {
  it("restores saved filters without writing defaults during hydration", async () => {
    const saved = { ...emptyRecordFilters, keyword: "past", fromDate: "2026-03-01", recordType: "diary", tags: "仕事" };
    const storage = memoryStorage({ journals: JSON.stringify(saved) });
    const store = createRecordFilterStore(storage, "journals", journalFilterTypeValues, true);
    expect(store.getSnapshot().ready).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    await store.load();
    expect(store.getSnapshot()).toEqual({ filters: saved, ready: true, storageError: "" });
    await store.load();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("preserves edits made before delayed storage loading, while retaining other saved fields", async () => {
    let resolveRead!: (value: string) => void;
    const storage = { getItem: () => new Promise<string>((resolve) => { resolveRead = resolve; }),
      setItem: vi.fn(async (_key: string, _value: string) => {}) };
    const store = createRecordFilterStore(storage, "journals", journalFilterTypeValues, true);
    const loading = store.load();
    store.update({ keyword: "new query" });
    expect(storage.setItem).not.toHaveBeenCalled();
    resolveRead(JSON.stringify({ ...emptyRecordFilters, keyword: "old query", fromDate: "2026-01-01", tags: "仕事" }));
    await loading;
    await store.flush();
    expect(store.getSnapshot().filters).toEqual({ ...emptyRecordFilters, keyword: "new query", fromDate: "2026-01-01", tags: "仕事" });
    expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual(store.getSnapshot().filters);
  });

  it("uses report deep-link filters instead of inheriting conflicting saved search conditions", async () => {
    const storage = memoryStorage({ journals: JSON.stringify({ ...emptyRecordFilters, keyword: "unrelated", recordType: "health", tags: "old" }) });
    const route = { fromDate: "2026-10-06", toDate: "2026-10-06", tags: "射精記録" };
    const store = createRecordFilterStore(storage, "journals", journalFilterTypeValues, true, route);
    await store.load();
    expect(store.getSnapshot().filters).toEqual({ ...emptyRecordFilters, ...route });
    store.update({ keyword: "edited" });
    store.applyRoute({ fromDate: "2026-10-01", toDate: "2026-10-07" });
    await store.flush();
    expect(store.getSnapshot().filters).toEqual({ ...emptyRecordFilters, fromDate: "2026-10-01", toDate: "2026-10-07" });
    expect(JSON.parse(storage.values.get("journals")!)).toEqual(store.getSnapshot().filters);
  });

  it("serializes rapid saves and keeps different screens independent", async () => {
    const storage = memoryStorage();
    const journals = createRecordFilterStore(storage, "journals", journalFilterTypeValues, true);
    const disposal = createRecordFilterStore(storage, "disposal", [], false);
    await Promise.all([journals.load(), disposal.load()]);
    let finishFirst!: () => void;
    storage.setItem.mockImplementationOnce((_key, _value) => new Promise<void>((resolve) => { finishFirst = resolve; }));
    journals.update({ keyword: "first" });
    journals.update({ keyword: "latest" });
    await Promise.resolve();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    finishFirst();
    await journals.flush();
    disposal.update({ keyword: "another screen" });
    await disposal.flush();
    expect(JSON.parse(storage.values.get("journals")!).keyword).toBe("latest");
    expect(JSON.parse(storage.values.get("disposal")!).keyword).toBe("another screen");
    journals.clear();
    await journals.flush();
    expect(JSON.parse(storage.values.get("journals")!)).toEqual(emptyRecordFilters);
    expect(JSON.parse(storage.values.get("disposal")!).keyword).toBe("another screen");
  });

  it("handles malformed storage without overwriting it and recovers from a later save failure", async () => {
    const storage = memoryStorage({ disposal: "broken-json" });
    const store = createRecordFilterStore(storage, "disposal", [], false);
    await store.load();
    expect(store.getSnapshot().ready).toBe(true);
    expect(store.getSnapshot().storageError).toContain("読み込めません");
    expect(storage.setItem).not.toHaveBeenCalled();
    storage.setItem.mockRejectedValueOnce(new Error("full"));
    store.update({ keyword: "still searchable" });
    await store.flush();
    expect(store.getSnapshot().filters.keyword).toBe("still searchable");
    expect(store.getSnapshot().storageError).toContain("保存できません");
    store.update({ keyword: "retry" });
    await store.flush();
    expect(store.getSnapshot().storageError).toBe("");
    expect(JSON.parse(storage.values.get("disposal")!).keyword).toBe("retry");
  });
});
