import { setAudioModeAsync } from "expo-audio";

// All background players share one native audio session. Serialize ownership
// changes so a late completion from the old player cannot undo the new mode.
let pending: Promise<void> = Promise.resolve();

export function setBackgroundAudioMode(interruptionMode: "mixWithOthers" | "doNotMix") {
  const result = pending.then(() => setAudioModeAsync({
    interruptionMode,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
  }));
  pending = result.catch(() => {});
  return result;
}
