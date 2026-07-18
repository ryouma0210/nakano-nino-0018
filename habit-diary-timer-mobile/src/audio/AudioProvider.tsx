/* eslint-disable react-hooks/immutability */
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useSegments } from "expo-router";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { settingsService } from "@/services/settingsService";
import type { AppSettings } from "@/types/models";

type EffectName = "button" | "dialogue" | "trainingRhythm" | "punishmentHit" | "ejaculation" | "complete";
type AudioContextValue = {
  settings: AppSettings | null;
  updateAudioSettings: (partial: Partial<AppSettings>) => Promise<void>;
  playEffect: (name: EffectName) => void;
};

const AudioContext = createContext<AudioContextValue>({ settings: null, updateAudioSettings: async () => {}, playEffect: () => {} });

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
  const bgm = useAudioPlayer(null);
  const button = useAudioPlayer(require("../../assets/audio/button.wav"));
  const dialogue = useAudioPlayer(require("../../assets/audio/dialogue-next.wav"));
  const trainingRhythm = useAudioPlayer(require("../../assets/audio/training-rhythm.wav"));
  const punishmentHit = useAudioPlayer(require("../../assets/audio/punishment-hit.wav"));
  const ejaculation = useAudioPlayer(require("../../assets/audio/ejaculation.wav"));
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
    bgm.replace(bgmSources[bgmKey]);
    bgm.loop = true;
    bgm.volume = settings.musicVolume;
    if (settings.backgroundMusicEnabled) bgm.play();
    else bgm.pause();
    return () => bgm.pause();
  }, [bgm, bgmKey, settings]);

  const updateAudioSettings = useCallback(async (partial: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    await settingsService.save(next);
  }, [settings]);

  const playEffect = useCallback((name: EffectName) => {
    if (!settings?.soundEnabled) return;
    const player = { button, dialogue, trainingRhythm, punishmentHit, ejaculation, complete }[name];
    player.volume = settings.soundVolume;
    player.seekTo(0).then(() => player.play());
  }, [button, complete, dialogue, ejaculation, punishmentHit, settings, trainingRhythm]);

  const value = useMemo(() => ({ settings, updateAudioSettings, playEffect }), [playEffect, settings, updateAudioSettings]);
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAppAudio() {
  return useContext(AudioContext);
}
