import { useEffect, useState } from "react";
import { secondsToClock } from "@/utils/date";

export function useLoopSleepRemaining(deadline: number | null) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return deadline === null ? null : secondsToClock(Math.max(0, Math.ceil((deadline - now) / 1000)));
}
