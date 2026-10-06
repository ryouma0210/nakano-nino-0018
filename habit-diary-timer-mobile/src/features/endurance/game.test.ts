import { describe, expect, it } from "vitest";
import { hasCompleteEnduranceAssets } from "./media";
import {
  advanceEndurance, canAdvanceEndurance, createEnduranceGame, failEnduranceSlide, finishEndurance,
  isEnduranceResult, remainingEnduranceSlides,
} from "./game";
import { advanceCountdown, pauseCountdown, resumeCountdown, startCountdown } from "../sugoroku/countdown";

const startedAt = "2026-10-06T00:00:00.000Z";
const finishedAt = "2026-10-06T00:10:00.000Z";
const game = () => createEnduranceGame("game-1", 4, startedAt);

describe("endurance progression", () => {
  it("keeps a slide in place before the minute ends and until an explicit advance", () => {
    const start = game();
    expect(canAdvanceEndurance(start, false, false)).toBe(false);
    expect(advanceEndurance(start, false, true)).toBe(start);
    expect(canAdvanceEndurance(start, true, false)).toBe(true);
    expect(start.index).toBe(0);
    expect(advanceEndurance(start, true, false).index).toBe(1);
  });
  it("requires a new three-minute recovery after a failure even when the slide minute is done", () => {
    const start = game();
    const failed = failEnduranceSlide(start);
    expect(failed).toMatchObject({ failedIndex: 0, failures: 1, recovering: true });
    expect(failEnduranceSlide(failed)).toBe(failed);
    expect(advanceEndurance(failed, true, false)).toBe(failed);
    const next = advanceEndurance(failed, false, true);
    expect(next).toMatchObject({ index: 1, failedIndex: 0, failures: 1, recovering: false });
    expect(canAdvanceEndurance(next, false, false)).toBe(false);
  });
  it("retains the first failed slide and failure count through the final slide", () => {
    let state = advanceEndurance(game(), true, false);
    state = advanceEndurance(failEnduranceSlide(state), false, true);
    state = advanceEndurance(failEnduranceSlide(state), false, true);
    const result = finishEndurance(state, false, finishedAt);
    expect(result).toMatchObject({ index: 3, failedIndex: 1, failures: 2, outcome: "failed" });
    expect(isEnduranceResult(result)).toBe(true);
    expect(remainingEnduranceSlides(result)).toBe(3);
    expect(advanceEndurance(state, true, true)).toBe(state);
  });
  it("clears only after all slides, while retirement records the current slide", () => {
    const state = game();
    expect(isEnduranceResult(finishEndurance(state, false, finishedAt))).toBe(false);
    const retired = finishEndurance(state, true, finishedAt);
    expect(isEnduranceResult(retired)).toBe(true);
    expect(remainingEnduranceSlides(retired)).toBe(4);
    const cleared = finishEndurance({ ...state, index: 3 }, false, finishedAt);
    expect(cleared.outcome).toBe("cleared");
    expect(remainingEnduranceSlides(cleared)).toBe(0);
  });
  it("counts remaining slides from retirement even after an earlier failed slide", () => {
    let state = advanceEndurance(failEnduranceSlide(game()), false, true);
    state = advanceEndurance(state, true, false);
    const retired = finishEndurance(state, true, finishedAt);
    expect(retired).toMatchObject({ index: 2, failedIndex: 0, outcome: "retired" });
    expect(isEnduranceResult(retired)).toBe(true);
    expect(remainingEnduranceSlides(retired)).toBe(2);
  });
  it.each([0, 3, 5, -1, 1.2, 101])("rejects an invalid preset media count: %s", (count) => {
    expect(() => createEnduranceGame("game-1", count)).toThrow();
  });
  it("allows one video and bounded custom slides", () => {
    expect(createEnduranceGame("game-6", 1).total).toBe(1);
    expect(createEnduranceGame("custom", 100).total).toBe(100);
    expect(() => createEnduranceGame("custom", 101)).toThrow();
  });
  it("does not count the time spent in the background toward a paused minute", () => {
    const paused = pauseCountdown(startCountdown(60_000, 0), 25_000);
    expect(advanceCountdown(paused, 500_000)).toBe(paused);
    const resumed = resumeCountdown(paused, 500_000);
    expect(advanceCountdown(resumed, 534_999).status).toBe("running");
    expect(advanceCountdown(resumed, 535_000).status).toBe("complete");
  });
  it("requires all four preset images or exactly one preset video", () => {
    const image = { id: "image", label: "1", kind: "image" as const, source: { uri: "fixture" } };
    const video = { id: "video", label: "1", kind: "video" as const, source: { uri: "fixture" } };
    expect(hasCompleteEnduranceAssets("game-1", [])).toBe(false);
    expect(hasCompleteEnduranceAssets("game-1", [image, image, image])).toBe(false);
    expect(hasCompleteEnduranceAssets("game-1", [image, image, image, video])).toBe(false);
    expect(hasCompleteEnduranceAssets("game-1", [image, image, image, image])).toBe(true);
    expect(hasCompleteEnduranceAssets("game-6", [image])).toBe(false);
    expect(hasCompleteEnduranceAssets("game-6", [video])).toBe(true);
    expect(hasCompleteEnduranceAssets("custom", [image, video])).toBe(true);
  });
});

