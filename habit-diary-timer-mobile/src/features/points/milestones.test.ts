import { describe, expect, it } from "vitest";
import { POINT_MILESTONE_SETTING_KEY, parsePointMilestoneState, validatePointMilestoneSettings } from "./milestones";

describe("point milestone backup data", () => {
  it("accepts legacy backups without milestone data and current valid records", () => {
    expect(parsePointMilestoneState(null)).toEqual({ version: 1, unlocked: [], acknowledged: [] });
    expect(() => validatePointMilestoneSettings([{ setting_key: "unrelated", setting_value: "anything" }])).not.toThrow();
    const state = { version: 1, unlocked: ["points-100", "points-500"], acknowledged: ["points-100"] };
    expect(parsePointMilestoneState(JSON.stringify(state))).toEqual(state);
    expect(() => validatePointMilestoneSettings([{ setting_key: POINT_MILESTONE_SETTING_KEY, setting_value: JSON.stringify(state) }])).not.toThrow();
  });

  it.each([
    "broken", "null", "[]", "{}",
    JSON.stringify({ version: 2, unlocked: [], acknowledged: [] }),
    JSON.stringify({ version: 1, unlocked: ["other"], acknowledged: [] }),
    JSON.stringify({ version: 1, unlocked: ["points-100", "points-100"], acknowledged: [] }),
    JSON.stringify({ version: 1, unlocked: [null], acknowledged: [] }),
    JSON.stringify({ version: 1, unlocked: [], acknowledged: ["points-100"] }),
    JSON.stringify({ version: 1, unlocked: ["points-100"], acknowledged: ["points-100", "points-100"] }),
  ])("rejects malformed milestone data: %s", (raw) => {
    expect(() => parsePointMilestoneState(raw)).toThrow("ポイントイベント");
    expect(() => validatePointMilestoneSettings([{ setting_key: POINT_MILESTONE_SETTING_KEY, setting_value: raw }])).toThrow("ポイントイベント");
  });

  it("rejects duplicate keys and non-string values before backup restoration", () => {
    const row = { setting_key: POINT_MILESTONE_SETTING_KEY, setting_value: JSON.stringify({ version: 1, unlocked: [], acknowledged: [] }) };
    expect(() => validatePointMilestoneSettings([row, row])).toThrow("ポイントイベント");
    expect(() => validatePointMilestoneSettings([{ ...row, setting_value: null }])).toThrow("ポイントイベント");
  });
});
