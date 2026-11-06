export const TIMER_ROOM_DEFAULT_VIDEO_COUNT = 3;
export const TIMER_ROOM_DEFAULT_VIDEO_INTERVAL_MS = 60_000;

export type TimerRoomDefaultVideoOverride = { startedAt: number; minute: number; index: number };

export function timerRoomDefaultVideoMinute(startedAt: number | null, now: number): number {
  if (startedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(now)) return 0;
  return Math.floor(Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, now - startedAt)) / TIMER_ROOM_DEFAULT_VIDEO_INTERVAL_MS);
}

function hash(seed: string, pair: number, salt: string) {
  const value = `${seed}:${pair}:${salt}`;
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  result ^= result >>> 13;
  return result >>> 0;
}

/** Adjacent minutes differ, without walking through every elapsed minute. */
function indexAtMinute(seed: string, minute: number, initial: number) {
  const pair = Math.floor(minute / 2);
  const anchor = (value: number) => value === 0 ? initial : hash(seed, value, "anchor") % TIMER_ROOM_DEFAULT_VIDEO_COUNT;
  const current = anchor(pair);
  if (minute % 2 === 0) return current;
  const next = anchor(pair + 1);
  const choices = Array.from({ length: TIMER_ROOM_DEFAULT_VIDEO_COUNT }, (_, index) => index).filter((index) => index !== current && index !== next);
  return choices[hash(seed, pair, "between") % choices.length];
}

/** Only a running session advances; reloading derives the same automatic minute. */
export function timerRoomDefaultVideoIndex(startedAt: number | null, now: number, override: TimerRoomDefaultVideoOverride | null = null) {
  if (startedAt === null || !Number.isFinite(startedAt)) return 0;
  const minute = timerRoomDefaultVideoMinute(startedAt, now);
  if (override?.startedAt === startedAt && Number.isSafeInteger(override.minute) && override.minute >= 0 && override.minute <= minute
    && Number.isInteger(override.index) && override.index >= 0 && override.index < TIMER_ROOM_DEFAULT_VIDEO_COUNT) {
    // The manually chosen clip holds only for its minute. It then seeds a new
    // automatic sequence so the first switch cannot repeat that same clip.
    return indexAtMinute(`${startedAt}:manual:${override.minute}:${override.index}`, minute - override.minute, override.index);
  }
  return indexAtMinute(String(startedAt), minute, 0);
}

export function moveTimerRoomDefaultVideo(startedAt: number, now: number, current: number, direction: -1 | 1): TimerRoomDefaultVideoOverride {
  return { startedAt, minute: timerRoomDefaultVideoMinute(startedAt, now),
    index: (current + direction + TIMER_ROOM_DEFAULT_VIDEO_COUNT) % TIMER_ROOM_DEFAULT_VIDEO_COUNT };
}
