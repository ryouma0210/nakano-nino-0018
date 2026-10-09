import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AppState, Platform } from "react-native";
import { setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { createLoopMediaControls, installLoopMediaSessionActions } from "./loopMediaControls";

export function useLoopMediaControls(
  players: readonly AudioPlayer[],
  active: boolean,
  title: string,
  onExternalStop: () => void,
  onUnexpectedPlayback: (player: AudioPlayer) => void,
  onStartFailure: (player: AudioPlayer) => void,
) {
  const callbacks = useRef({ onExternalStop, onUnexpectedPlayback, onStartFailure });
  callbacks.current = { onExternalStop, onUnexpectedPlayback, onStartFailure };
  const controls = useMemo(() => createLoopMediaControls(players, {
    setMode: (interruptionMode) => setAudioModeAsync({
      interruptionMode,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    }),
    onExternalStop: () => callbacks.current.onExternalStop(),
    onUnexpectedPlayback: (player) => callbacks.current.onUnexpectedPlayback(player),
    onStartFailure: (player) => callbacks.current.onStartFailure(player),
    onError: console.error,
    installStopActions: Platform.OS === "web"
      ? (stop) => installLoopMediaSessionActions(typeof navigator === "undefined" ? undefined : navigator.mediaSession, stop)
      : undefined,
  }), [players]);

  useLayoutEffect(() => {
    controls.initialize();
    const subscriptions = players.map((player) => player.addListener("playbackStatusUpdate", (status) => controls.checkPlayer(player, status)));
    const appState = AppState.addEventListener("change", () => controls.check());
    const visible = () => controls.check();
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", visible);
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      appState.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", visible);
      controls.dispose();
    };
  }, [controls, players]);

  useEffect(() => {
    if (!active) return;
    // iOS remote pause has no dedicated JS event. Poll only while manual loops
    // are requested; native events and foreground checks cover other periods.
    const interval = setInterval(() => { if (controls.hasRequests()) controls.check(); }, 250);
    return () => clearInterval(interval);
  }, [active, controls]);

  useEffect(() => { controls.updateTitle(title); }, [controls, title]);
  return controls;
}
