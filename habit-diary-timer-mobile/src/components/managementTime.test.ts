import { describe, expect, it } from "vitest";
import { managementDeadlineLabel, managementRemainingTime } from "./managementTime";

describe("management deadline display", () => {
  it("retains sub-day extensions and rounds remaining fractional seconds up", () => {
    const now = new Date(2026, 9, 6, 12, 0, 0).getTime();
    expect(managementRemainingTime(new Date(now + 300_001).toISOString(), now)).toEqual({ days: 0, clock: "00:05:01" });
    expect(managementRemainingTime(new Date(now + 104_703_000).toISOString(), now)).toEqual({ days: 1, clock: "05:05:03" });
    expect(managementRemainingTime(new Date(now - 1).toISOString(), now)).toEqual({ days: 0, clock: "00:00:00" });
  });
  it("displays a saved timestamp in the device's local time", () => {
    expect(managementDeadlineLabel(new Date(2026, 9, 6, 9, 5, 3).toISOString())).toBe("2026/10/06 09:05:03");
  });
});
