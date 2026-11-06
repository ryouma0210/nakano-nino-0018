import { describe, expect, it } from "vitest";
import { moveTimerRoomDefaultVideo, timerRoomDefaultVideoIndex, timerRoomDefaultVideoMinute } from "./defaultVideoSelection";

describe("timer room test-video selection", () => {
  it("always previews the first clip before a session and holds it through its first minute", () => {
    expect(timerRoomDefaultVideoIndex(null, 987654321)).toBe(0);
    expect(timerRoomDefaultVideoIndex(1000, 1000)).toBe(0);
    expect(timerRoomDefaultVideoIndex(1000, 60999)).toBe(0);
    expect(timerRoomDefaultVideoIndex(1000, 61000)).not.toBe(0);
  });
  it("restores automatic choices directly from absolute time without rerolling", () => {
    for (let minute = 0; minute < 500; minute++) {
      const fromFreshLoad = timerRoomDefaultVideoIndex(12345, 12345 + minute * 60000);
      expect(timerRoomDefaultVideoIndex(12345, 12345 + minute * 60000 + 59999)).toBe(fromFreshLoad);
    }
  });
  it("never immediately repeats an automatically selected clip", () => {
    for (const start of [0, 1, 12345, 1793856000000]) {
      let previous = 0;
      const observed = new Set([previous]);
      for (let minute = 1; minute < 500; minute++) {
        const next = timerRoomDefaultVideoIndex(start, start + minute * 60000);
        expect(next).not.toBe(previous);
        expect([0, 1, 2]).toContain(next);
        observed.add(next); previous = next;
      }
      expect(observed.size).toBe(3);
    }
  });
  it("changes the sequence between sessions", () => {
    const sequence = (start: number) => Array.from({ length: 20 }, (_, minute) => timerRoomDefaultVideoIndex(start, start + minute * 60000));
    expect(sequence(1000)).not.toEqual(sequence(2000));
  });
  it("holds a manual previous/next choice until the next minute, then resumes without repeating it", () => {
    const start = 1000;
    const next = moveTimerRoomDefaultVideo(start, start + 20000, 0, 1);
    expect(next.index).toBe(1);
    expect(timerRoomDefaultVideoIndex(start, start + 59999, next)).toBe(1);
    let previous = 1;
    for (let minute = 1; minute < 50; minute++) {
      const current = timerRoomDefaultVideoIndex(start, start + minute * 60000, next);
      expect(current).not.toBe(previous); previous = current;
    }
    expect(moveTimerRoomDefaultVideo(start, start, 0, -1).index).toBe(2);
    expect(moveTimerRoomDefaultVideo(start, start, 2, 1).index).toBe(0);
  });
  it("ignores an override from a different session or a future minute", () => {
    expect(timerRoomDefaultVideoIndex(1000, 1000, { startedAt: 999, minute: 0, index: 2 })).toBe(0);
    expect(timerRoomDefaultVideoIndex(1000, 1000, { startedAt: 1000, minute: 1, index: 2 })).toBe(0);
    expect(timerRoomDefaultVideoIndex(1000, 1000, { startedAt: 1000, minute: 0, index: 3 })).toBe(0);
  });
  it("clamps clock reversal and remains bounded after long absences", () => {
    expect(timerRoomDefaultVideoMinute(1000, 0)).toBe(0);
    expect(timerRoomDefaultVideoIndex(1000, 0)).toBe(0);
    expect(timerRoomDefaultVideoIndex(NaN, Date.now())).toBe(0);
    expect(timerRoomDefaultVideoMinute(1000, Infinity)).toBe(0);
    expect([0, 1, 2]).toContain(timerRoomDefaultVideoIndex(0, Number.MAX_SAFE_INTEGER));
  });
});
