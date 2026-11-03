import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppAudio } from "./AudioProvider";
import type { RoomVoiceRoom } from "./roomVoiceSelection";
import type { RhythmVoicePlaybackState } from "./rhythmVoicePlayback";

/** Session audio is scoped to the visible, foreground room. */
export function useRoomVoicePlayback(room: RoomVoiceRoom, running: boolean, options?: { paused: boolean; finished?: boolean; rhythmVoices?: RhythmVoicePlaybackState }) {
  const { setRoomAudioScene, setRoomAudioPaused, setSessionAudioActive, stopEffect } = useAppAudio();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const finished = room === "rhythm" && options?.finished === true;
  const scene = finished ? "rhythm-finished" : room;
  const paused = room === "rhythm" && !finished && !running && options?.paused === true;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const rhythmVoicesRef = useRef(options?.rhythmVoices);
  rhythmVoicesRef.current = options?.rhythmVoices;
  const resting = options?.rhythmVoices?.resting;
  const interruptions = options?.rhythmVoices?.interruptions;
  // Keep the same room/player instances across a rhythm pause. Focus loss or
  // backgrounding still releases the scene, so it cannot play off-screen.
  const active = foreground && (running || paused || finished);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);
  useFocusEffect(useCallback(() => {
    if (!active) return;
    setSessionAudioActive(true);
    setRoomAudioScene(scene, pausedRef.current, rhythmVoicesRef.current);
    return () => {
      if (room === "rhythm") stopEffect("rhythmBeat");
      if (room === "training") stopEffect("trainingRhythm");
      setRoomAudioScene(null); setSessionAudioActive(false);
    };
  }, [active, room, scene, setRoomAudioScene, setSessionAudioActive, stopEffect]));
  useEffect(() => {
    if (room !== "rhythm" || !active || finished) return;
    setRoomAudioPaused(paused, rhythmVoicesRef.current);
    if (paused) stopEffect("rhythmBeat");
  }, [active, paused, resting, interruptions, room, finished, setRoomAudioPaused, stopEffect]);
}
