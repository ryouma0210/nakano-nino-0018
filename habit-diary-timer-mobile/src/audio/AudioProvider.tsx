/* eslint-disable react-hooks/immutability */
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "expo-router";
import { useAudioPlayer } from "expo-audio";
import { settingsService } from "@/services/settingsService";
import type { AppSettings } from "@/types/models";

type EffectName = "button" | "dialogue" | "rhythm" | "complete";
type AudioContextValue = {
  settings: AppSettings | null;
  updateAudioSettings: (partial: Partial<AppSettings>) => Promise<void>;
  playEffect: (name: EffectName) => void;
};

const AudioContext = createContext<AudioContextValue>({ settings: null, updateAudioSettings: async () => {}, playEffect: () => {} });

const bgmSources = {
  home: require("../../assets/audio/bgm-home.wav"),
  training: require("../../assets/audio/bgm-training.wav"),
  diary: require("../../assets/audio/bgm-diary.wav"),
  system: require("../../assets/audio/bgm-system.wav"),
};

export function AudioProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const bgm = useAudioPlayer(null);
  const button = useAudioPlayer(require("../../assets/audio/button.wav"));
  const dialogue = useAudioPlayer(require("../../assets/audio/dialogue-next.wav"));
  const rhythm = useAudioPlayer(require("../../assets/audio/rhythm-hit.wav"));
  const complete = useAudioPlayer(require("../../assets/audio/training-complete.wav"));

  useEffect(() => { settingsService.load().then(setSettings); }, []);

  const bgmKey = pathname.includes("habits") ? "training" : pathname.includes("records") ? "diary" : pathname === "/" || pathname === "/index" || pathname === "/(tabs)" ? "home" : "system";

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
    const player = { button, dialogue, rhythm, complete }[name];
    player.volume = settings.soundVolume;
    player.seekTo(0).then(() => player.play());
  }, [button, complete, dialogue, rhythm, settings]);

  const value = useMemo(() => ({ settings, updateAudioSettings, playEffect }), [playEffect, settings, updateAudioSettings]);
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAppAudio() {
  return useContext(AudioContext);
}
