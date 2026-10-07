import { describe, expect, it } from "vitest";
import { createEnduranceGame, failEnduranceSlide, finishEndurance } from "./game";
import { addEnduranceResult, createEnduranceSession, ENDURANCE_CURRENT_KEY, ENDURANCE_HISTORY_KEY, ENDURANCE_UNLOCK_KEY, parseEnduranceCurrent, parseEnduranceHistory, parseEnduranceUnlock, validateEnduranceSettings } from "./storage";
import { advanceCountdown, createCountdown, startCountdown } from "../sugoroku/countdown";

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

function current() {
  return createEnduranceSession({
    game: { ...createEnduranceGame("game-1", 4, "2026-10-06T00:00:00.000Z"), id: "endurance-current" },
    mediaIds: ["game-1-3", "game-1-1", "game-1-4", "game-1-2"],
    slideTimer: createCountdown(60_000), extraTimer: createCountdown(180_000),
    videoProgress: { positionMs: 0, durationMs: null }, videoComplete: false,
  });
}

describe("endurance active session validation", () => {
  it("keeps the shuffled order and freezes running timers without advancing the slide while away", () => {
    const session = createEnduranceSession({ ...current(), slideTimer: startCountdown(60_000, 1000) }, 26_000);
    expect(session.slideTimer).toEqual({ status: "paused", durationMs: 60_000, remainingMs: 35_000, deadline: null });
    expect(session.game.index).toBe(0);
    expect(advanceCountdown(session.slideTimer, 1_000_000)).toEqual(session.slideTimer);
    expect(parseEnduranceCurrent(JSON.stringify(session))).toEqual(session);
    expect(session.mediaIds).toEqual(["game-1-3", "game-1-1", "game-1-4", "game-1-2"]);
    const expired = createEnduranceSession({ ...current(), slideTimer: startCountdown(60_000, 1000) }, 61_000);
    expect(expired.slideTimer).toMatchObject({ status: "complete", remainingMs: 0, deadline: null });
    expect(expired.game.index).toBe(0);
  });

  it("preserves a recovery checkpoint and custom file identities as detached snapshots", () => {
    const input = { ...current(), game: failEnduranceSlide(createEnduranceGame("custom", 2)),
      mediaIds: ["training:second.jpg", "endurance:first.mp4"], extraTimer: startCountdown(180_000, 1000) };
    const session = createEnduranceSession(input, 11_000);
    input.mediaIds.reverse(); input.game.failures = 2;
    expect(session.game).toMatchObject({ recovering: true, failures: 1, failedIndex: 0 });
    expect(session.mediaIds).toEqual(["training:second.jpg", "endurance:first.mp4"]);
    expect(session.extraTimer).toMatchObject({ status: "paused", remainingMs: 170_000, deadline: null });
    expect(parseEnduranceCurrent(JSON.stringify(session))).toEqual(session);
  });

  it("preserves video position and completion and permits old backups with no active session", () => {
    const session = createEnduranceSession({ ...current(), game: createEnduranceGame("game-6", 1), mediaIds: ["game-6-1"],
      videoProgress: { positionMs: 60_000, durationMs: 60_000 }, videoComplete: true });
    expect(parseEnduranceCurrent(JSON.stringify(session))).toEqual(session);
    expect(parseEnduranceCurrent(null)).toBeNull();
    expect(() => validateEnduranceSettings([])).not.toThrow();
  });

  it.each([
    { index: -1 }, { index: 4 }, { total: 3 }, { recovering: true },
    { failures: 1 }, { failedIndex: 0 }, { failures: 1, failedIndex: 0, recovering: false },
    { index: 3, failures: 2, failedIndex: 3, recovering: true }, { startedAt: "invalid" },
  ])("rejects an impossible current game: %j", (change) => {
    const session = current();
    expect(() => parseEnduranceCurrent(JSON.stringify({ ...session, game: { ...session.game, ...change } }))).toThrow();
  });

  it.each([
    ["game-1-1"], ["game-1-1", "game-1-1", "game-1-3", "game-1-4"],
    [1, 2, 3, 4], ["file:///one", "blob:two", "data:three", "http://four"],
    ["game-2-1", "game-1-2", "game-1-3", "game-1-4"],
  ])("rejects incomplete, duplicate, URI or mismatched media references: %j", (...mediaIds) => {
    expect(() => parseEnduranceCurrent(JSON.stringify({ ...current(), mediaIds }))).toThrow();
  });

  it("rejects resource paths and excessive media counts in custom sessions", () => {
    const session = createEnduranceSession({ ...current(), game: createEnduranceGame("custom", 1), mediaIds: ["endurance:one.jpg"] });
    for (const mediaIds of [["file:///one.jpg"], ["endurance:../one.jpg"], ["endurance:one\\two.jpg"], Array.from({ length: 101 }, (_, i) => `endurance:${i}.jpg`)]) {
      expect(() => parseEnduranceCurrent(JSON.stringify({ ...session, mediaIds }))).toThrow();
    }
  });

  it.each([
    { status: "running", deadline: 12345 }, { status: "idle", remainingMs: 1 },
    { status: "complete", remainingMs: 1 }, { status: "paused", remainingMs: 0 },
    { durationMs: 180_000 }, { remainingMs: -1 }, { remainingMs: 60_001 }, { remainingMs: 1.5 }, { deadline: 0 },
  ])("rejects running or inconsistent saved timers: %j", (change) => {
    const session = current();
    expect(() => parseEnduranceCurrent(JSON.stringify({ ...session, slideTimer: { ...session.slideTimer, ...change } }))).toThrow();
  });

  it("rejects corrupt video values and unrecognized URI-bearing fields before backup restore", () => {
    const session = createEnduranceSession({ ...current(), game: createEnduranceGame("game-6", 1), mediaIds: ["game-6-1"] });
    for (const change of [
      { videoProgress: { positionMs: -1, durationMs: null } }, { videoProgress: { positionMs: 61_000, durationMs: 60_000 } },
      { videoProgress: { positionMs: 1.5, durationMs: null } }, { videoComplete: "true" }, { media: [{ uri: "blob:one" }] },
    ]) expect(() => parseEnduranceCurrent(JSON.stringify({ ...session, ...change }))).toThrow();
    const row = { setting_key: ENDURANCE_CURRENT_KEY, setting_value: JSON.stringify(session) };
    expect(() => validateEnduranceSettings([row])).not.toThrow();
    expect(() => validateEnduranceSettings([row, row])).toThrow();
    expect(() => validateEnduranceSettings([{ ...row, setting_value: "broken" }])).toThrow();
    expect(() => validateEnduranceSettings([{ ...row, setting_value: "null" }])).toThrow();
  });
});
