import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Journal } from "../../types/models";
import type { DisposalRecord } from "../../services/disposalHistoryService";
import { journalRepository } from "../../repositories/journalRepository";
import * as webDatabase from "../../database/client.web";
import { selectDisposalRecords, selectJournalRecords, selectTributeRecords } from "./search";
import { emptyRecordFilters } from "./filters";

vi.mock("@/database/client", async () => import("../../database/client.web"));
vi.mock("@/utils/date", () => ({ toDateKey: () => "2026-10-06", toDateTimeKey: () => "2026-10-06 12:00:00", toTimeKey: () => "12:00:00" }));

function journal(id: number, overrides: Partial<Journal> = {}): Journal {
  return {
    id, record_date: "2026-10-06", record_time: "12:00:00", title: "Title", body: "Body", record_type: "diary",
    mood: null, rating: 3, is_favorite: 0, related_habit_id: null, duration_seconds: null, memo: null,
    tags: null, created_at: "2026-10-06 12:00:00", updated_at: "2026-10-06 12:00:00", ...overrides,
  };
}

function seedJournal(entry: Journal) {
  const columns = Object.keys(entry);
  webDatabase.execute(`INSERT INTO journals (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, Object.values(entry));
}

function disposal(id: string, overrides: Partial<DisposalRecord> = {}): DisposalRecord {
  return {
    id, recordDate: "2026-10-06", count: 1, note: "",
    createdAt: "2026-10-06T12:00:00.000Z", updatedAt: "2026-10-06T12:00:00.000Z", ...overrides,
  };
}

beforeEach(() => {
  const local = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => { local.set(key, value); },
    removeItem: (key: string) => { local.delete(key); },
  });
  webDatabase.execute("DELETE FROM journals");
});

afterEach(() => vi.unstubAllGlobals());

describe("journal search across dates", () => {
  it("combines repository keyword results with inclusive dates, exact tags and type across months", () => {
    for (const entry of [
      journal(1, { record_date: "2026-03-01", title: "needle", tags: "仕事,体調" }),
      journal(2, { record_date: "2026-03-31", title: "needle", tags: "仕事,体調", record_type: "health" }),
      journal(3, { record_date: "2026-04-01", title: "needle", tags: "仕事,体調" }),
      journal(4, { record_date: "2026-03-31", title: "needle", tags: "仕事,体調" }),
      journal(5, { record_date: "2026-03-15", title: "needle", tags: "仕事" }),
      journal(6, { record_date: "2026-03-15", title: "different", tags: "仕事,体調" }),
    ]) seedJournal(entry);
    expect(selectJournalRecords(journalRepository.list("needle"), "2026-10-06", "needle", {
      fromDate: "2026-03-01", toDate: "2026-03-31", recordType: "diary", tags: "仕事,体調",
    }).map((entry) => entry.id)).toEqual([4, 1]);
    expect(selectJournalRecords(journalRepository.list(), "2026-10-06", "", { recordType: "health" }).map((entry) => entry.id)).toEqual([2]);
    expect(selectJournalRecords(journalRepository.list(), "2026-10-06", "", { fromDate: "2026-02-30" })).toEqual([]);
  });
  it("uses real repository title, body, and tag matches from different months instead of restricting the selected day", () => {
    seedJournal(journal(1, { record_date: "2025-12-25", title: "Search token" }));
    seedJournal(journal(2, { record_date: "2026-09-10", body: "A token in the body" }));
    seedJournal(journal(3, { record_date: "2026-02-05", tags: "token,favorite" }));
    seedJournal(journal(4));
    const results = selectJournalRecords(journalRepository.list(" token "), "2026-10-06", " token ");
    expect(results.map((entry) => entry.id)).toEqual([2, 3, 1]);
    expect(results.map((entry) => entry.record_date)).toEqual(["2026-09-10", "2026-02-05", "2025-12-25"]);
  });

  it("orders search results by date, then newest time and ID regardless of room priority", () => {
    const records = Object.freeze([
      journal(1, { record_date: "2026-01-01", record_time: "23:00:00", tags: "敗北部屋" }),
      journal(2, { record_time: "11:00:00", tags: "準備部屋" }),
      journal(3, { record_time: "12:00:00" }),
      journal(4, { record_time: "12:00:00" }),
    ]);
    expect(selectJournalRecords(records, "2026-10-06", "query").map((entry) => entry.id)).toEqual([4, 3, 2, 1]);
    expect(records.map((entry) => entry.id)).toEqual([1, 2, 3, 4]);
  });

  it("clearing or using only whitespace returns to the selected day and its existing room order", () => {
    const records = [
      journal(1, { tags: "準備部屋", record_time: "10:00:00" }),
      journal(2, { tags: "敗北部屋", record_time: "18:00:00" }),
      journal(3, { tags: "準備部屋", record_time: "08:00:00" }),
      journal(4, { record_date: "2025-12-25", tags: "敗北部屋" }),
    ];
    for (const entry of records) seedJournal(entry);
    for (const keyword of ["", " \n　"]) {
      expect(selectJournalRecords(journalRepository.list(keyword), "2026-10-06", keyword).map((entry) => entry.id)).toEqual([2, 3, 1]);
    }
  });

  it("returns an empty result when the query matches no record, and can select a found record's date", () => {
    seedJournal(journal(1, { record_date: "2025-12-25", body: "old entry" }));
    seedJournal(journal(2));
    expect(selectJournalRecords(journalRepository.list("not-found"), "2026-10-06", "not-found")).toEqual([]);
    const found = selectJournalRecords(journalRepository.list("old entry"), "2026-10-06", "old entry")[0];
    expect(selectJournalRecords(journalRepository.list(), found.record_date, "").map((entry) => entry.id)).toEqual([1]);
  });
});

describe("disposal record search", () => {
  const records = Object.freeze([
    Object.freeze(disposal("poster", { recordDate: "2026-03-02", count: 7, note: "Blue Poster", createdAt: "2026-03-02T12:00:00.000Z" })),
    Object.freeze(disposal("blank", { recordDate: "2025-12-25", count: 37, createdAt: "2025-12-25T12:00:00.000Z" })),
    Object.freeze(disposal("notebook", { recordDate: "2026-03-02", count: 2, note: "blue notebook\n100% completed", createdAt: "2026-03-02T08:00:00.000Z" })),
    Object.freeze(disposal("today", { note: "Other" })),
  ]);

  it("applies date-only and combined date/keyword filters beyond the selected day", () => {
    expect(selectDisposalRecords(records, "2026-10-06", "", { fromDate: "2026-03-02", toDate: "2026-03-02" }).map((entry) => entry.id))
      .toEqual(["poster", "notebook"]);
    expect(selectDisposalRecords(records, "2026-10-06", "blue", { toDate: "2026-03-01" })).toEqual([]);
    expect(selectDisposalRecords(records, "2026-10-06", "37", { toDate: "2025-12-25" }).map((entry) => entry.id)).toEqual(["blank"]);
    expect(selectDisposalRecords(records, "2026-10-06", "blue", { fromDate: "2026-04-01", toDate: "2026-03-01" })).toEqual([]);
  });

  it.each(["BLUE", "　ｂｌｕｅ　", "2026-03-02", "2026/03/02", "2026/3/2", "2026年3月2日", "2026/3/2 blue"])("finds matches across dates and handles normalized text and date formats: %s", (keyword) => {
    expect(selectDisposalRecords(records, "2026-10-06", keyword).map((entry) => entry.id)).toEqual(["poster", "notebook"]);
  });

  it.each(["３７", "37回", "37 times", "37회", "37次", "2025/12/25"])("finds a record with no optional note by count or date: %s", (keyword) => {
    expect(selectDisposalRecords(records, "2026-10-06", keyword).map((entry) => entry.id)).toEqual(["blank"]);
  });

  it("combines words across fields and treats percent as ordinary text", () => {
    expect(selectDisposalRecords(records, "2026-10-06", "2026-03 notebook").map((entry) => entry.id)).toEqual(["notebook"]);
    expect(selectDisposalRecords(records, "2026-10-06", "%").map((entry) => entry.id)).toEqual(["notebook"]);
    expect(selectDisposalRecords(records, "2026-10-06", "blue 37回")).toEqual([]);
  });

  it("shows no matches explicitly through an empty result and preserves note text and source order", () => {
    expect(selectDisposalRecords(records, "2026-10-06", "missing")).toEqual([]);
    expect(selectDisposalRecords(records, "2026-10-06", "100%")[0].note).toBe("blue notebook\n100% completed");
    expect(records.map((entry) => entry.id)).toEqual(["poster", "blank", "notebook", "today"]);
  });

  it("clearing search restores the previously selected day with all counts intact", () => {
    for (const keyword of ["", " \n　"]) {
      const day = selectDisposalRecords(records, "2026-03-02", keyword);
      expect(day.map((entry) => entry.id)).toEqual(["poster", "notebook"]);
      expect(day.reduce((sum, entry) => sum + entry.count, 0)).toBe(9);
    }
    expect(selectDisposalRecords(records, "2025-12-25", "")[0].note).toBe("");
  });
});

describe("income and expense history filters", () => {
  const records = [
    { id: 1, record_date: "2026-03-02", amount: 1200, comment: "Gift", created_at: "", updated_at: "" },
    { id: 2, record_date: "2026-10-06", amount: 3000, comment: null, created_at: "", updated_at: "" },
  ];
  it("preserves the current month's default list and searches all months when a condition is set", () => {
    expect(selectTributeRecords(records, "2026-10", emptyRecordFilters, "expense").map((entry) => entry.id)).toEqual([2]);
    expect(selectTributeRecords(records, "2026-10", { ...emptyRecordFilters, keyword: "ＧＩＦＴ 2026/3/2 1,200" }, "expense").map((entry) => entry.id)).toEqual([1]);
    expect(selectTributeRecords(records, "2026-10", { ...emptyRecordFilters, recordType: "income", fromDate: "2026-03-02", toDate: "2026-03-02" }, "income").map((entry) => entry.id)).toEqual([1]);
  });
  it("excludes the other transaction type and rejects invalid or reversed bounds", () => {
    expect(selectTributeRecords(records, "2026-10", { ...emptyRecordFilters, recordType: "income" }, "expense")).toEqual([]);
    expect(selectTributeRecords(records, "2026-10", { ...emptyRecordFilters, fromDate: "2026-02-30" }, "income")).toEqual([]);
    expect(selectTributeRecords(records, "2026-10", { ...emptyRecordFilters, fromDate: "2026-10-06", toDate: "2026-03-01" }, "expense")).toEqual([]);
  });
});
