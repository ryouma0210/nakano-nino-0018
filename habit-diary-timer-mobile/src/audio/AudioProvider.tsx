import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { loopMediaTitle } from "./loopAudioLabels";
import { loopAudioSources } from "./loopAudioSources";
import { roomVoiceStore } from "./roomVoiceStore";
import { useSessionAudioPlayer } from "./useSessionAudioPlayer";
import type { RhythmVoicePlaybackState } from "./rhythmVoicePlayback";

export type { RoomAudioScene } from "./roomAudio";

type EffectName = "button" | "rhythmBeat" | "dialogue" | "preparationLoop" | "defeatLoop" | "trainingStart" | "trainingRhythm" | "outsideEscape" | "outsideAttack" | "outsideEvade" | "outsideEarLick" | "outsideNipple" | "outsideLossRhythm" | "levelUp" | "punishmentHit" | "ejaculation" | "complete";
export type LoopAudioName = "breath" | "earLick" | "nippleScratch" | "ikunaSine" | "bokkisiro" | "sineW" | "dase" | "kousokusikosiko" | "kousokutikubikarikari" | "sikosiko";
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
  stopLoopAudio: (name?: LoopAudioName) => Promise<void>;
  loopSleepDeadline: number | null;
  setLoopSleepMinutes: (minutes: number | null) => void;
  setSessionAudioActive: (active: boolean) => void;
  setRoomAudioScene: (scene: RoomAudioScene | null, paused?: boolean, rhythmVoices?: RhythmVoicePlaybackState | null) => void;
  setRoomAudioPaused: (paused: boolean, rhythmVoices?: RhythmVoicePlaybackState | null) => void;
  shouldMixVideoAudio: boolean;
  setVoiceAudioActive: (active: boolean) => void;
  registerVoiceAudioStop: (stop: () => void) => () => void;
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
  stopLoopAudio: async () => {},
  loopSleepDeadline: null,
  setLoopSleepMinutes: () => {},
  setSessionAudioActive: () => {},
  setRoomAudioScene: () => {},
  setRoomAudioPaused: () => {},
  shouldMixVideoAudio: false,
  setVoiceAudioActive: () => {},
  registerVoiceAudioStop: () => () => {},
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
    stopLoopAudio: async () => {},
    loopSleepDeadline: null,
    setLoopSleepMinutes: () => {},
    setSessionAudioActive: () => {},
    setRoomAudioScene: () => {},
    setRoomAudioPaused: () => {},
    shouldMixVideoAudio: false,
    setVoiceAudioActive: () => {},
    registerVoiceAudioStop: () => () => {},
  }), [bgmMode, settings, updateAudioSettings]);

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

function ActiveAudioProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [voiceAudioActive, setVoiceAudioActive] = useState(false);
  const stopVoiceAudio = useRef<(() => void) | null>(null);
  const registerVoiceAudioStop = useCallback((stop: () => void) => {
    stopVoiceAudio.current = stop;
    return () => { if (stopVoiceAudio.current === stop) stopVoiceAudio.current = null; };
  }, []);
  const [sessionAudioActive, setSessionAudioActive] = useState(false);
  const [roomAudioScene, setRoomAudioSceneState] = useState<RoomAudioScene | null>(null);
  const [roomAudioPaused, setRoomAudioPausedState] = useState(false);
  const [rhythmVoices, setRhythmVoices] = useState<RhythmVoicePlaybackState | null>(null);
  const roomAudioPausedRef = useRef(false);
  const activeRoomScene = useRef<RoomAudioScene | null>(null);
  const setRoomAudioScene = useCallback((scene: RoomAudioScene | null, paused = false, rhythmState: RhythmVoicePlaybackState | null = null) => {
    activeRoomScene.current = scene;
    roomAudioPausedRef.current = scene === "rhythm" && paused;
    setRoomAudioPausedState(roomAudioPausedRef.current);
    setRoomAudioSceneState(scene);
    setRhythmVoices(scene === "rhythm" ? rhythmState : null);
  }, []);
  const setRoomAudioPaused = useCallback((paused: boolean, rhythmState: RhythmVoicePlaybackState | null = null) => {
    // Existing rooms keep their stop-on-pause behavior. Only a live rhythm
    // session retains its players for a position-preserving pause.
    if (activeRoomScene.current !== "rhythm") return;
    roomAudioPausedRef.current = paused;
    setRoomAudioPausedState(paused);
    setRhythmVoices(rhythmState);
  }, []);
  const voicePreferences = useSyncExternalStore(roomVoiceStore.subscribe, roomVoiceStore.getSnapshot, roomVoiceStore.getSnapshot);
  const [loopAudioNames, setLoopAudioNames] = useState<LoopAudioName[]>([]);
  const [bgmMode, setBgmMode] = useState<BgmMode>("default");
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === "active");
  const appIsActiveRef = useRef(appIsActive);
  const selectedRoom = roomAudioScene === "training" || roomAudioScene === "punishment" || roomAudioScene === "rhythm" ? roomAudioScene : null;
  const sceneReady = !selectedRoom || voicePreferences.ready;
  const roomAudioTracks = getRoomAudioTracks(voiceAudioActive || !sceneReady ? null : roomAudioScene, settings, appIsActive, loopAudioNames, voicePreferences.preferences, rhythmVoices);
  const roomAudioActive = roomAudioTracks.length > 0;
  useEffect(() => { roomVoiceStore.load().catch(console.error); }, []);
  // Keep videos from reclaiming audio focus while room audio still needs it,
  // including when the last manual loop stops and its room copy takes over.
  const shouldMixVideoAudio = voiceAudioActive || loopAudioNames.length > 0 || sessionAudioActive || roomAudioActive;
  const bgm = useAudioPlayer(bgmSource);
  const outsideBrightBgm = useAudioPlayer(outsideBrightBgmSource);
  const outsideTemptationBgm = useAudioPlayer(outsideTemptationBgmSource);
  const outsideBattleBgm = useAudioPlayer(outsideBattleBgmSource);
  const outsideCharmBgm = useAudioPlayer(outsideCharmBgmSource);
  const button = useSessionAudioPlayer(require("../../assets/audio/button.wav"));
  const rhythmBeat = useSessionAudioPlayer(require("../../assets/audio/button.wav"));
  const rhythmRequests = useRef({ rhythmBeat: 0, trainingRhythm: 0 });
  const dialogue = useAudioPlayer(require("../../assets/audio/dialogue-next.wav"));
  const preparationLoop = useAudioPlayer(require("../../assets/audio/toiki.m4a"));
  const defeatLoop = useAudioPlayer(require("../../assets/audio/tikubikarikariseme.m4a"));
  const trainingStart = useAudioPlayer(require("../../assets/audio/miminame.m4a"));
  const trainingRhythm = useSessionAudioPlayer(require("../../assets/audio/tekoki.m4a"));
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
  const breathLoop = useAudioPlayer(loopAudioSources.breath);
  const earLickLoop = useAudioPlayer(loopAudioSources.earLick);
  const nippleScratchLoop = useAudioPlayer(loopAudioSources.nippleScratch);
  const ikunaSineLoop = useAudioPlayer(loopAudioSources.ikunaSine);
  const bokkisiroLoop = useAudioPlayer(loopAudioSources.bokkisiro);
  const sineWLoop = useAudioPlayer(loopAudioSources.sineW);
  const daseLoop = useAudioPlayer(loopAudioSources.dase);
  const kousokusikosikoLoop = useAudioPlayer(loopAudioSources.kousokusikosiko);
  const kousokutikubikarikariLoop = useAudioPlayer(loopAudioSources.kousokutikubikarikari);
  const sikosikoLoop = useAudioPlayer(loopAudioSources.sikosiko);
  const loopPlayers = useMemo(() => ({
    breath: breathLoop,
    earLick: earLickLoop,
    nippleScratch: nippleScratchLoop,
    ikunaSine: ikunaSineLoop,
    bokkisiro: bokkisiroLoop,
    sineW: sineWLoop,
    dase: daseLoop,
    kousokusikosiko: kousokusikosikoLoop,
    kousokutikubikarikari: kousokutikubikarikariLoop,
    sikosiko: sikosikoLoop,
  } satisfies Record<LoopAudioName, typeof earLickLoop>), [bokkisiroLoop, breathLoop, daseLoop, earLickLoop, ikunaSineLoop, kousokusikosikoLoop, kousokutikubikarikariLoop, nippleScratchLoop, sikosikoLoop, sineWLoop]);
  const manualLoopPlayers = useMemo(() => Object.values(loopPlayers), [loopPlayers]);
  const loopPlayback = useMemo(() => createLoopPlayback(manualLoopPlayers), [manualLoopPlayers]);
  const stopLoopAudioRef = useRef<(name?: LoopAudioName) => void>(() => {});
  const loopMediaControls = useLoopMediaControls(
    manualLoopPlayers,
    loopAudioNames.length > 0,
    loopMediaTitle(loopAudioNames, (text) => translateText(text, settings?.language ?? "ja")),
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
      rhythmBeat,
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
      appIsActiveRef.current = active;
      setAppIsActive(active);
      if (!active) {
        rhythmRequests.current.rhythmBeat += 1;
        rhythmRequests.current.trainingRhythm += 1;
        backgroundPausedPlayers.forEach((player) => player.pause());
      }
    });
    return () => subscription.remove();
  }, [bgm, button, rhythmBeat, complete, defeatLoop, dialogue, ejaculation, levelUp, outsideAttack, outsideBattleBgm, outsideBrightBgm, outsideCharmBgm, outsideEarLick, outsideEscape, outsideEvade, outsideLossRhythm, outsideNipple, outsideTemptationBgm, preparationLoop, punishmentHit, trainingRhythm, trainingStart]);

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
    if (appIsActive && settings.backgroundMusicEnabled && !voiceAudioActive && !sessionAudioActive && !roomAudioActive && loopAudioNames.length === 0) {
      bgms[bgmMode].play();
    }
  }, [appIsActive, bgm, bgmMode, loopAudioNames, outsideBattleBgm, outsideBrightBgm, outsideCharmBgm, outsideTemptationBgm, roomAudioActive, sessionAudioActive, settings, voiceAudioActive]);

  const updateAudioSettings = useCallback(async (partial: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...partial };
    settingsRef.current = next;
    setSettings(next);
    await settingsService.save(next);
  }, [settings]);

  const playEffect = useCallback((name: EffectName) => {
    if (!settings?.soundEnabled) return;
    const tracked = name === "rhythmBeat" || name === "trainingRhythm" ? name : null;
    const stillAllowed = () => {
      if (!tracked) return true;
      const preferences = roomVoiceStore.getSnapshot();
      const room = tracked === "rhythmBeat" ? "rhythm" : "training";
      return appIsActiveRef.current && settingsRef.current?.soundEnabled && preferences.ready
        && activeRoomScene.current === room && !roomAudioPausedRef.current
        && preferences.preferences.rooms[room].builtin.includes(tracked);
    };
    if (!stillAllowed()) return;
    const player = { button, rhythmBeat, dialogue, preparationLoop, defeatLoop, trainingStart, trainingRhythm, outsideEscape, outsideAttack, outsideEvade, outsideEarLick, outsideNipple, outsideLossRhythm, levelUp, punishmentHit, ejaculation, complete }[name];
    player.loop = name === "preparationLoop"
      || name === "defeatLoop"
      || name === "trainingStart"
      || name === "outsideEarLick"
      || name === "outsideNipple"
      || name === "outsideLossRhythm";
    player.volume = settings.soundVolume;
    const request = tracked ? ++rhythmRequests.current[tracked] : null;
    player.seekTo(0).then(() => {
      if ((!tracked || rhythmRequests.current[tracked] === request) && stillAllowed()) player.play();
    }).catch(console.error);
  }, [button, rhythmBeat, complete, defeatLoop, dialogue, ejaculation, levelUp, outsideAttack, outsideEarLick, outsideEscape, outsideEvade, outsideLossRhythm, outsideNipple, preparationLoop, punishmentHit, settings, trainingRhythm, trainingStart]);

  const stopEffect = useCallback((name: EffectName) => {
    if (name === "rhythmBeat" || name === "trainingRhythm") rhythmRequests.current[name] += 1;
    const player = { button, rhythmBeat, dialogue, preparationLoop, defeatLoop, trainingStart, trainingRhythm, outsideEscape, outsideAttack, outsideEvade, outsideEarLick, outsideLossRhythm, outsideNipple, levelUp, punishmentHit, ejaculation, complete }[name];
    player.pause();
    player.seekTo(0).catch(console.error);
  }, [button, rhythmBeat, complete, defeatLoop, dialogue, ejaculation, levelUp, outsideAttack, outsideEarLick, outsideEscape, outsideEvade, outsideLossRhythm, outsideNipple, preparationLoop, punishmentHit, trainingRhythm, trainingStart]);

  useEffect(() => {
    if (!appIsActive || roomAudioPaused || !settings?.soundEnabled || roomAudioScene !== "rhythm" || !voicePreferences.preferences.rooms.rhythm.builtin.includes("rhythmBeat")) stopEffect("rhythmBeat");
    if (!appIsActive || !settings?.soundEnabled || roomAudioScene !== "training" || !voicePreferences.preferences.rooms.training.builtin.includes("trainingRhythm")) stopEffect("trainingRhythm");
  }, [appIsActive, roomAudioScene, roomAudioPaused, settings?.soundEnabled, stopEffect, voicePreferences]);

  const stopLoopAudio = useCallback((name?: LoopAudioName) => {
    // Update intent before pause/seek emits status events. A local single-stop
    // must not be mistaken for an OS request to stop all the loops.
    loopMediaControls.stop(name ? loopPlayers[name] : undefined);
    if (!name) loopSleepTimer.cancel();
    loopPlayback.stop(name ? loopPlayers[name] : undefined);
    setLoopAudioNames((current) => name ? current.filter((item) => item !== name) : []);
    return loopMediaControls.settled();
  }, [loopMediaControls, loopPlayback, loopPlayers, loopSleepTimer]);
  stopLoopAudioRef.current = stopLoopAudio;

  const playLoopAudio = useCallback((name: LoopAudioName) => {
    if (!settings?.soundEnabled) return;
    stopVoiceAudio.current?.();
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
      setRoomAudioPaused,
      shouldMixVideoAudio,
      setVoiceAudioActive,
      registerVoiceAudioStop,
    }),
    [bgmMode, loopAudioNames, loopSleepDeadline, setLoopSleepMinutes, setRoomAudioScene, setRoomAudioPaused, playEffect, playLoopAudio, settings, shouldMixVideoAudio, stopEffect, stopLoopAudio, updateAudioSettings, registerVoiceAudioStop],
  );
  return (
    <AudioContext.Provider value={value}>
      <RoomAudioPlayback tracks={roomAudioTracks}
        paused={roomAudioScene === "rhythm" && roomAudioPaused && !rhythmVoices?.resting} />
      {children}
    </AudioContext.Provider>
  );
}

export function useAppAudio() {
  return useContext(AudioContext);
}