describe("video progress snapshots", () => {
  const video = () => createEnduranceGame("game-6", 1, startedAt);
  it("can finish a video failure immediately without a recovery timer or next slide", () => {
    const result = finishEndurance(failEnduranceSlide(video()), false, finishedAt, { positionMs: 12_345, durationMs: 60_000 });
    expect(result).toMatchObject({ index: 0, failedIndex: 0, failures: 1, outcome: "failed", videoProgress: { positionMs: 12_345, durationMs: 60_000 } });
    expect(result).not.toHaveProperty("recovering");
    expect(isEnduranceResult(result)).toBe(true);
  });

  it.each(["cleared", "failed", "retired"] as const)("records independent progress snapshots for a %s result", (outcome) => {
    const progress = { positionMs: outcome === "cleared" ? 60_000 : 12_345, durationMs: 60_000 };
    const result = finishEndurance(outcome === "failed" ? failEnduranceSlide(video()) : video(), outcome === "retired", finishedAt, progress);
    expect(result.outcome).toBe(outcome); expect(result.videoProgress).toEqual(progress); expect(isEnduranceResult(result)).toBe(true);
    progress.positionMs = 0; expect(result.videoProgress?.positionMs).toBe(outcome === "cleared" ? 60_000 : 12_345);
  });

  it("accepts unknown duration and legacy video results without a progress field", () => {
    const legacy = finishEndurance(video(), true, finishedAt);
    expect(legacy).not.toHaveProperty("videoProgress"); expect(isEnduranceResult(legacy)).toBe(true);
    expect(isEnduranceResult({ ...legacy, videoProgress: { positionMs: 0, durationMs: null } })).toBe(true);
    expect(isEnduranceResult({ ...legacy, videoProgress: { positionMs: 123, durationMs: null } })).toBe(true);
  });

  it("only attaches progress to preset six and rejects it in other saved presets", () => {
    for (const state of [game(), createEnduranceGame("custom", 1, startedAt)]) {
      const result = finishEndurance(state, true, finishedAt, { positionMs: 12, durationMs: 60 });
      expect(result).not.toHaveProperty("videoProgress");
      expect(isEnduranceResult({ ...result, videoProgress: { positionMs: 12, durationMs: 60 } })).toBe(false);
    }
  });

  it.each([
    null, [], {}, { positionMs: 0 }, { durationMs: null },
    { positionMs: -1, durationMs: null }, { positionMs: 1.5, durationMs: null },
    { positionMs: NaN, durationMs: null }, { positionMs: Infinity, durationMs: null },
    { positionMs: Number.MAX_SAFE_INTEGER + 1, durationMs: null }, { positionMs: "1", durationMs: 60 },
    { positionMs: 0, durationMs: 0 }, { positionMs: 0, durationMs: -1 }, { positionMs: 0, durationMs: 1.5 },
    { positionMs: 0, durationMs: NaN }, { positionMs: 0, durationMs: Infinity },
    { positionMs: 0, durationMs: Number.MAX_SAFE_INTEGER + 1 }, { positionMs: 0, durationMs: "60" },
    { positionMs: 61, durationMs: 60 },
  ])("rejects malformed or contradictory progress: %j", (videoProgress) => {
    expect(isEnduranceResult({ ...finishEndurance(video(), true, finishedAt), videoProgress })).toBe(false);
  });
});
