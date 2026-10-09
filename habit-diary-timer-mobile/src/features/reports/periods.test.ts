import { describe, expect, it } from "vitest";
import { dailyComparison, monthlyComparison, shiftReportDate, shiftReportMonth, validReportDate, validReportMonth, validReportPeriod, weeklyComparison } from "./periods";

describe("report comparison periods", () => {
  it("compares disjoint seven-day periods across the year boundary", () => {
    expect(weeklyComparison("2026-01-03")).toEqual({
      current: { startDate: "2025-12-28", endDate: "2026-01-03" },
      previous: { startDate: "2025-12-21", endDate: "2025-12-27" },
    });
  });
  it("compares month-to-date with the same portion of the previous month", () => {
    expect(monthlyComparison("2026-10", "2026-10-07")).toEqual({
      current: { startDate: "2026-10-01", endDate: "2026-10-07" },
      previous: { startDate: "2026-09-01", endDate: "2026-09-07" },
    });
  });
  it("uses full historical months, including leap years", () => {
    expect(monthlyComparison("2024-03", "2026-10-07")).toEqual({
      current: { startDate: "2024-03-01", endDate: "2024-03-31" },
      previous: { startDate: "2024-02-01", endDate: "2024-02-29" },
    });
    expect(monthlyComparison("2026-01", "2026-10-07").previous).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
  });
  it("caps a shorter previous month and compares complete months at month-end", () => {
    expect(monthlyComparison("2026-03", "2026-03-30").previous.endDate).toBe("2026-02-28");
    expect(monthlyComparison("2026-02", "2026-02-28").previous.endDate).toBe("2026-01-31");
  });
  it("moves by calendar days instead of elapsed 24-hour intervals", () => {
    expect(shiftReportDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftReportDate("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftReportMonth("2026-01", -1)).toBe("2025-12");
    expect(dailyComparison("2026-01-01").previous.startDate).toBe("2025-12-31");
  });
  it("rejects impossible dates and future report months", () => {
    for (const date of ["2026-02-29", "2026-04-31", "2026-1-01", "2026-13-01", "", "2026-01-00"]) expect(validReportDate(date)).toBe(false);
    expect(validReportDate("2024-02-29")).toBe(true);
    expect(validReportMonth("2026-13")).toBe(false);
    expect(() => monthlyComparison("2026-11", "2026-10-07")).toThrow();
  });
  it("keeps reports limited to 1900–9999 after sharing calendar syntax validation", () => {
    for (const year of ["0001", "1899"]) {
      expect(validReportDate(`${year}-12-31`)).toBe(false);
      expect(validReportMonth(`${year}-12`)).toBe(false);
    }
    for (const year of ["1900", "9999"]) {
      expect(validReportDate(`${year}-01-01`)).toBe(true);
      expect(validReportMonth(`${year}-01`)).toBe(true);
    }
    expect(validReportDate("1900-02-29")).toBe(false);
    expect(validReportDate("2000-02-29")).toBe(true);
  });
  it("allows comparison periods in 1899 when the selected day, week, or month starts in 1900", () => {
    const comparisons = [
      dailyComparison("1900-01-01"),
      weeklyComparison("1900-01-01"),
      weeklyComparison("1900-01-07"),
      monthlyComparison("1900-01", "2026-10-07"),
    ];
    for (const comparison of comparisons) {
      expect(validReportPeriod(comparison.current)).toBe(true);
      expect(validReportPeriod(comparison.previous)).toBe(true);
      expect(comparison.previous.startDate.startsWith("1899-")).toBe(true);
    }
    expect(validReportDate("1899-12-31")).toBe(false);
    expect(validReportMonth("1899-12")).toBe(false);
    expect(validReportPeriod({ startDate: "0000-12-31", endDate: "0001-01-01" })).toBe(false);
    expect(validReportPeriod({ startDate: "1900-01-02", endDate: "1900-01-01" })).toBe(false);
  });
});
