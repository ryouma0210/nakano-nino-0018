export type RhythmSession = {
  id: string;
  startedAt: number;
  status: "running" | "paused" | "finished";
  interruptions: number;
  elapsedMs: number;
  runningSince: number | null;
  completedAt: number | null;
  autoResumeAt: number | null;
};

export const RHYTHM_PAUSE_MS = 30_000;

export function createRhythmSession(id: string, now: number): RhythmSession {
  return { id, startedAt: now, status: "running", interruptions: 0, elapsedMs: 0, runningSince: now, completedAt: null, autoResumeAt: null };
}

/** Only foreground running intervals count; suspended time never catches up. */
export function rhythmElapsedMs(session: RhythmSession, now: number): number {
  return session.elapsedMs + (session.status === "running" && session.runningSince !== null
    ? Math.max(0, now - session.runningSince) : 0);
}

export function pauseRhythmSession(session: RhythmSession, now: number, countInterruption = true): RhythmSession {
  if (session.status !== "running") return session;
  return { ...session, status: "paused", elapsedMs: rhythmElapsedMs(session, now), runningSince: null,
    interruptions: session.interruptions + (countInterruption ? 1 : 0), autoResumeAt: countInterruption ? now + RHYTHM_PAUSE_MS : null };
}

export function resumeRhythmSession(session: RhythmSession, now: number): RhythmSession {
  return session.status === "paused" ? { ...session, status: "running", runningSince: now, autoResumeAt: null } : session;
}

/** Leaving the foreground or opening settings cancels automatic playback. */
export function suspendRhythmSession(session: RhythmSession, now: number): RhythmSession {
  if (session.status === "finished") return session;
  if (session.status === "running") return pauseRhythmSession(session, now, false);
  return session.autoResumeAt === null ? session : { ...session, autoResumeAt: null };
}

export function rhythmPauseSecondsRemaining(session: RhythmSession, now: number): number | null {
  return session.status === "paused" && session.autoResumeAt !== null
    ? Math.max(0, Math.ceil((session.autoResumeAt - now) / 1000)) : null;
}

/** Use actual foreground tick time, never count delayed/background time as play. */
export function autoResumeRhythmSession(session: RhythmSession, now: number): RhythmSession {
  return session.status === "paused" && session.autoResumeAt !== null && now >= session.autoResumeAt
    ? resumeRhythmSession(session, now) : session;
}

export function finishRhythmSession(session: RhythmSession, now: number): RhythmSession {
  if (session.status === "finished") return session;
  const elapsedMs = rhythmElapsedMs(session, now);
  return { ...session, status: "finished", elapsedMs, runningSince: null, autoResumeAt: null,
    completedAt: Math.max(now, session.startedAt + elapsedMs) };
}

export const RHYTHM_TEMPOS = [48, 60, 72, 90, 108, 120] as const;
export type RhythmPattern = { bpm: number; durationMs: number };

function randomUnit(random: () => number) {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
}

/** Change tempo every 4–8 active seconds, avoiding the previous tempo. */
export function randomRhythm(previousBpm?: number, random: () => number = Math.random): RhythmPattern {
  const choices = RHYTHM_TEMPOS.filter((tempo) => tempo !== previousBpm);
  return { bpm: choices[Math.floor(randomUnit(random) * choices.length)], durationMs: 4000 + Math.floor(randomUnit(random) * 4001) };
}
