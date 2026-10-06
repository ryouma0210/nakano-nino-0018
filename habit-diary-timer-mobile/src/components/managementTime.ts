/** The deadline keeps counting in real time, including while the app is closed. */
export function managementRemainingTime(deadlineAt: string, now: number): { days: number; clock: string } {
  const seconds = Math.max(0, Math.ceil((Date.parse(deadlineAt) - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const clock = [Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, "0")).join(":");
  return { days, clock };
}

export function managementDeadlineLabel(deadlineAt: string): string {
  const date = new Date(deadlineAt);
  const datePart = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("/");
  const timePart = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0")).join(":");
  return `${datePart} ${timePart}`;
}
