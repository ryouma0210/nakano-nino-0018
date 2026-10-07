import { toDateKey, toDateTimeKey } from "../../utils/date";

export type SessionCompletion = {
  id: string;
  recordDate: string;
  startedAt: string;
  completedAt: string;
};

let sequence = 0;

/** Capture local dates once so a retry after midnight keeps the original record. */
export function createSessionCompletion(kind: "training" | "punishment", startedAt?: number, completedAt = new Date()): SessionCompletion {
  return {
    id: `${kind}-${completedAt.getTime()}-${++sequence}-${Math.random().toString(36).slice(2)}`,
    recordDate: toDateKey(completedAt),
    startedAt: toDateTimeKey(startedAt ? new Date(startedAt) : completedAt),
    completedAt: toDateTimeKey(completedAt),
  };
}

type SaveState<T> = { pending: T | null; error: unknown | null };

/** Retain the first completed result until its synchronous transaction succeeds. */
export function createRetryableSessionSave<T>(write: (result: T) => void) {
  let state: SaveState<T> = { pending: null, error: null };
  const listeners = new Set<() => void>();
  const publish = (next: SaveState<T>) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  function retry() {
    const result = state.pending;
    if (result === null) return true;
    try {
      write(result);
      publish({ pending: null, error: null });
      return true;
    } catch (error) {
      publish({ pending: result, error });
      return false;
    }
  }
  return {
    getSnapshot: () => state,
    hasPending: () => state.pending !== null,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    submit(result: T) {
      if (state.pending !== null) return false;
      publish({ pending: result, error: null });
      return retry();
    },
    /** Only called after the user explicitly confirms leaving without saving. */
    discard() { publish({ pending: null, error: null }); },
    retry,
  };
}
