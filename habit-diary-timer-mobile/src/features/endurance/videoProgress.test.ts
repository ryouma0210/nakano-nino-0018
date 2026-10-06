import { describe, expect, it } from "vitest";
import { normalizeEnduranceVideoProgress } from "./videoProgress";

describe("video playback progress", () => {
  it("rounds the actual playback position and duration to milliseconds", () => {
    expect(normalizeEnduranceVideoProgress(12.3456, 90.1236)).toEqual({ positionMs: 12346, durationMs: 90124 });
  });
  it.each([0, -1, NaN, Infinity, -Infinity])("keeps an unknown duration null: %s", (duration) => {
    expect(normalizeEnduranceVideoProgress(5, duration)).toEqual({ positionMs: 5000, durationMs: null });
  });
  it.each([-1, NaN, Infinity, -Infinity])("rejects invalid playback positions: %s", (position) => {
    expect(normalizeEnduranceVideoProgress(position, 60)).toEqual({ positionMs: 0, durationMs: 60000 });
  });
  it("clamps an end-of-video position to the known duration", () => {
    expect(normalizeEnduranceVideoProgress(60.01, 60)).toEqual({ positionMs: 60000, durationMs: 60000 });
  });
  it("remains within safe integer limits even for malformed player values", () => {
    expect(normalizeEnduranceVideoProgress(Number.MAX_VALUE, Number.MAX_VALUE)).toEqual({
      positionMs: Number.MAX_SAFE_INTEGER, durationMs: Number.MAX_SAFE_INTEGER,
    });
  });
  it("treats durations below millisecond precision as unknown", () => {
    expect(normalizeEnduranceVideoProgress(0, 0.00001)).toEqual({ positionMs: 0, durationMs: null });
  });
});
