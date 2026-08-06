/* eslint-disable react-hooks/immutability */
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { settingsService } from "@/services/settingsService";
import type { AppSettings } from "@/types/models";

type EffectName = "button" | "dialogue" | "preparationLoop" | "defeatLoop" | "trainingStart" | "trainingRhythm" | "punishmentHit" | "ejaculation" | "complete";
export type LoopAudioName = "earLick" | "nippleScratch";
export type BgmMode = "default" | "outsideTemptation" | "outsideBattle" | "outsideCharm";
type AudioContextValue = {
  settings: AppSettings | null;
  updateAudioSettings: (partial: Partial<AppSettings>) => Promise<void>;
  playEffect: (name: EffectName) => void;
  stopEffect: (name: EffectName) => void;
  bgmMode: BgmMode;
  setBgmMode: (mode: BgmMode) => void;
  loopAudioName: LoopAudioName | null;
  playLoopAudio: (name: LoopAudioName) => void;
  stopLoopAudio: () => void;
  setSessionAudioActive: (active: boolean) => void;
};

const AudioContext = createContext<AudioContextValue>({
  settings: null,
  updateAudioSettings: async () => {},
  playEffect: () => {},
  stopEffect: () => {},
  bgmMode: "default",
  setBgmMode: () => {},
  loopAudioName: null,
  playLoopAudio: () => {},
  stopLoopAudio: () => {},
  setSessionAudioActive: () => {},
});

const bgmSource = require("../../assets/audio/kyouhunomori.mp4");
const outsideTemptationBgmSource = require("../../assets/audio/voice-samples/voice_whisper.wav");
const outsideBattleBgmSource = require("../../assets/audio/kyouhunomori.mp4");
const outsideCharmBgmSource = require("../../assets/audio/yuuwakubgm.mp4");

export function AudioProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sessionAudioActive, setSessionAudioActive] = useState(false);
  const [loopAudioName, setLoopAudioName] = useState<LoopAudioName | null>(null);
  const [bgmMode, setBgmMode] = useState<BgmMode>("default");
  const bgm = useAudioPlayer(bgmSource);
  const outsideTemptationBgm = useAudioPlayer(outsideTemptationBgmSource);
  const outsideBattleBgm = useAudioPlayer(outsideBattleBgmSource);
  const outsideCharmBgm = useAudioPlayer(outsideCharmBgmSource);
  const button = useAudioPlayer(require("../../assets/audio/button.wav"));
  const dialogue = useAudioPlayer(require("../../assets/audio/dialogue-next.wav"));
  const preparationLoop = useAudioPlayer(require("../../assets/audio/toiki.mp4"));
  const defeatLoop = useAudioPlayer(require("../../assets/audio/tikubikarikariseme.mp4"));
  const trainingStart = useAudioPlayer(require("../../assets/audio/miminame.mp4"));
  const trainingRhythm = useAudioPlayer(require("../../assets/audio/tekoki.mp4"));
  const punishmentHit = useAudioPlayer(require("../../assets/audio/punishment-hit.wav"));
  const ejaculation = useAudioPlayer(require("../../assets/audio/syasei.mp4"));
  const complete = useAudioPlayer(require("../../assets/audio/training-complete.wav"));
  const earLickLoop = useAudioPlayer(require("../../assets/audio/miminame.mp4"));
  const nippleScratchLoop = useAudioPlayer(require("../../assets/audio/tikubikarikariseme.mp4"));

  useEffect(() => {
    if (typeof setAudioModeAsync === "function") {
      setAudioModeAsync({
        interruptionMode: "mixWithOthers",
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      }).catch(console.error);
    }
    settingsService.load().then(setSettings);
  }, []);

  useEffect(() => {
    if (!settings) return;
    const bgms = {
      default: bgm,
      outsideTemptation: outsideTemptationBgm,
      outsideBattle: outsideBattleBgm,
      outsideCharm: outsideCharmBgm,
    };
    Object.values(bgms).forEach((player) => {
      player.pause();
      player.loop = true;
      player.volume = settings.musicVolume;
    });
    if (settings.backgroundMusicEnabled && !sessionAudioActive && !loopAudioName) {
      bgms[bgmMode].play();
    }
  }, [bgm, bgmMode, loopAudioName, outsideBattleBgm, outsideCharmBgm, outsideTemptationBgm, sessionAudioActive, settings]);

  const updateAudioSettings = useCallback(async (partial: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    await settingsService.save(next);
  }, [settings]);

  const playEffect = useCallback((name: EffectName) => {
    if (!settings?.soundEnabled) return;
    const player = { button, dialogue, preparationLoop, defeatLoop, trainingStart, trainingRhythm, punishmentHit, ejaculation, complete }[name];
    player.loop = name === "preparationLoop" || name === "defeatLoop" || name === "trainingStart";
    player.volume = settings.soundVolume;
    player.seekTo(0).then(() => player.play()).catch(console.error);
  }, [button, complete, defeatLoop, dialogue, ejaculation, preparationLoop, punishmentHit, settings, trainingRhythm, trainingStart]);

  const stopEffect = useCallback((name: EffectName) => {
    const player = { button, dialogue, preparationLoop, defeatLoop, trainingStart, trainingRhythm, punishmentHit, ejaculation, complete }[name];
    player.pause();
    player.seekTo(0).catch(console.error);
  }, [button, complete, defeatLoop, dialogue, ejaculation, preparationLoop, punishmentHit, trainingRhythm, trainingStart]);

  const stopLoopAudio = useCallback(() => {
    earLickLoop.pause();
    nippleScratchLoop.pause();
    earLickLoop.seekTo(0).catch(console.error);
    nippleScratchLoop.seekTo(0).catch(console.error);
    setLoopAudioName(null);
    setSessionAudioActive(false);
  }, [earLickLoop, nippleScratchLoop]);

  const playLoopAudio = useCallback((name: LoopAudioName) => {
    if (!settings?.soundEnabled) return;
    const nextPlayer = name === "earLick" ? earLickLoop : nippleScratchLoop;
    const otherPlayer = name === "earLick" ? nippleScratchLoop : earLickLoop;
    otherPlayer.pause();
    otherPlayer.seekTo(0).catch(console.error);
    nextPlayer.loop = true;
    nextPlayer.volume = settings.soundVolume;
    setSessionAudioActive(true);
    setLoopAudioName(name);
    nextPlayer.seekTo(0).then(() => nextPlayer.play()).catch(console.error);
  }, [earLickLoop, nippleScratchLoop, settings]);

  useEffect(() => {
    if (!settings || !loopAudioName) return;
    const player = loopAudioName === "earLick" ? earLickLoop : nippleScratchLoop;
    player.volume = settings.soundVolume;
    if (!settings.soundEnabled) stopLoopAudio();
  }, [earLickLoop, loopAudioName, nippleScratchLoop, settings, stopLoopAudio]);

  const value = useMemo(
    () => ({
      settings,
      updateAudioSettings,
      playEffect,
      stopEffect,
      bgmMode,
      setBgmMode,
      loopAudioName,
      playLoopAudio,
      stopLoopAudio,
      setSessionAudioActive,
    }),
    [bgmMode, loopAudioName, playEffect, playLoopAudio, settings, stopEffect, stopLoopAudio, updateAudioSettings],
  );
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAppAudio() {
  return useContext(AudioContext);
}
