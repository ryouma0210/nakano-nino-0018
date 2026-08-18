import { describe, expect, it } from "vitest";
import { parseTags, secondsToClock, toDateKey } from "../../../shared/date";

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
});
