import { afterEach, describe, expect, it, vi } from "vitest";
import { isDateKey } from "@nino/shared/date";
import { calendarMonthGrid, daysInCalendarMonth, getPickerFocus, getPickerLimits,
  isPickerValueSelectable, monthHasSelectableDay, stepCalendarMonth, yearBlock } from "./model";

afterEach(() => vi.useRealTimers());

describe("calendar month grid", () => {
  it("starts weeks on Sunday and includes leading and trailing blanks", () => {
    const grid = calendarMonthGrid("2026-10");
    expect(grid).toHaveLength(42);
    expect(grid.slice(0, 7)).toEqual([null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(grid.filter(Boolean)).toHaveLength(31);
    expect(grid[34]).toBe("2026-10-31");
    expect(grid.slice(35)).toEqual(Array(7).fill(null));
  });

  it("places a Sunday start in the first cell and a long Saturday-start month in six weeks", () => {
    expect(calendarMonthGrid("2026-02")[0]).toBe("2026-02-01");
    const grid = calendarMonthGrid("2026-08");
    expect(grid[6]).toBe("2026-08-01");
    expect(grid[36]).toBe("2026-08-31");
  });

  it.each([["0004-02", 29], ["0096-02", 29], ["0100-02", 28], ["1900-02", 28], ["2000-02", 29], ["2024-02", 29], ["2026-02", 28]] as const)
    ("uses Gregorian leap rules in %s", (month, count) => {
      expect(daysInCalendarMonth(month)).toBe(count);
      expect(calendarMonthGrid(month).filter(Boolean)).toHaveLength(count);
    });

  it.each(["0001-01", "0099-12", "9999-12"])("keeps four-digit years and valid days at the supported edges: %s", (month) => {
    const days = calendarMonthGrid(month).filter((day): day is string => day !== null);
    expect(days[0]).toBe(`${month}-01`);
    expect(days.every((day) => day.startsWith(month) && isDateKey(day))).toBe(true);
    expect(new Set(days).size).toBe(daysInCalendarMonth(month));
  });

  it("does not remap year 1 to 1901 when calculating the weekday", () => {
    expect(calendarMonthGrid("0001-01").slice(0, 3)).toEqual([null, "0001-01-01", "0001-01-02"]);
  });
});

describe("picker limits and initial focus", () => {
  const bounds = { minimum: "2026-10-03", maximum: "2026-10-20" };
  it("uses inclusive bounds and rejects impossible days and malformed keys", () => {
    expect(isPickerValueSelectable("2026-10-03", "day", bounds)).toBe(true);
    expect(isPickerValueSelectable("2026-10-20", "day", bounds)).toBe(true);
    for (const value of ["2026-10-02", "2026-10-21", "2026-02-29", "2026-10", "2026-1-03"]) {
      expect(isPickerValueSelectable(value, "day", bounds)).toBe(false);
    }
  });

  it("allows a partial month when any day intersects the day bounds", () => {
    const leapDay = { minimum: "2024-02-29", maximum: "2024-02-29" };
    expect(monthHasSelectableDay("2024-02", leapDay)).toBe(true);
    expect(monthHasSelectableDay("2024-01", leapDay)).toBe(false);
    expect(monthHasSelectableDay("2024-03", leapDay)).toBe(false);
    expect(monthHasSelectableDay("2026-10", bounds)).toBe(true);
    expect(monthHasSelectableDay("2026-13", bounds)).toBe(false);
  });

  it("supports month-only limits across a year boundary", () => {
    const months = { minimum: "2025-12", maximum: "2026-02" };
    for (const month of ["2025-12", "2026-01", "2026-02"]) expect(isPickerValueSelectable(month, "month", months)).toBe(true);
    for (const month of ["2025-11", "2026-03", "2026-01-01"]) expect(isPickerValueSelectable(month, "month", months)).toBe(false);
    expect(getPickerFocus("", "month", months, "2026-10-07")).toBe("2026-02");
  });

  it("focuses the selection or local today and clamps either to the available range", () => {
    expect(getPickerFocus("2026-10-12", "day", bounds, "2026-10-07")).toBe("2026-10-12");
    expect(getPickerFocus("2026-10-01", "day", bounds, "2026-10-07")).toBe("2026-10-03");
    expect(getPickerFocus("2026-11-01", "day", bounds, "2026-10-07")).toBe("2026-10-20");
    expect(getPickerFocus("not-a-date", "day", bounds, "2026-10-07")).toBe("2026-10-07");
    expect(getPickerFocus("", "day", bounds, "2026-11-01")).toBe("2026-10-20");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 7, 23, 59));
    expect(getPickerFocus("", "day")).toBe("2026-10-07");
    expect(getPickerFocus("", "month")).toBe("2026-10");
  });

  it("ignores malformed optional limits but leaves reversed ranges unselectable", () => {
    expect(getPickerLimits("day", { minimum: "invalid", maximum: "2026-02-29" }))
      .toEqual({ minimum: "0001-01-01", maximum: "9999-12-31", valid: true });
    const reversed = { minimum: "2026-10-20", maximum: "2026-10-03" };
    expect(getPickerLimits("day", reversed).valid).toBe(false);
    expect(isPickerValueSelectable("2026-10-12", "day", reversed)).toBe(false);
    expect(monthHasSelectableDay("2026-10", reversed)).toBe(false);
    expect(getPickerFocus("", "day", reversed, "2026-10-07")).toBe("2026-10-20");
  });

  it("keeps the local-today fallback in four-digit form for early supported years", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const early = new Date(0);
    early.setFullYear(1, 0, 1);
    early.setHours(12, 0, 0, 0);
    vi.setSystemTime(early);
    expect(getPickerFocus("", "day")).toBe("0001-01-01");
    expect(getPickerFocus("", "month")).toBe("0001-01");
  });
});

describe("month and year navigation", () => {
  it("crosses years without losing zero-padded early years", () => {
    expect(stepCalendarMonth("2025-12", 1)).toBe("2026-01");
    expect(stepCalendarMonth("2026-01", -1)).toBe("2025-12");
    expect(stepCalendarMonth("0099-12", 1)).toBe("0100-01");
    expect(stepCalendarMonth("0001-01", 13)).toBe("0002-02");
  });

  it("clamps large steps to supported years and does not produce year 0 or 10000", () => {
    expect(stepCalendarMonth("0001-01", -1)).toBe("0001-01");
    expect(stepCalendarMonth("9999-12", 1)).toBe("9999-12");
    expect(stepCalendarMonth("2026-10", -1_000_000)).toBe("0001-01");
    expect(stepCalendarMonth("2026-10", 1_000_000)).toBe("9999-12");
    expect(stepCalendarMonth("2026-10", NaN)).toBe("2026-10");
  });

  it("keeps 12-year blocks inside the supported calendar", () => {
    expect(yearBlock(1)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(yearBlock(2026)).toEqual(Array.from({ length: 12 }, (_, index) => 2017 + index));
    const block = yearBlock(2026);
    expect(yearBlock(block[0] - 12).at(-1)).toBe(block[0] - 1);
    expect(yearBlock(block[0] + 12)[0]).toBe(block.at(-1)! + 1);
    expect(yearBlock(9999)).toEqual([9997, 9998, 9999]);
    expect(yearBlock(0)).toEqual(yearBlock(1));
    expect(yearBlock(10000)).toEqual(yearBlock(9999));
  });

  it("rejects invalid display months instead of silently navigating a different year", () => {
    expect(() => stepCalendarMonth("2026-13", 1)).toThrow(RangeError);
    expect(() => calendarMonthGrid("0000-01")).toThrow(RangeError);
  });
});
