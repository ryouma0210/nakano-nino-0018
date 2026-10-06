import type { EnduranceVideoProgress } from "./game";

function milliseconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (seconds >= Number.MAX_SAFE_INTEGER / 1000) return Number.MAX_SAFE_INTEGER;
  return Math.round(seconds * 1000);
}

/** Player times are seconds; saved positions must be finite, integral milliseconds. */
export function normalizeEnduranceVideoProgress(positionSeconds: number, durationSeconds: number): EnduranceVideoProgress {
  const durationMs = milliseconds(durationSeconds) || null;
  const positionMs = milliseconds(positionSeconds);
  return { positionMs: durationMs === null ? positionMs : Math.min(positionMs, durationMs), durationMs };
}
