import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startFeedbackSequence, type FeedbackFrame } from "./feedbackSequence";

const startedAt = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(startedAt);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("feedback sequence", () => {
  it("shows the first index for five seconds and leaves two seconds blank before the next", () => {
    const onFrame = vi.fn();
    const stop = startFeedbackSequence(6, onFrame);
    expect(onFrame.mock.calls).toEqual([[{ index: 0, visible: true }]]);

    vi.advanceTimersByTime(4_999);
    expect(onFrame).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onFrame).toHaveBeenLastCalledWith({ index: 0, visible: false });
    expect(onFrame).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1_999);
    expect(onFrame).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(onFrame).toHaveBeenLastCalledWith({ index: 1, visible: true });
    expect(onFrame).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(1);
    stop();
  });

  it.each([6, 8])("visits all %i indices in order before looping back to the first", (count) => {
    const onFrame = vi.fn();
    const stop = startFeedbackSequence(count, onFrame);
    vi.advanceTimersByTime(count * 7_000 - 1);
    const expected: FeedbackFrame[] = Array.from({ length: count }, (_, index) => [
      { index, visible: true }, { index, visible: false },
    ]).flat();
    expect(onFrame.mock.calls.map(([frame]) => frame)).toEqual(expected);

    vi.advanceTimersByTime(1);
    expect(onFrame.mock.calls.map(([frame]) => frame)).toEqual([...expected, { index: 0, visible: true }]);
    expect(vi.getTimerCount()).toBe(1);
    stop();
  });

  it("jumps to the current phase after a delayed tick and keeps the next original boundary", () => {
    const onFrame = vi.fn();
    const stop = startFeedbackSequence(6, onFrame);
    // The first scheduled callback runs after the wall clock has advanced 27.5 seconds.
    const now = vi.spyOn(Date, "now").mockReturnValue(startedAt + 27_500);
    vi.advanceTimersByTime(5_000);
    expect(onFrame.mock.calls).toEqual([
      [{ index: 0, visible: true }], [{ index: 3, visible: false }],
    ]);

    now.mockReturnValue(startedAt + 28_000);
    vi.advanceTimersByTime(499);
    expect(onFrame).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(onFrame).toHaveBeenLastCalledWith({ index: 4, visible: true });
    expect(onFrame).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(1);
    stop();
  });

  it("cancels pending and already queued callbacks when stopped", () => {
    const schedule = vi.spyOn(globalThis, "setTimeout");
    const onFrame = vi.fn();
    const stop = startFeedbackSequence(6, onFrame);
    const queuedTick = schedule.mock.calls[0][0] as () => void;
    stop();
    stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    queuedTick();
    expect(onFrame.mock.calls).toEqual([[{ index: 0, visible: true }]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts from the first index without allowing the previous sequence to interfere", () => {
    const schedule = vi.spyOn(globalThis, "setTimeout");
    const previousFrame = vi.fn();
    const stopPrevious = startFeedbackSequence(6, previousFrame);
    vi.advanceTimersByTime(6_000);
    const staleTick = schedule.mock.calls.at(-1)![0] as () => void;
    stopPrevious();

    const onFrame = vi.fn();
    const stop = startFeedbackSequence(8, onFrame);
    expect(onFrame.mock.calls).toEqual([[{ index: 0, visible: true }]]);
    staleTick();
    vi.advanceTimersByTime(4_000);
    expect(previousFrame).toHaveBeenCalledTimes(2);
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1_000);
    expect(onFrame).toHaveBeenLastCalledWith({ index: 0, visible: false });
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not schedule another tick if the frame callback stops the sequence", () => {
    const frames: FeedbackFrame[] = [];
    let stop = () => {};
    stop = startFeedbackSequence(6, (frame) => {
      frames.push(frame);
      if (!frame.visible) stop();
    });
    vi.advanceTimersByTime(5_000);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(frames).toEqual([{ index: 0, visible: true }, { index: 0, visible: false }]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("hides an empty or invalid sequence (%s) without a timer", (count) => {
    const onFrame = vi.fn();
    const stop = startFeedbackSequence(count, onFrame);
    expect(onFrame.mock.calls).toEqual([[{ index: 0, visible: false }]]);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(onFrame).toHaveBeenCalledTimes(1);
    stop();
  });
});
