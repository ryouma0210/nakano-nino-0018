import { describe, expect, it } from "vitest";
import { emptyRecordFilters, hasRecordFilters, isRecordFilterDate, matchesRecordTags,
  recordFilterError, recordFiltersFromParams, sanitizeRecordFilters } from "./filters";

describe("record filter validation", () => {
  it.each(["2024-02-29", "2026-01-01", "0001-01-01", "0099-12-31", "1899-12-31", "9999-12-31"])("accepts calendar dates: %s", (date) => {
    expect(isRecordFilterDate(date)).toBe(true);
  });
  it.each(["2026-02-29", "2026-04-31", "0000-01-01", "2026-13-01", "2026-1-01", "2026/01/01", "2026-01-"])("rejects invalid dates: %s", (date) => {
    expect(recordFilterError({ fromDate: date })).toContain("実在する日付");
  });
  it("allows open bounds and same-day bounds but rejects a reversed range", () => {
    expect(recordFilterError(emptyRecordFilters)).toBe("");
    expect(recordFilterError({ toDate: "2026-10-06" })).toBe("");
    expect(recordFilterError({ fromDate: "2026-10-06", toDate: "2026-10-06" })).toBe("");
    expect(recordFilterError({ fromDate: "2026-10-07", toDate: "2026-10-06" })).toContain("開始日以降");
    expect(hasRecordFilters({ keyword: "　\n" })).toBe(false);
    expect(hasRecordFilters({ recordType: "locked" })).toBe(true);
  });
  it("matches complete tags with AND semantics, normalization and Japanese commas", () => {
    expect(matchesRecordTags("Work, 体調, 年末", "ｗｏｒｋ、体調")).toBe(true);
    expect(matchesRecordTags("Work, 体調", "Work, missing")).toBe(false);
    expect(matchesRecordTags("Homework", "Work")).toBe(false);
    expect(matchesRecordTags(null, "")).toBe(true);
  });
  it("sanitizes unsupported fields and ignores unrelated route parameters", () => {
    expect(sanitizeRecordFilters({ keyword: "hello", recordType: "diary", tags: "work", fromDate: 3 }, ["locked"], false))
      .toEqual({ ...emptyRecordFilters, keyword: "hello" });
    expect(recordFiltersFromParams({ fromDate: ["2026-01-01", "ignored"], tags: "work", section: "record" }))
      .toEqual({ fromDate: "2026-01-01", tags: "work" });
    expect(recordFiltersFromParams({ section: "record" })).toBe(null);
  });
});
