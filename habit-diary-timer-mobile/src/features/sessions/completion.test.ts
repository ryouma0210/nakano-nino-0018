import { describe, expect, it, vi } from "vitest";
import { createRetryableSessionSave, createSessionCompletion } from "./completion";

describe("retryable session completion", () => {
  it("captures the completion day and actual start independently", () => {
    const finish = new Date(2026, 9, 7, 23, 59, 58);
    const start = new Date(2026, 9, 7, 23, 50).getTime();
    const first = createSessionCompletion("training", start, finish);
    const second = createSessionCompletion("training", start, finish);
    expect(first).toMatchObject({ recordDate: "2026-10-07", startedAt: "2026-10-07 23:50:00", completedAt: "2026-10-07 23:59:58" });
    expect(first.id).not.toBe(second.id);
  });

  it("keeps the original result during a failed write and retries it without recalculation", () => {
    const result = { ...createSessionCompletion("training", undefined, new Date(2026, 9, 7, 23, 59)), elapsedSeconds: 42, judgement: "original" };
    const write = vi.fn().mockImplementationOnce(() => { throw new Error("disk full"); }).mockImplementationOnce(() => undefined);
    const save = createRetryableSessionSave<typeof result>(write);
    const states: boolean[] = [];
    const unsubscribe = save.subscribe(() => states.push(save.hasPending()));
    expect(save.submit(result)).toBe(false);
    expect(save.getSnapshot().pending).toBe(result);
    expect(save.getSnapshot().error).toBeInstanceOf(Error);
    expect(save.submit({ ...result, elapsedSeconds: 99, judgement: "replacement" })).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(save.retry()).toBe(true);
    expect(write).toHaveBeenNthCalledWith(2, result);
    expect(save.getSnapshot()).toEqual({ pending: null, error: null });
    expect(save.retry()).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    expect(states).toEqual([true, true, false]);
    unsubscribe();
  });

  it("exposes the pending result before persistence and never calls it saved on failure", () => {
    const write = vi.fn(() => {
      expect(save.hasPending()).toBe(true);
      throw new Error("failed");
    });
    const save = createRetryableSessionSave(write);
    expect(save.submit({ id: "session" })).toBe(false);
    expect(save.retry()).toBe(false);
    expect(save.hasPending()).toBe(true);
  });

  it("releases an unsaved result only when explicitly discarded", () => {
    const save = createRetryableSessionSave(() => { throw new Error("full"); });
    save.submit({ id: "pending" });
    expect(save.hasPending()).toBe(true);
    save.discard();
    expect(save.getSnapshot()).toEqual({ pending: null, error: null });
  });
});
