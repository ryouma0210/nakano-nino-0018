import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSleepTimer } from "./sleepTimer";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T10:00:00Z")); });
afterEach(() => vi.useRealTimers());
describe("loop sleep timer", () => {
  it("expires once at the selected deadline", () => {
    const stop = vi.fn();
    const changed = vi.fn();
    const timer = createSleepTimer(stop, changed);
    timer.setMinutes(5);
    vi.advanceTimersByTime(299_999);
    expect(stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    timer.check();
    expect(stop).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenLastCalledWith(null);
  });
  it("checks the original deadline after the app was suspended", () => {
    const stop = vi.fn();
    const timer = createSleepTimer(stop, vi.fn());
    timer.setMinutes(1);
    vi.setSystemTime(new Date("2026-10-07T10:10:00Z"));
    timer.check();
    expect(stop).toHaveBeenCalledOnce();
  });
  it("replacing or cancelling a timer cannot stop later playback", () => {
    const stop = vi.fn();
    const timer = createSleepTimer(stop, vi.fn());
    timer.setMinutes(1);
    timer.setMinutes(10);
    vi.advanceTimersByTime(60_000);
    expect(stop).not.toHaveBeenCalled();
    timer.cancel();
    vi.advanceTimersByTime(600_000);
    expect(stop).not.toHaveBeenCalled();
  });
  it("rejects invalid durations and releases scheduled work", () => {
    const stop = vi.fn();
    const timer = createSleepTimer(stop, vi.fn());
    for (const minutes of [0, -1, 241, NaN, Infinity]) expect(() => timer.setMinutes(minutes)).toThrow();
    timer.setMinutes(1);
    timer.dispose();
    vi.advanceTimersByTime(60_000);
    expect(stop).not.toHaveBeenCalled();
  });
});
