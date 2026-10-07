import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { createSleepTimer } from "./sleepTimer";

export function useLoopSleepTimer(onExpire: () => void) {
  const expire = useRef(onExpire);
  expire.current = onExpire;
  const [deadline, setDeadline] = useState<number | null>(null);
  const timer = useMemo(() => createSleepTimer(() => expire.current(), setDeadline), []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", () => timer.check());
    const onVisibility = () => timer.check();
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    return () => {
      subscription.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      timer.dispose();
    };
  }, [timer]);
  return { deadline, timer };
}
