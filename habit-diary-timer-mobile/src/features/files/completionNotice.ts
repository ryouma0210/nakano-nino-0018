const deadlines = new WeakMap<object, number>();
const NOTICE_DURATION_MS = 5000;

// Results remain in the file service for list refresh and retry details. Only
// their success notices expire, including after leaving and reopening the page.
export function watchCompletionNotice(result: object, onExpire: () => void): (() => void) | null {
  const now = Date.now();
  const deadline = deadlines.get(result) ?? now + NOTICE_DURATION_MS;
  deadlines.set(result, deadline);
  if (deadline <= now) return null;
  const timer = setTimeout(onExpire, deadline - now);
  return () => clearTimeout(timer);
}
