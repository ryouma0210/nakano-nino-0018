import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAudioPlayer } from "expo-audio";
import { AppState, Platform } from "react-native";
import { settingsService } from "@/services/settingsService";
import type { AppSettings } from "@/types/models";
import { createLoopPlayback } from "./loopPlayback";
import { getRoomAudioTracks, type RoomAudioScene } from "./roomAudio";
import { RoomAudioPlayback } from "./RoomAudioPlayback";
import { useLoopSleepTimer } from "./useLoopSleepTimer";
import { useLoopMediaControls } from "./useLoopMediaControls";
import { translateText } from "@/i18n";

export type { RoomAudioScene } from "./roomAudio";

type EffectName = "button" | "dialogue" | "preparationLoop" | "defeatLoop" | "trainingStart" | "trainingRhythm" | "outsideEscape" | "outsideAttack" | "outsideEvade" | "outsideEarLick" | "outsideNipple" | "outsideLossRhythm" | "levelUp" | "punishmentHit" | "ejaculation" | "complete";
export type LoopAudioName = "earLick" | "nippleScratch" | "ikunaSine" | "bokkisiro" | "sineW" | "dase" | "kousokusikosiko" | "kousokutikubikarikari" | "sikosiko";
export type BgmMode = "default" | "outsideBright" | "outsideTemptation" | "outsideBattle" | "outsideCharm";
type AudioContextValue = {
  settings: AppSettings | null;
  updateAudioSettings: (partial: Partial<AppSettings>) => Promise<void>;
  playEffect: (name: EffectName) => void;
  stopEffect: (name: EffectName) => void;
  bgmMode: BgmMode;
  setBgmMode: (mode: BgmMode) => void;
  loopAudioNames: readonly LoopAudioName[];
  playLoopAudio: (name: LoopAudioName) => void;
  stopLoopAudio: (name?: LoopAudioName) => void;
  loopSleepDeadline: number | null;
  setLoopSleepMinutes: (minutes: number | null) => void;
  setSessionAudioActive: (active: boolean) => void;
  setRoomAudioScene: (scene: RoomAudioScene | null) => void;
};

const AudioContext = createContext<AudioContextValue>({
  settings: null,
  updateAudioSettings: async () => {},
  playEffect: () => {},
  stopEffect: () => {},
  bgmMode: "default",
  setBgmMode: () => {},
  loopAudioNames: [],
  playLoopAudio: () => {},
  stopLoopAudio: () => {},
  loopSleepDeadline: null,
  setLoopSleepMinutes: () => {},
  setSessionAudioActive: () => {},
  setRoomAudioScene: () => {},
});

const bgmSource = require("../../assets/audio/kyouhunomori.m4a");
const outsideBrightBgmSource = require("../../assets/audio/outside-bright-explore.m4a");
const outsideTemptationBgmSource = require("../../assets/audio/voice-samples/voice_whisper.wav");
const outsideBattleBgmSource = require("../../assets/audio/kyouhunomori.m4a");
const outsideCharmBgmSource = require("../../assets/audio/yuuwakubgm.m4a");

export function AudioProvider({ children }: PropsWithChildren) {
  // Expo Go is used only for layout checks. Creating every native audio player
  // at startup can overwhelm the emulator audio device and leave the UI black.
  if (__DEV__ && Platform.OS !== "web") return <SilentAudioProvider>{children}</SilentAudioProvider>;
  return <ActiveAudioProvider>{children}</ActiveAudioProvider>;
}

function SilentAudioProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [bgmMode, setBgmMode] = useState<BgmMode>("default");

  useEffect(() => {
    settingsService.load().then(setSettings).catch(console.error);
  }, []);

  const updateAudioSettings = useCallback(async (partial: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    await settingsService.save(next);
  }, [settings]);

  const value = useMemo<AudioContextValue>(() => ({
    settings,
    updateAudioSettings,
    playEffect: () => {},
    stopEffect: () => {},
    bgmMode,
    setBgmMode,
    loopAudioNames: [],
    playLoopAudio: () => {},
    stopLoopAudio: () => {},
    loopSleepDeadline: null,
    setLoopSleepMinutes: () => {},
    setSessionAudioActive: () => {},
    setRoomAudioScene: () => {},
  }), [bgmMode, settings, updateAudioSettings]);

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

function ActiveAudioProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sessionAudioActive, setSessionAudioActive] = useState(false);
  const [roomAudioScene, setRoomAudioScene] = useState<RoomAudioScene | null>(null);
  const [loopAudioNames, setLoopAudioNames] = useState<LoopAudioName[]>([]);
  const [bgmMode, setBgmMode] = useState<BgmMode>("default");
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === "active");
  const roomAudioTracks = getRoomAudioTracks(roomAudioScene, settings, appIsActive);
  const roomAudioActive = roomAudioTracks.length > 0;
  const bgm = useAudioPlayer(bgmSource);
  const outsideBrightBgm = useAudioPlayer(outsideBrightBgmSource);
  const outsideTemptationBgm = useAudioPlayer(outsideTemptationBgmSource);
  const outsideBattleBgm = useAudioPlayer(outsideBattleBgmSource);
  const outsideCharmBgm = useAudioPlayer(outsideCharmBgmSource);
  const button = useAudioPlayer(require("../../assets/audio/button.wav"));
  const dialogue = useAudioPlayer(require("../../assets/audio/dialogue-next.wav"));
  const preparationLoop = useAudioPlayer(require("../../assets/audio/toiki.m4a"));
  const defeatLoop = useAudioPlayer(require("../../assets/audio/tikubikarikariseme.m4a"));
  const trainingStart = useAudioPlayer(require("../../assets/audio/miminame.m4a"));
  const trainingRhythm = useAudioPlayer(require("../../assets/audio/tekoki.m4a"));
  const outsideEscape = useAudioPlayer(require("../../assets/audio/dialogue-next.wav"));
  const outsideAttack = useAudioPlayer(require("../../assets/audio/punishment-hit.wav"));
  const outsideEvade = useAudioPlayer(require("../../assets/audio/button.wav"));
  const outsideEarLick = useAudioPlayer(require("../../assets/audio/miminame.m4a"));
  const outsideNipple = useAudioPlayer(require("../../assets/audio/tikubikarikariseme.m4a"));
  const outsideLossRhythm = useAudioPlayer(require("../../assets/audio/tekoki.m4a"));
  const levelUp = useAudioPlayer(require("../../assets/audio/level-up.wav"));
  const punishmentHit = useAudioPlayer(require("../../assets/audio/punishment-hit.wav"));
  const ejaculation = useAudioPlayer(require("../../assets/audio/syasei.m4a"));
  const complete = useAudioPlayer(require("../../assets/audio/training-complete.wav"));
  const earLickLoop = useAudioPlayer(require("../../assets/audio/miminame.m4a"));
  const nippleScratchLoop = useAudioPlayer(require("../../assets/audio/tikubikarikariseme.m4a"));
  const ikunaSineLoop = useAudioPlayer(require("../../assets/audio/ikuna-sine.m4a"));
  const bokkisiroLoop = useAudioPlayer(require("../../assets/audio/bokkisiro.m4a"));
  const sineWLoop = useAudioPlayer(require("../../assets/audio/sine-w.m4a"));
  const daseLoop = useAudioPlayer(require("../../assets/audio/dase.m4a"));
  const kousokusikosikoLoop = useAudioPlayer(require("../../assets/audio/kousokusikosiko.m4a"));
  const kousokutikubikarikariLoop = useAudioPlayer(require("../../assets/audio/kousokutikubikarikari.m4a"));
  const sikosikoLoop = useAudioPlayer(require("../../assets/audio/sikosiko.m4a"));
  const loopPlayers = useMemo(() => ({
    earLick: earLickLoop,
    nippleScratch: nippleScratchLoop,
    ikunaSine: ikunaSineLoop,
    bokkisiro: bokkisiroLoop,
    sineW: sineWLoop,
    dase: daseLoop,
    kousokusikosiko: kousokusikosikoLoop,
    kousokutikubikarikari: kousokutikubikarikariLoop,
    sikosiko: sikosikoLoop,
  } satisfies Record<LoopAudioName, typeof earLickLoop>), [bokkisiroLoop, daseLoop, earLickLoop, ikunaSineLoop, kousokusikosikoLoop, kousokutikubikarikariLoop, nippleScratchLoop, sikosikoLoop, sineWLoop]);
  const manualLoopPlayers = useMemo(() => Object.values(loopPlayers), [loopPlayers]);
  const loopPlayback = useMemo(() => createLoopPlayback(manualLoopPlayers), [manualLoopPlayers]);
  const stopLoopAudioRef = useRef<(name?: LoopAudioName) => void>(() => {});
  const loopMediaControls = useLoopMediaControls(
    manualLoopPlayers,
    loopAudioNames.length > 0,
    translateText("ループ音声", settings?.language ?? "ja"),
    () => stopLoopAudioRef.current(),
    (player) => loopPlayback.stop(player),
    (player) => {
      const name = (Object.keys(loopPlayers) as LoopAudioName[]).find((key) => loopPlayers[key] === player);
      if (name) stopLoopAudioRef.current(name);
    },
  );
  const { deadline: loopSleepDeadline, timer: loopSleepTimer } = useLoopSleepTimer(() => stopLoopAudioRef.current());
  const setLoopSleepMinutes = useCallback((minutes: number | null) => {
    if (minutes === null || loopAudioNames.length > 0) loopSleepTimer.setMinutes(minutes);
  }, [loopAudioNames.length, loopSleepTimer]);

  useEffect(() => {
    if (loopAudioNames.length === 0) loopSleepTimer.cancel();
  }, [loopAudioNames.length, loopSleepTimer]);

  // useAudioPlayer releases each player; invalidate pending starts on unmount too.
  useEffect(() => () => loopPlayback.cancelPending(), [loopPlayback]);

  useEffect(() => {
    settingsService.load().then(setSettings);
  }, []);

  useEffect(() => {
    const backgroundPausedPlayers = [
      bgm,
      outsideBrightBgm,
      outsideTemptationBgm,
      outsideBattleBgm,
      outsideCharmBgm,
      button,
      dialogue,
      preparationLoop,
      defeatLoop,
      trainingStart,
      trainingRhythm,
      outsideEscape,
      outsideAttack,
      outsideEvade,
      outsideEarLick,
      outsideNipple,
      outsideLossRhythm,
      levelUp,
      punishmentHit,
      ejaculation,
      complete,
    ];
    const subscription = AppState.addEventListener("change", (nextState) => {
      const active = nextState === "active";
      setAppIsActive(active);
      if (!active) {
        backgroundPausedPlayers.forEach((player) => player.pause());
      }
    });
    return () => subscription.remove();
  }, [bgm, button, complete, defeatLoop, dialogue, ejaculation, levelUp, outsideAttack, outsideBattleBgm, outsideBrightBgm, outsideCharmBgm, outsideEarLick, outsideEscape, outsideEvade, outsideLossRhythm, outsideNipple, outsideTemptationBgm, preparationLoop, punishmentHit, trainingRhythm, trainingStart]);

  useEffect(() => {
    if (!settings) return;
    const bgms = {
      default: bgm,
      outsideBright: outsideBrightBgm,
      outsideTemptation: outsideTemptationBgm,
      outsideBattle: outsideBattleBgm,
      outsideCharm: outsideCharmBgm,
    };
    Object.entries(bgms).forEach(([mode, player]) => {
      player.pause();
      player.loop = true;
      player.volume = mode === "outsideCharm" ? Math.min(1, settings.musicVolume * 1.35) : settings.musicVolume;
    });
    if (appIsActive && settings.backgroundMusicEnabled && !sessionAudioActive && !roomAudioActive && loopAudioNames.length === 0) {
      bgms[bgmMode].play();
    }
  }, [appIsActive, bgm, bgmMode, loopAudioNames, outsideBattleBgm, outsideBrightBgm, outsideCharmBgm, outsideTemptationBgm, roomAudioActive, sessionAudioActive, settings]);

  const updateAudioSettings = useCallback(async (partial: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    await settingsService.save(next);
  }, [settings]);

  const playEffect = useCallback((name: EffectName) => {
    if (!settings?.soundEnabled) return;
    const player = { button, dialogue, preparationLoop, defeatLoop, trainingStart, trainingRhythm, outsideEscape, outsideAttack, outsideEvade, outsideEarLick, outsideNipple, outsideLossRhythm, levelUp, punishmentHit, ejaculation, complete }[name];
    player.loop = name === "preparationLoop"
      || name === "defeatLoop"
      || name === "trainingStart"
      || name === "outsideEarLick"
      || name === "outsideNipple"
      || name === "outsideLossRhythm";
    player.volume = settings.soundVolume;
    player.seekTo(0).then(() => player.play()).catch(console.error);
  }, [button, complete, defeatLoop, dialogue, ejaculation, levelUp, outsideAttack, outsideEarLick, outsideEscape, outsideEvade, outsideLossRhythm, outsideNipple, preparationLoop, punishmentHit, settings, trainingRhythm, trainingStart]);

  const stopEffect = useCallback((name: EffectName) => {
    const player = { button, dialogue, preparationLoop, defeatLoop, trainingStart, trainingRhythm, outsideEscape, outsideAttack, outsideEvade, outsideEarLick, outsideNipple, outsideLossRhythm, levelUp, punishmentHit, ejaculation, complete }[name];
    player.pause();
    player.seekTo(0).catch(console.error);
  }, [button, complete, defeatLoop, dialogue, ejaculation, levelUp, outsideAttack, outsideEarLick, outsideEscape, outsideEvade, outsideLossRhythm, outsideNipple, preparationLoop, punishmentHit, trainingRhythm, trainingStart]);

  const stopLoopAudio = useCallback((name?: LoopAudioName) => {
    // Update intent before pause/seek emits status events. A local single-stop
    // must not be mistaken for an OS request to stop all the loops.
    loopMediaControls.stop(name ? loopPlayers[name] : undefined);
    if (!name) loopSleepTimer.cancel();
    loopPlayback.stop(name ? loopPlayers[name] : undefined);
    setLoopAudioNames((current) => name ? current.filter((item) => item !== name) : []);
  }, [loopMediaControls, loopPlayback, loopPlayers, loopSleepTimer]);
  stopLoopAudioRef.current = stopLoopAudio;

  const playLoopAudio = useCallback((name: LoopAudioName) => {
    if (!settings?.soundEnabled) return;
    setLoopAudioNames((current) => current.includes(name) ? current : [...current, name]);
    loopMediaControls.start(loopPlayers[name], () => loopPlayback.play(loopPlayers[name], settings.soundVolume));
  }, [loopMediaControls, loopPlayback, loopPlayers, settings]);

  useEffect(() => {
    if (!settings || loopAudioNames.length === 0) return;
    if (!settings.soundEnabled) {
      stopLoopAudio();
      return;
    }
    loopAudioNames.forEach((name) => {
      loopPlayers[name].volume = settings.soundVolume;
    });
  }, [loopAudioNames, loopPlayers, settings, stopLoopAudio]);

  const value = useMemo(
    () => ({
      settings,
      updateAudioSettings,
      playEffect,
      stopEffect,
      bgmMode,
      setBgmMode,
      loopAudioNames,
      playLoopAudio,
      stopLoopAudio,
      loopSleepDeadline,
      setLoopSleepMinutes,
      setSessionAudioActive,
      setRoomAudioScene,
    }),
    [bgmMode, loopAudioNames, loopSleepDeadline, setLoopSleepMinutes, playEffect, playLoopAudio, settings, stopEffect, stopLoopAudio, updateAudioSettings],
  );
  return (
    <AudioContext.Provider value={value}>
      <RoomAudioPlayback tracks={roomAudioTracks} />
      {children}
    </AudioContext.Provider>
  );
}

export function useAppAudio() {
  return useContext(AudioContext);
}
