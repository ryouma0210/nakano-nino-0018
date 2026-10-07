import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  advanceCountdown, createCountdown, pauseCountdown, resumeCountdown, startCountdown, type CountdownState,
} from "../sugoroku/countdown";

/** Timers pause on route blur/background and resume only after an explicit tap. */
export function useActiveTimer(durationMs: number, active: boolean, onComplete: () => void) {
  const [state, setState] = useState(() => createCountdown(durationMs));
  const current = useRef(state);
  const notify = useRef(onComplete);
  useLayoutEffect(() => { notify.current = onComplete; }, [onComplete]);
  const commit = useCallback((next: CountdownState) => {
    current.current = next;
    setState(next);
  }, []);
  const pause = useCallback(() => commit(pauseCountdown(current.current, Date.now())), [commit]);
  // Read the ref, not the last render: navigation can follow a timer action in the same event.
  const getSnapshot = useCallback(() => pauseCountdown(current.current, Date.now()), []);
  const restore = useCallback((saved: CountdownState) => {
    commit(pauseCountdown({ ...saved }, Date.now()));
  }, [commit]);
  const reset = useCallback(() => commit(createCountdown(durationMs)), [commit, durationMs]);
  const start = useCallback(() => {
    if (!active) return;
    commit(current.current.status === "paused" ? resumeCountdown(current.current, Date.now()) : startCountdown(durationMs, Date.now()));
  }, [active, commit, durationMs]);
  useEffect(() => {
    if (!active) { pause(); return; }
    const interval = setInterval(() => {
      const before = current.current;
      const next = advanceCountdown(before, Date.now());
      if (next !== before) commit(next);
      if (before.status === "running" && next.status === "complete") notify.current();
    }, 100);
    return () => { clearInterval(interval); pause(); };
  }, [active, commit, pause]);
  return { state, start, pause, reset, getSnapshot, restore };
}
