import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchCompletionNotice } from "./completionNotice";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("file completion notices", () => {
  it("expires after five seconds, keeping independent import and deletion notices", () => {
    const imported = vi.fn();
    const deleted = vi.fn();
    watchCompletionNotice({}, imported);
    vi.advanceTimersByTime(2000);
    watchCompletionNotice({}, deleted);
    vi.advanceTimersByTime(2999);
    expect(imported).not.toHaveBeenCalled();
    expect(deleted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(imported).toHaveBeenCalledOnce();
    expect(deleted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(deleted).toHaveBeenCalledOnce();
  });

  it("does not show an expired result again after returning to the page", () => {
    const result = {};
    const expire = vi.fn();
    const leave = watchCompletionNotice(result, expire)!;
    vi.advanceTimersByTime(1000);
    leave();
    vi.advanceTimersByTime(5000);
    expect(expire).not.toHaveBeenCalled();
    expect(watchCompletionNotice(result, expire)).toBeNull();
  });

  it("preserves the remaining time across a quick remount instead of restarting five seconds", () => {
    const result = {};
    const expire = vi.fn();
    const leave = watchCompletionNotice(result, expire)!;
    vi.advanceTimersByTime(3000);
    leave();
    expect(watchCompletionNotice(result, expire)).not.toBeNull();
    vi.advanceTimersByTime(1999);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledOnce();
  });

  it("cancels a replaced result without shortening the new result's display time", () => {
    const first = vi.fn();
    const second = vi.fn();
    const replace = watchCompletionNotice({}, first)!;
    vi.advanceTimersByTime(4000);
    replace();
    watchCompletionNotice({}, second);
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    expect(second).toHaveBeenCalledOnce();
  });
});
