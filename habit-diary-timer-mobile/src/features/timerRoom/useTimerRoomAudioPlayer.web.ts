import { useEffect, useMemo, useRef } from "react";
import { Asset } from "expo-asset";
import { createBrowserSessionAudio } from "../../audio/browserSessionAudio";

export function useTimerRoomAudioPlayer(source: number, onError: (error: unknown) => void) {
  const uri = Asset.fromModule(source).uri;
  const reportError = useRef(onError);
  reportError.current = onError;
  const handle = useMemo(() => {
    const current = { disposed: false };
    const player = createBrowserSessionAudio(uri, (error) => {
      if (!current.disposed) reportError.current(error);
    });
    return { player, current };
  }, [uri]);
  useEffect(() => () => {
    handle.current.disposed = true;
    handle.player.dispose();
  }, [handle]);
  return handle.player;
}
