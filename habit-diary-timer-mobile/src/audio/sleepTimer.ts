/** Uses a deadline so suspension and delayed callbacks never extend the timer. */
export function createSleepTimer(onExpire: () => void, onChange: (deadline: number | null) => void, now = Date.now) {
  let deadline: number | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timeout !== undefined) clearTimeout(timeout); timeout = undefined; };
  function cancel() {
    clear();
    deadline = null;
    onChange(null);
  }
  function check() {
    if (deadline === null) return;
    clear();
    const remaining = deadline - now();
    if (remaining <= 0) {
      cancel();
      onExpire();
    } else timeout = setTimeout(check, remaining);
  }
  return {
    setMinutes(minutes: number | null) {
      if (minutes === null) { cancel(); return; }
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) throw new Error("停止タイマーは1〜240分で設定してください。");
      clear();
      deadline = now() + Math.round(minutes * 60_000);
      onChange(deadline);
      check();
    },
    cancel,
    check,
    dispose: clear,
  };
}
