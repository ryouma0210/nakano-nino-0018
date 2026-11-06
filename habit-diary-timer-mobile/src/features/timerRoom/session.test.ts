import { describe, expect, it, vi } from "vitest";
import {
  createPersistentTimerRoomStore, isTimerRoomActive, isValidTimerRoomMinutes, MAX_TIMER_ROOM_MINUTES,
  MIN_TIMER_ROOM_MINUTES, parseTimerRoomSession, remainingTimerRoomSeconds, STEP_TIMER_ROOM_MINUTES,
  TIMER_ROOM_DURATION_MINUTES, TIMER_ROOM_SESSION_KEY,
} from "./session";

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: vi.fn(async () => value),
    setItem: vi.fn(async (_key: string, next: string) => { value = next; }),
    removeItem: vi.fn(async () => { value = null; }),
    value: () => value,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const base = { id: "session-1", startedAt: 100000, endsAt: 220000 };
const firstChoiceSession = { ...base, endsAt: base.startedAt + 30 * 60000 };
const raw = (session = base) => JSON.stringify({ version: 1, session });

describe("persistent timer room", () => {
  it("restores the original absolute deadline after cold start and background time", async () => {
    let now = base.startedAt;
    const disk = storage();
    const first = createPersistentTimerRoomStore(disk, { now: () => now, createId: () => base.id });
    expect(first.getSnapshot().ready).toBe(false);
    await first.load();
    expect(first.getSnapshot()).toEqual({ session: null, ready: true, error: null });
    const started = await first.start(30);
    expect(started).toEqual(firstChoiceSession);
    expect(disk.setItem).toHaveBeenCalledWith(TIMER_ROOM_SESSION_KEY, raw(firstChoiceSession));
    now += 45500;
    const restarted = createPersistentTimerRoomStore(disk, { now: () => now });
    await restarted.load();
    expect(restarted.getSnapshot().session).toEqual(firstChoiceSession);
    expect(remainingTimerRoomSeconds(restarted.getSnapshot().session, now)).toBe(1755);
    expect(isTimerRoomActive(restarted.getSnapshot().session, now)).toBe(true);
  });

  it("keeps expired sessions so media can continue, but stops requiring automatic return", async () => {
    const disk = storage(raw());
    const store = createPersistentTimerRoomStore(disk, { now: () => base.endsAt + 1 });
    await store.load();
    expect(store.getSnapshot().session).toEqual(base);
    expect(remainingTimerRoomSeconds(base, base.endsAt)).toBe(0);
    expect(remainingTimerRoomSeconds(base, base.endsAt + 60000)).toBe(0);
    expect(isTimerRoomActive(base, base.endsAt)).toBe(false);
    expect(disk.setItem).not.toHaveBeenCalled();
    await store.clear();
    expect(store.getSnapshot().session).toBeNull();
    const restarted = createPersistentTimerRoomStore(disk);
    await restarted.load();
    expect(restarted.getSnapshot().session).toBeNull();
  });

  it("offers all 48 half-hour choices through a full day", () => {
    expect(MIN_TIMER_ROOM_MINUTES).toBe(30);
    expect(MAX_TIMER_ROOM_MINUTES).toBe(1440);
    expect(STEP_TIMER_ROOM_MINUTES).toBe(30);
    expect(TIMER_ROOM_DURATION_MINUTES).toHaveLength(48);
    expect(TIMER_ROOM_DURATION_MINUTES[0]).toBe(30);
    expect(TIMER_ROOM_DURATION_MINUTES[47]).toBe(1440);
    expect(Object.isFrozen(TIMER_ROOM_DURATION_MINUTES)).toBe(true);
    expect(TIMER_ROOM_DURATION_MINUTES.every(isValidTimerRoomMinutes)).toBe(true);
    expect(new Set(TIMER_ROOM_DURATION_MINUTES).size).toBe(48);
  });

  it.each([0, -1, 1, 15, 29, 31, 45, 180.5, 1441, 1470, NaN, Infinity, -Infinity])("rejects invalid duration %s without writing", async (minutes) => {
    const disk = storage();
    const store = createPersistentTimerRoomStore(disk);
    expect(isValidTimerRoomMinutes(minutes)).toBe(false);
    await expect(store.start(minutes)).rejects.toThrow("30分単位");
    expect(disk.setItem).not.toHaveBeenCalled();
  });

  it("persists a full 24 hours and restores its exact deadline after restart", async () => {
    const disk = storage();
    const store = createPersistentTimerRoomStore(disk, { now: () => 1000 });
    const session = await store.start(MAX_TIMER_ROOM_MINUTES);
    expect(session.endsAt).toBe(86401000);
    expect(remainingTimerRoomSeconds(session, 1001)).toBe(86400);
    const nextDay = createPersistentTimerRoomStore(disk, { now: () => session.endsAt - 3600000 });
    await nextDay.load();
    expect(nextDay.getSnapshot().session).toEqual(session);
    expect(remainingTimerRoomSeconds(nextDay.getSnapshot().session, session.endsAt - 3600000)).toBe(3600);
    expect(isTimerRoomActive(nextDay.getSnapshot().session, session.endsAt - 1)).toBe(true);
    expect(isTimerRoomActive(nextDay.getSnapshot().session, session.endsAt)).toBe(false);
    expect(remainingTimerRoomSeconds(session, session.endsAt - 1)).toBe(1);
    expect(remainingTimerRoomSeconds(session, session.endsAt)).toBe(0);
    expect(remainingTimerRoomSeconds(null)).toBe(0);
  });

  it.each([1, 15, 179, 180])("restores a legacy %s-minute timer without rounding or rewriting it", async (minutes) => {
    const legacy = { ...base, endsAt: base.startedAt + minutes * 60000 };
    const disk = storage(raw(legacy));
    const store = createPersistentTimerRoomStore(disk, { now: () => base.startedAt + 1000 });
    await store.load();
    expect(store.getSnapshot().session).toEqual(legacy);
    expect(store.getSnapshot().error).toBeNull();
    expect(isTimerRoomActive(store.getSnapshot().session, base.startedAt + 1000)).toBe(true);
    expect(remainingTimerRoomSeconds(store.getSnapshot().session, base.startedAt + 1000)).toBe(minutes * 60 - 1);
    // A subsequent start also cannot replace an already running old deadline.
    expect(await store.start(30)).toEqual(legacy);
    expect(disk.setItem).not.toHaveBeenCalled();
  });

  it("preserves a previously valid stored duration that is not a whole minute", () => {
    const legacy = { ...base, endsAt: base.startedAt + 15 * 60000 + 12345 };
    expect(parseTimerRoomSession(raw(legacy))).toEqual(legacy);
  });

  it.each(["{broken", "[]", "0", "{}", JSON.stringify({ version: 2, session: base }),
    raw({ ...base, endsAt: base.startedAt }), raw({ ...base, startedAt: -1 }),
    raw({ ...base, endsAt: base.startedAt + 1440 * 60000 + 1 }), raw({ ...base, id: "" })])(
    "recovers invalid saved data without trapping the user: %s", async (value) => {
      const disk = storage(value);
      const store = createPersistentTimerRoomStore(disk);
      await store.load();
      expect(store.getSnapshot().ready).toBe(true);
      expect(store.getSnapshot().session).toBeNull();
      expect(store.getSnapshot().error).toContain("解除しました");
      expect(parseTimerRoomSession(disk.value())).toBeNull();
    },
  );

  it("does not restore invalid data when its cleanup also fails", async () => {
    const disk = storage("{broken");
    disk.setItem.mockRejectedValue(new Error("write unavailable"));
    disk.removeItem.mockRejectedValue(new Error("remove unavailable"));
    const store = createPersistentTimerRoomStore(disk);
    await store.load();
    await store.load();
    expect(disk.getItem).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().session).toBeNull();
    expect(store.getSnapshot().ready).toBe(true);
  });

  it("reports read and start failures without manufacturing an active timer", async () => {
    const disk = storage();
    disk.getItem.mockRejectedValueOnce(new Error("read unavailable"));
    const store = createPersistentTimerRoomStore(disk);
    await expect(store.load()).rejects.toThrow("読み込めません");
    expect(store.getSnapshot()).toMatchObject({ session: null, ready: true });
    disk.setItem.mockRejectedValueOnce(new Error("write unavailable"));
    await expect(store.start(30)).rejects.toThrow("開始できません");
    expect(store.getSnapshot().session).toBeNull();
    await store.start(30);
    expect(store.getSnapshot().session).not.toBeNull();
  });

  it("emergency exit takes effect before persistence and cannot resurrect on an in-flight load", async () => {
    const disk = storage(raw());
    const store = createPersistentTimerRoomStore(disk, { now: () => base.startedAt });
    await store.load();
    const read = deferred<string | null>();
    disk.getItem.mockReturnValueOnce(read.promise);
    const loading = store.load();
    await Promise.resolve();
    const writing = deferred<void>();
    disk.setItem.mockReturnValueOnce(writing.promise);
    const stopping = store.clear();
    expect(store.getSnapshot().session).toBeNull();
    read.resolve(raw());
    await loading;
    expect(store.getSnapshot().session).toBeNull();
    writing.resolve();
    await stopping;
    expect(store.getSnapshot().session).toBeNull();
  });

  it("failed stop persistence remains stopped across foreground loads, then allows a new timer", async () => {
    const disk = storage(raw());
    const store = createPersistentTimerRoomStore(disk, { now: () => base.startedAt });
    await store.load();
    disk.setItem.mockRejectedValueOnce(new Error("write unavailable"));
    disk.removeItem.mockRejectedValueOnce(new Error("remove unavailable"));
    await expect(store.clear()).rejects.toThrow("停止しましたが");
    expect(store.getSnapshot().session).toBeNull();
    await store.load();
    expect(store.getSnapshot().session).toBeNull();
    expect(disk.getItem).toHaveBeenCalledTimes(1);
    await store.start(60);
    expect(store.getSnapshot().session?.endsAt).toBe(base.startedAt + 3600000);
  });

  it("falls back to removal if writing the inactive marker fails", async () => {
    const disk = storage(raw());
    const store = createPersistentTimerRoomStore(disk);
    await store.load();
    disk.setItem.mockRejectedValueOnce(new Error("write unavailable"));
    await store.clear();
    expect(disk.removeItem).toHaveBeenCalledWith(TIMER_ROOM_SESSION_KEY);
    expect(store.getSnapshot()).toEqual({ session: null, ready: true, error: null });
    expect(disk.value()).toBeNull();
  });

  it("serializes double start so a second press cannot extend the running timer", async () => {
    const disk = storage();
    const store = createPersistentTimerRoomStore(disk, { now: () => base.startedAt, createId: () => base.id });
    const [first, second] = await Promise.all([store.start(30), store.start(60)]);
    expect(first).toEqual(firstChoiceSession);
    expect(second).toEqual(firstChoiceSession);
    expect(store.getSnapshot().session).toEqual(firstChoiceSession);
    expect(disk.setItem).toHaveBeenCalledTimes(1);
  });

  it("a stop during a pending start never publishes that canceled session", async () => {
    const disk = storage();
    const write = deferred<void>();
    disk.setItem.mockImplementationOnce(async (_key, value) => { await write.promise; await disk.setItem(_key, value); });
    const store = createPersistentTimerRoomStore(disk, { now: () => base.startedAt });
    const listener = vi.fn();
    store.subscribe(listener);
    const starting = store.start(30);
    await Promise.resolve();
    const stopping = store.clear();
    expect(store.getSnapshot().session).toBeNull();
    write.resolve();
    await Promise.all([starting, stopping]);
    expect(store.getSnapshot().session).toBeNull();
    expect(parseTimerRoomSession(disk.value())).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("a new start queued after stop wins, and stale loads cannot overwrite it", async () => {
    const disk = storage(raw());
    const store = createPersistentTimerRoomStore(disk, { now: () => base.startedAt });
    await store.load();
    const stopping = store.clear();
    const staleLoad = store.load();
    const starting = store.start(90);
    await Promise.all([stopping, staleLoad, starting]);
    expect(store.getSnapshot().session?.endsAt).toBe(base.startedAt + 5400000);
    expect(parseTimerRoomSession(disk.value())).toEqual(store.getSnapshot().session);
  });
});
