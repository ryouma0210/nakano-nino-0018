export const TIMER_ROOM_SESSION_KEY = "nino-room:timer-room-session:v1";
export const MIN_TIMER_ROOM_MINUTES = 30;
export const MAX_TIMER_ROOM_MINUTES = 1440;
export const STEP_TIMER_ROOM_MINUTES = 30;
export const TIMER_ROOM_DURATION_MINUTES: readonly number[] = Object.freeze(Array.from(
  { length: (MAX_TIMER_ROOM_MINUTES - MIN_TIMER_ROOM_MINUTES) / STEP_TIMER_ROOM_MINUTES + 1 },
  (_, index) => MIN_TIMER_ROOM_MINUTES + index * STEP_TIMER_ROOM_MINUTES,
));

export function isValidTimerRoomMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= MIN_TIMER_ROOM_MINUTES && minutes <= MAX_TIMER_ROOM_MINUTES
    && minutes % STEP_TIMER_ROOM_MINUTES === 0;
}

export type TimerRoomSession = Readonly<{ id: string; startedAt: number; endsAt: number }>;
export type TimerRoomSnapshot = { session: TimerRoomSession | null; ready: boolean; error: string | null };
type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem?(key: string): Promise<unknown>;
};

const messages = {
  invalidDuration: "タイマーは30〜1440分の範囲で、30分単位で設定してください。",
  invalidData: "タイマーの保存データが正しくありません。",
  recovered: "タイマーの保存データを読み込めなかったため、タイマーを解除しました。",
  loadFailed: "タイマーを読み込めませんでした。再試行してください。",
  startFailed: "タイマーを開始できませんでした。もう一度お試しください。",
  clearFailed: "タイマーを停止しましたが、終了状態を保存できませんでした。",
} as const;

export function parseTimerRoomSession(raw: string | null): TimerRoomSession | null {
  if (raw === null || raw === "null") return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(messages.invalidData); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(messages.invalidData);
  const envelope = parsed as { version?: unknown; session?: unknown };
  const value = envelope.session as Partial<TimerRoomSession> | undefined;
  // Preserve the exact deadline of older sessions, including durations below
  // 30 minutes or not aligned to a new duration choice. Only new starts use
  // isValidTimerRoomMinutes; loading must not reset an active legacy timer.
  if (envelope.version !== 1 || !value || typeof value !== "object" || Array.isArray(value)
    || typeof value.id !== "string" || !value.id.trim() || value.id.length > 200
    || !Number.isSafeInteger(value.startedAt) || !Number.isSafeInteger(value.endsAt)
    || value.startedAt! < 0 || value.endsAt! <= value.startedAt!
    || value.endsAt! - value.startedAt! > MAX_TIMER_ROOM_MINUTES * 60000) {
    throw new Error(messages.invalidData);
  }
  return Object.freeze({ id: value.id, startedAt: value.startedAt!, endsAt: value.endsAt! });
}

export function remainingTimerRoomSeconds(session: TimerRoomSession | null, now = Date.now()): number {
  return session === null ? 0 : Math.max(0, Math.ceil((session.endsAt - now) / 1000));
}

export function isTimerRoomActive(session: TimerRoomSession | null, now = Date.now()): boolean {
  return session !== null && session.endsAt > now;
}

/** One durable deadline, rather than decrementing a counter while the app runs. */
export function createPersistentTimerRoomStore(storage: Storage, options: { now?: () => number; createId?: () => string } = {}) {
  const now = options.now ?? Date.now;
  let sequence = 0;
  const createId = options.createId ?? (() => `timer-room-${now()}-${sequence++}`);
  let snapshot: TimerRoomSnapshot = { session: null, ready: false, error: null };
  let committedSession: TimerRoomSession | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let revision = 0;
  // Emergency exit takes effect immediately, even if the disk operation fails.
  let restorationSuppressed = false;
  const listeners = new Set<() => void>();
  function publish(session: TimerRoomSession | null, error: string | null = null) {
    snapshot = { session, ready: true, error };
    for (const listener of listeners) listener();
  }
  function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }
  async function erase() {
    // Either representation is read as inactive. Try the alternative storage
    // operation if one fails, so a transient write failure need not restore it.
    try { await storage.setItem(TIMER_ROOM_SESSION_KEY, "null"); }
    catch (error) {
      if (!storage.removeItem) throw error;
      await storage.removeItem(TIMER_ROOM_SESSION_KEY);
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load() {
      const requestedRevision = revision;
      return run(async () => {
        if (requestedRevision !== revision || restorationSuppressed) return;
        let raw: string | null;
        try { raw = await storage.getItem(TIMER_ROOM_SESSION_KEY); }
        catch {
          if (requestedRevision === revision && !restorationSuppressed) publish(snapshot.session, messages.loadFailed);
          throw new Error(messages.loadFailed);
        }
        if (requestedRevision !== revision || restorationSuppressed) return;
        let session: TimerRoomSession | null;
        try { session = parseTimerRoomSession(raw); }
        catch {
          // Invalid data must never strand the user in a room. Cleanup is best
          // effort: keep restoration suppressed if the storage is unavailable.
          restorationSuppressed = true;
          committedSession = null;
          publish(null, messages.recovered);
          try {
            await erase();
            if (requestedRevision === revision) restorationSuppressed = false;
          } catch { /* The invalid session remains ignored for this process. */ }
          return;
        }
        committedSession = session;
        publish(session);
      });
    },
    async start(minutes: number): Promise<TimerRoomSession> {
      if (!isValidTimerRoomMinutes(minutes)) {
        throw new Error(messages.invalidDuration);
      }
      const requestedRevision = ++revision;
      return run(async () => {
        // Double taps cannot reset an already running deadline.
        if (isTimerRoomActive(committedSession, now())) {
          if (requestedRevision === revision) {
            restorationSuppressed = false;
            publish(committedSession);
          }
          return committedSession!;
        }
        const startedAt = now();
        const session = parseTimerRoomSession(JSON.stringify({ version: 1, session: {
          id: createId(), startedAt, endsAt: startedAt + minutes * 60000,
        } }))!;
        try { await storage.setItem(TIMER_ROOM_SESSION_KEY, JSON.stringify({ version: 1, session })); }
        catch {
          if (requestedRevision === revision) publish(snapshot.session, messages.startFailed);
          throw new Error(messages.startFailed);
        }
        committedSession = session;
        if (requestedRevision === revision) {
          restorationSuppressed = false;
          publish(session);
        }
        return session;
      });
    },
    clear(): Promise<void> {
      const requestedRevision = ++revision;
      restorationSuppressed = true;
      committedSession = null;
      publish(null);
      return run(async () => {
        committedSession = null;
        try { await erase(); }
        catch {
          if (requestedRevision === revision) publish(null, messages.clearFailed);
          throw new Error(messages.clearFailed);
        }
        if (requestedRevision === revision) {
          restorationSuppressed = false;
          publish(null);
        }
      });
    },
  };
}
