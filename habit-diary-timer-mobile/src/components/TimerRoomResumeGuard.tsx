import { useEffect, useRef, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { router, usePathname, useRootNavigationState } from "expo-router";
import { timerRoomStore } from "@/features/timerRoom/store";
import { isTimerRoomActive, TIMER_ROOM_SESSION_KEY } from "@/features/timerRoom/session";

/** Restore an unfinished timer after reload, foregrounding or in-app navigation. */
export function TimerRoomResumeGuard() {
  const snapshot = useSyncExternalStore(timerRoomStore.subscribe, timerRoomStore.getSnapshot, timerRoomStore.getSnapshot);
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const requestedPath = useRef<string | null>(null);

  useEffect(() => {
    const restore = () => { void timerRoomStore.load().catch(() => {}); };
    restore();
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") restore(); });
    if (Platform.OS !== "web" || typeof window === "undefined") return () => appState.remove();
    const visibility = () => { if (document.visibilityState === "visible") restore(); };
    const storage = (event: StorageEvent) => { if (event.key === TIMER_ROOM_SESSION_KEY || event.key === null) restore(); };
    window.addEventListener("focus", restore);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      appState.remove();
      window.removeEventListener("focus", restore);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    if (!navigation?.key || !snapshot.ready || pathname === "/timer-room"
      || !isTimerRoomActive(snapshot.session)) {
      requestedPath.current = null;
      return;
    }
    // The same path may render repeatedly while Expo Router applies replace().
    const request = `${snapshot.session!.id}:${pathname}`;
    if (requestedPath.current === request) return;
    requestedPath.current = request;
    router.replace("/(tabs)/timer-room");
  }, [navigation?.key, pathname, snapshot]);

  return null;
}
