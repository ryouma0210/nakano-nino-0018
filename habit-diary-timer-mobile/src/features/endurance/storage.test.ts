import { describe, expect, it } from "vitest";
import { createEnduranceGame, failEnduranceSlide, finishEndurance } from "./game";
import { addEnduranceResult, ENDURANCE_HISTORY_KEY, ENDURANCE_UNLOCK_KEY, parseEnduranceHistory, parseEnduranceUnlock, validateEnduranceSettings } from "./storage";

function result(id = "endurance-test") {
  return finishEndurance({ ...createEnduranceGame("game-1", 4, "2026-10-06T00:00:00.000Z"), id, index: 3 }, false, "2026-10-06T01:00:00.000Z");
}
describe("endurance history validation", () => {
  it("starts empty without unlocking unpublished games", () => {
    expect(parseEnduranceHistory(null)).toEqual({ version: 1, history: [] });
    expect(parseEnduranceUnlock(null)).toBe(false);
    expect(parseEnduranceUnlock("true")).toBe(true);
  });
  it("keeps only 100 newest results and is idempotent on save retries", () => {
    let saved = parseEnduranceHistory(null);
    for (let index = 0; index < 105; index++) saved = addEnduranceResult(saved, {
      ...result(`endurance-${index}`), finishedAt: new Date(Date.UTC(2026, 9, 6, 1, 0, index)).toISOString(),
    });
    expect(saved.history).toHaveLength(100);
    expect(saved.history[0].id).toBe("endurance-104");
    expect(saved.history[99].id).toBe("endurance-5");
    const retried = addEnduranceResult(saved, { ...saved.history[0], finishedAt: "2026-10-06T02:00:00.000Z" });
    expect(retried).toBe(saved);
    expect(parseEnduranceHistory(JSON.stringify(saved))).toEqual(saved);
  });
  it.each(["bad json", "null", "[]", '{"version":2,"history":[]}', '{"version":1,"history":[{}]}'])("rejects malformed history %s", (raw) => {
    expect(() => parseEnduranceHistory(raw)).toThrow();
  });
  it("rejects duplicate results and inconsistent failures or dates", () => {
    const entry = result();
    expect(() => parseEnduranceHistory(JSON.stringify({ version: 1, history: [entry, entry] }))).toThrow();
    for (const change of [{ failedIndex: 1 }, { failures: 1 }, { outcome: "cleared", index: 0 }, { finishedAt: "2025-01-01" }, { total: 3 }]) {
      expect(() => parseEnduranceHistory(JSON.stringify({ version: 1, history: [{ ...entry, ...change }] }))).toThrow();
    }
  });
  it.each(["false", '"true"', "1", "null", "bad"])("does not interpret malformed unlock data as a successful unlock: %s", (raw) => {
    expect(() => parseEnduranceUnlock(raw)).toThrow();
  });
  it("validates backup rows without affecting unrelated settings", () => {
    const history = { setting_key: ENDURANCE_HISTORY_KEY, setting_value: JSON.stringify({ version: 1, history: [result()] }) };
    const unlock = { setting_key: ENDURANCE_UNLOCK_KEY, setting_value: "true" };
    expect(() => validateEnduranceSettings([history, unlock, { setting_key: "other", setting_value: "anything" }])).not.toThrow();
    expect(() => validateEnduranceSettings([history, history])).toThrow();
    expect(() => validateEnduranceSettings([{ ...unlock, setting_value: true }])).toThrow();
  });
  it("round-trips mixed old history and cleared, failed or retired video positions without changing the payload version", () => {
    const oldVideo = finishEndurance(createEnduranceGame("game-6", 1, "2026-10-06T00:00:00.000Z"), true, "2026-10-06T01:00:00.000Z");
    const history = [result(), oldVideo, ...(["cleared", "failed", "retired"] as const).map((outcome) => {
      const video = createEnduranceGame("game-6", 1, "2026-10-06T00:00:00.000Z");
      return finishEndurance(outcome === "failed" ? failEnduranceSlide(video) : video, outcome === "retired", "2026-10-06T01:00:00.000Z",
        { positionMs: outcome === "cleared" ? 60_000 : 12_345, durationMs: 60_000 });
    })];
    const payload = { version: 1 as const, history };
    expect(parseEnduranceHistory(JSON.stringify(payload))).toEqual(payload);
    expect(() => validateEnduranceSettings([{ setting_key: ENDURANCE_HISTORY_KEY, setting_value: JSON.stringify(payload) }])).not.toThrow();
    expect(parseEnduranceHistory(JSON.stringify(payload)).history[1]).not.toHaveProperty("videoProgress");
  });
  it("rejects malformed video progress before adding a result or accepting backup rows", () => {
    const video = finishEndurance(createEnduranceGame("game-6", 1, "2026-10-06T00:00:00.000Z"), true, "2026-10-06T01:00:00.000Z", { positionMs: 61_000, durationMs: 60_000 });
    const saved = { version: 1 as const, history: [result()] };
    expect(() => addEnduranceResult(saved, video)).toThrow();
    expect(saved.history).toHaveLength(1);
    expect(() => validateEnduranceSettings([{ setting_key: ENDURANCE_HISTORY_KEY, setting_value: JSON.stringify({ ...saved, history: [video] }) }])).toThrow();
  });
});
