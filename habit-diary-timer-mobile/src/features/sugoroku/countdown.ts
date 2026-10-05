export type CountdownState = {
  status: "idle" | "running" | "paused" | "complete";
  durationMs: number;
  remainingMs: number;
  deadline: number | null;
};

export function parseCountdownDuration(minutes: string): number | null {
  const minuteText = minutes.trim();
  if (!/^\d{1,3}$/.test(minuteText)) return null;
  const minuteValue = Number(minuteText);
  return minuteValue > 0 ? minuteValue * 60_000 : null;
}

export function createCountdown(durationMs: number): CountdownState {
  return { status: "idle", durationMs, remainingMs: durationMs, deadline: null };
}

export function startCountdown(durationMs: number, now: number): CountdownState {
  return { status: "running", durationMs, remainingMs: durationMs, deadline: now + durationMs };
}

export function advanceCountdown(state: CountdownState, now: number): CountdownState {
  if (state.status !== "running" || state.deadline === null) return state;
  const remainingMs = Math.max(0, Math.min(state.durationMs, state.deadline - now));
  if (remainingMs === 0) return { ...state, status: "complete", remainingMs: 0, deadline: null };
  return remainingMs === state.remainingMs ? state : { ...state, remainingMs };
}

export function pauseCountdown(state: CountdownState, now: number): CountdownState {
  const current = advanceCountdown(state, now);
  return current.status === "running" ? { ...current, status: "paused", deadline: null } : current;
}

export function resumeCountdown(state: CountdownState, now: number): CountdownState {
  return state.status === "paused"
    ? { ...state, status: "running", deadline: now + state.remainingMs }
    : state;
}

export function formatCountdown(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
