import { describe, expect, it } from "vitest";
import {
  advanceCountdown, createCountdown, formatCountdown, parseCountdownDuration,
  pauseCountdown, resumeCountdown, startCountdown,
} from "./countdown";

describe("sugoroku countdown", () => {
  it.each([
    ["1", 60_000], ["2", 120_000], ["60", 3_600_000],
    [" 1 ", 60_000], ["001", 60_000], ["999", 59_940_000],
  ])("accepts whole-minute input %s", (minutes, expected) => {
    expect(parseCountdownDuration(minutes)).toBe(expected);
  });

  it.each([
    "0", "000", "", " ", "1000", "1.5", "-1", "+1", "1e2", "abc", "1:30",
  ])("rejects invalid or zero minute input %s", (minutes) => {
    expect(parseCountdownDuration(minutes)).toBeNull();
  });

  it("uses elapsed wall time when ticks are late and completes only once", () => {
    const started = startCountdown(2000, 1000);
    const delayed = advanceCountdown(started, 2550);
    expect(delayed.remainingMs).toBe(450);
    expect(formatCountdown(delayed.remainingMs)).toBe("00:01");
    const completed = advanceCountdown(delayed, 4500);
    expect(completed).toMatchObject({ status: "complete", remainingMs: 0, deadline: null });
    expect(formatCountdown(completed.remainingMs)).toBe("00:00");
    expect(advanceCountdown(completed, 10_000)).toBe(completed);
  });

  it("preserves fractional seconds through a long pause and starts a new deadline on resume", () => {
    const paused = pauseCountdown(startCountdown(6000, 1000), 2250);
    expect(paused).toMatchObject({ status: "paused", remainingMs: 4750, deadline: null });
    expect(advanceCountdown(paused, 90_000)).toBe(paused);
    const resumed = resumeCountdown(paused, 100_000);
    expect(advanceCountdown(resumed, 104_000).remainingMs).toBe(750);
    expect(advanceCountdown(resumed, 104_750).status).toBe("complete");
  });

  it("recognizes expiry when pause is pressed after the deadline", () => {
    const state = pauseCountdown(startCountdown(1000, 1000), 2001);
    expect(state.status).toBe("complete");
    expect(resumeCountdown(state, 3000)).toBe(state);
  });

  it("resets to the configured duration with no old deadline or pending completion", () => {
    const running = startCountdown(65_000, 1000);
    const reset = createCountdown(running.durationMs);
    expect(reset.status).toBe("idle");
    expect(formatCountdown(reset.remainingMs)).toBe("01:05");
    expect(advanceCountdown(reset, 100_000)).toBe(reset);
  });

  it("formats durations over an hour without wrapping the minutes", () => {
    expect(formatCountdown(3_600_000)).toBe("60:00");
    expect(formatCountdown(59_999_000)).toBe("999:59");
  });
});
