export type FeedbackFrame = { index: number; visible: boolean };

const displayDurationMs = 5_000;
const hiddenDurationMs = 2_000;
const cycleDurationMs = displayDurationMs + hiddenDurationMs;

/** Show each index for five seconds, then leave two seconds blank before the next. */
export function startFeedbackSequence(count: number, onFrame: (frame: FeedbackFrame) => void): () => void {
  const length = Math.floor(count);
  if (!Number.isFinite(length) || length <= 0) {
    onFrame({ index: 0, visible: false });
    return () => {};
  }

  const startedAt = Date.now();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = () => {
    if (stopped) return;
    // A delayed callback skips expired frames instead of replaying them in a burst.
    const elapsed = Math.max(0, Date.now() - startedAt);
    const cycle = Math.floor(elapsed / cycleDurationMs);
    const visible = elapsed % cycleDurationMs < displayDurationMs;
    onFrame({ index: cycle % length, visible });
    if (stopped) return;
    const nextBoundary = startedAt + cycle * cycleDurationMs + (visible ? displayDurationMs : cycleDurationMs);
    timer = setTimeout(tick, Math.max(0, nextBoundary - Date.now()));
  };

  tick();
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
