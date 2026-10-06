import { describe, expect, it } from "vitest";
import type { ChastityRecord, ChastityStatus } from "../../services/chastityHistoryService";
import { getDailyChastityStatuses, selectChastityRecords } from "./history";

const statusNames = {
  locked: ["ロック済", "Locked", "🔒"], wetDream: ["夢精", "Wet dream", "💦"],
  ejaculation: ["射精", "Ejaculation", "×"], washing: ["洗浄", "Washing", "🚿"],
};
function record(id: string, overrides: Partial<ChastityRecord> = {}): ChastityRecord {
  return { id, recordDate: "2026-10-06", status: "locked", note: "",
    createdAt: "2026-10-06T12:00:00.000Z", updatedAt: "2026-10-06T12:00:00.000Z", ...overrides };
}
const records = Object.freeze([
  Object.freeze(record("old", { recordDate: "2026-03-02", status: "washing", note: "Blue soap" })),
  Object.freeze(record("earlier", { createdAt: "2026-10-06T08:00:00.000Z" })),
  Object.freeze(record("latest", { note: "Original\ntext" })),
  Object.freeze(record("dream", { status: "wetDream" })),
]);

function permutations(values: readonly ChastityStatus[]): ChastityStatus[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, position) => position !== index))
    .map((remaining) => [value, ...remaining]));
}

describe("chastity record calendar and search", () => {
  it("keeps multiple records on the selected date and shows the newest first", () => {
    expect(selectChastityRecords(records, "2026-10-06", "", statusNames).map((item) => item.id))
      .toEqual(["latest", "dream", "earlier"]);
    expect(selectChastityRecords(records, "2026-03-02", "　\n ", statusNames).map((item) => item.id)).toEqual(["old"]);
  });
  it.each(["洗浄", "WASHING", "🚿", "2026/3/2", "2026年3月2日", "ｂｌｕｅ soap"])("finds a record across dates: %s", (keyword) => {
    expect(selectChastityRecords(records, "2026-10-06", keyword, statusNames).map((item) => item.id)).toEqual(["old"]);
  });
  it("combines note, date and translated status tokens without changing user notes", () => {
    expect(selectChastityRecords(records, "2026-10-06", "2026-03 Washing blue", statusNames)[0].id).toBe("old");
    expect(selectChastityRecords(records, "2026-10-06", "washing dream", statusNames)).toEqual([]);
    expect(selectChastityRecords(records, "2026-10-06", "original", statusNames)[0].note).toBe("Original\ntext");
    expect(records.map((item) => item.id)).toEqual(["old", "earlier", "latest", "dream"]);
  });
  it("retains each different daily status and collapses duplicate icons only", () => {
    expect(getDailyChastityStatuses(records)).toEqual({ "2026-03-02": ["washing"], "2026-10-06": ["locked", "wetDream"] });
    expect(getDailyChastityStatuses([])).toEqual({});
  });
  it.each(permutations(["locked", "wetDream", "ejaculation", "washing"]).map((order) => [order]))(
    "uses the fixed icon order regardless of record order: %j",
    (order) => {
      const input = Object.freeze([
        ...order.map((status, index) => Object.freeze(record(String(index), { status }))),
        Object.freeze(record("duplicate", { status: order[0] })),
        Object.freeze(record("previous-washing", { recordDate: "2026-10-05", status: "washing" })),
        Object.freeze(record("previous-dream", { recordDate: "2026-10-05", status: "wetDream" })),
      ]);
      expect(getDailyChastityStatuses(input)).toEqual({
        "2026-10-06": ["locked", "wetDream", "ejaculation", "washing"],
        "2026-10-05": ["wetDream", "washing"],
      });
      expect(input.slice(0, 4).map((item) => item.status)).toEqual(order);
    },
  );
});
