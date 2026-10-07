import { describe, expect, it } from "vitest";
import { isDateKey, isMonthKey, parseTags, secondsToClock, toDateKey } from "../../../shared/date";

describe("date utilities", () => {
  it("formats local dates without UTC rollover", () => {
    expect(toDateKey(new Date(2026, 0, 2, 23, 59))).toBe("2026-01-02");
  });
  it.each([[0, "00:00"], [65, "01:05"], [3661, "01:01:01"]])("formats %s seconds", (seconds, expected) => {
    expect(secondsToClock(seconds as number)).toBe(expected);
  });
  it("normalizes tags", () => {
    expect(parseTags("日記, 運動、朝  習慣")).toEqual(["日記", "運動", "朝", "習慣"]);
  });

  it.each(["0001-01-01", "0096-02-29", "1900-01-01", "2000-02-29", "2024-02-29", "9999-12-31"])
    ("accepts real zero-padded calendar dates, including years below 100: %s", (value) => {
      expect(isDateKey(value)).toBe(true);
    });

  it.each(["0000-01-01", "1900-02-29", "2026-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-1-01", "2026/01/01", "10000-01-01", "2026-01-01 ", ""])
    ("rejects impossible dates and noncanonical syntax: %s", (value) => {
      expect(isDateKey(value)).toBe(false);
    });

  it("validates months without imposing a feature-specific year range", () => {
    for (const value of ["0001-01", "1899-12", "2026-02", "9999-12"]) expect(isMonthKey(value)).toBe(true);
    for (const value of ["0000-01", "2026-00", "2026-13", "2026-2", "2026-02-01", " 2026-02"]) expect(isMonthKey(value)).toBe(false);
  });
});
