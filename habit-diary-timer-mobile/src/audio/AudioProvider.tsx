/* eslint-disable react-hooks/immutability */
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useSegments } from "expo-router";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { settingsService } from "@/services/settingsService";
import type { AppSettings } from "@/types/models";

type EffectName = "button" | "dialogue" | "preparationLoop" | "trainingStart" | "trainingRhythm" | "punishmentHit" | "ejaculation" | "complete";
type AudioContextValue = {
  settings: AppSettings | null;
  updateAudioSettings: (partial: Partial<AppSettings>) => Promise<void>;
  playEffect: (name: EffectName) => void;
  stopEffect: (name: EffectName) => void;
  setSessionAudioActive: (active: boolean) => void;
};

const AudioContext = createContext<AudioContextValue>({
  settings: null,
  updateAudioSettings: async () => {},
  playEffect: () => {},
  stopEffect: () => {},
  setSessionAudioActive: () => {},
});

const bgmSources = {
  start: require("../../assets/audio/bgm-start.wav"),
  home: require("../../assets/audio/bgm-home.wav"),
  preparation: require("../../assets/audio/bgm-preparation.wav"),
  training: require("../../assets/audio/bgm-training.wav"),
  punishment: require("../../assets/audio/bgm-punishment.wav"),
  diary: require("../../assets/audio/bgm-diary.wav"),
  system: require("../../assets/audio/bgm-system.wav"),
};

export function AudioProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const segments = useSegments();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sessionAudioActive, setSessionAudioActive] = useState(false);
  const bgm = useAudioPlayer(null);
  const button = useAudioPlayer(require("../../assets/audio/button.wav"));
  const dialogue = useAudioPlayer(require("../../assets/audio/dialogue-next.wav"));
  const preparationLoop = useAudioPlayer(require("../../assets/audio/toiki.mp4"));
  const trainingStart = useAudioPlayer(require("../../assets/audio/miminame.mp4"));
  const trainingRhythm = useAudioPlayer(require("../../assets/audio/tekoki.mp4"));
  const punishmentHit = useAudioPlayer(require("../../assets/audio/punishment-hit.wav"));
  const ejaculation = useAudioPlayer(require("../../assets/audio/syasei.mp4"));
  const complete = useAudioPlayer(require("../../assets/audio/training-complete.wav"));

  useEffect(() => {
    setAudioModeAsync({ interruptionMode: "mixWithOthers", playsInSilentMode: true }).catch(console.error);
    settingsService.load().then(setSettings);
  }, []);

  const inTabs = segments[0] === "(tabs)";
  const bgmKey = !inTabs
    ? "start"
    : pathname.includes("habits")
      ? "training"
      : pathname.includes("preparation")
        ? "preparation"
        : pathname.includes("timer")
          ? "punishment"
          : pathname.includes("records")
            ? "diary"
            : pathname === "/" || pathname === "/index"
              ? "home"
              : "system";

  useEffect(() => {
    if (!settings) return;
    bgm.pause();
    bgm.replace(bgmSources[bgmKey]);
    bgm.loop = true;
    bgm.volume = settings.musicVolume;
    if (settings.backgroundMusicEnabled && !sessionAudioActive) bgm.play();
    return () => bgm.pause();
  }, [bgm, bgmKey, sessionAudioActive, settings]);

  const updateAudioSettings = useCallback(async (partial: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    await settingsService.save(next);
  }, [settings]);

  const playEffect = useCallback((name: EffectName) => {
    if (!settings?.soundEnabled) return;
    const player = { button, dialogue, preparationLoop, trainingStart, trainingRhythm, punishmentHit, ejaculation, complete }[name];
    player.loop = name === "preparationLoop" || name === "trainingStart";
    player.volume = settings.soundVolume;
    player.seekTo(0).then(() => player.play()).catch(console.error);
  }, [button, complete, dialogue, ejaculation, preparationLoop, punishmentHit, settings, trainingRhythm, trainingStart]);

  const stopEffect = useCallback((name: EffectName) => {
    const player = { button, dialogue, preparationLoop, trainingStart, trainingRhythm, punishmentHit, ejaculation, complete }[name];
    player.pause();
    player.seekTo(0).catch(console.error);
  }, [button, complete, dialogue, ejaculation, preparationLoop, punishmentHit, trainingRhythm, trainingStart]);

  const value = useMemo(
    () => ({
      settings,
      updateAudioSettings,
      playEffect,
      stopEffect,
      setSessionAudioActive,
    }),
    [playEffect, settings, stopEffect, updateAudioSettings],
  );
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAppAudio() {
  return useContext(AudioContext);
}
