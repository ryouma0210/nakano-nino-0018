import { useEffect, useRef } from "react";
import { useAudioPlayer } from "expo-audio";

export function useTimerRoomAudioPlayer(source: number, onError: (error: unknown) => void) {
  const player = useAudioPlayer(source);
  const reportError = useRef(onError);
  reportError.current = onError;
  useEffect(() => {
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (status.error) reportError.current(new Error(status.error));
    });
    return () => subscription.remove();
  }, [player]);
  return player;
}
