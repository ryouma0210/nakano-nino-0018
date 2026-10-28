import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { voiceStorageService, type StoredVoice, type VoicePlaybackMode, type VoiceFolder, type VoiceScope } from "@/services/voiceStorageService";
import { voicesInScope } from "@/features/voices/library";
import { useAppAudio } from "./AudioProvider";
import { setBackgroundAudioMode } from "./backgroundAudioMode";
import { createVoicePlayback, type VoicePlaybackState } from "./voicePlayback";
import { createVoiceMediaSession } from "./voiceMediaSession";
import { useVoicePlaylist } from "./useVoicePlaylist";

type ImportResult = { added: number; failed: number; canceled: boolean };
type VoiceLibrary = {
  voices: StoredVoice[];
  visibleVoices: StoredVoice[];
  folders: VoiceFolder[];
  scope: VoiceScope;
  mode: VoicePlaybackMode;
  loading: boolean;
  busy: boolean;
  error: string | null;
  currentId: string | null;
  playing: boolean;
  importVoices(): Promise<ImportResult | null>;
  renameVoice(id: string, name: string): Promise<void>;
  reorderVoices(orderedIds: string[], scope: VoiceScope): Promise<void>;
  removeVoice(id: string): Promise<void>;
  clearVoices(): Promise<void>;
  selectScope(scope: VoiceScope): Promise<void>;
  createFolder(name: string): Promise<void>;
  renameFolder(id: string, name: string): Promise<void>;
  removeFolder(id: string): Promise<void>;
  setVoiceFolders(id: string, folderIds: string[]): Promise<void>;
  setMode(mode: VoicePlaybackMode): Promise<void>;
  play(id: string): void;
  pause(): void;
  stop(): void;
  next(): void;
  previous(): void;
};

const VoiceContext = createContext<VoiceLibrary | null>(null);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "ボイスを再生できませんでした。音声ファイルを確認してください。";
}

export function VoiceLibraryProvider({ children }: PropsWithChildren) {
  const audio = useAppAudio();
  const { registerVoiceAudioStop } = audio;
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const playlist = useVoicePlaylist();
  const [voices, setVoices] = useState<StoredVoice[]>([]);
  const [folders, setFolders] = useState<VoiceFolder[]>([]);
  const [scope, setScope] = useState<VoiceScope>("all");
  const scopeRef = useRef<VoiceScope>("all");
  const [mode, setModeState] = useState<VoicePlaybackMode>("one");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<VoicePlaybackState>({ currentId: null, playing: false });
  const operationActive = useRef(false);
  const mounted = useRef(true);

  const playback = useMemo(() => {
    const browser = createVoiceMediaSession({
      play: () => {
        const currentId = controller.getState().currentId;
        if (audioRef.current.settings?.soundEnabled !== false && !operationActive.current && currentId) void controller.play(currentId);
      },
      pause: () => controller.pause(),
      stop: () => controller.stop(),
      next: () => { if (audioRef.current.settings?.soundEnabled !== false && !operationActive.current) controller.step(1); },
      previous: () => { if (audioRef.current.settings?.soundEnabled !== false && !operationActive.current) controller.step(-1); },
    });
    const controller = createVoicePlayback(playlist, {
      prepare: async (isCurrent) => {
        if (audioRef.current.settings?.soundEnabled === false) throw new Error("音声を再生するには、設定で効果音を有効にしてください。");
        await audioRef.current.stopLoopAudio();
        if (isCurrent()) await setBackgroundAudioMode("doNotMix");
      },
      activate: (title) => {
        if (Platform.OS === "web") browser.activate(title);
        else {
          if (!playlist.setActiveForLockScreen) {
            throw new Error("ボイスのバックグラウンド再生には、最新版のアプリをインストールしてください。");
          }
          playlist.setActiveForLockScreen(true, { title, artist: "ボイス格納" }, {
            showSeekForward: false, showSeekBackward: false, isLiveStream: false,
          });
        }
      },
      updateTitle: (title) => {
        if (Platform.OS === "web") browser.updateTitle(title);
        else playlist.updateLockScreenMetadata?.({ title, artist: "ボイス格納" });
      },
      deactivate: () => {
        if (Platform.OS === "web") browser.deactivate();
        else playlist.setActiveForLockScreen?.(false);
      },
      release: () => { void setBackgroundAudioMode("mixWithOthers").catch(console.error); },
      onChange: (state) => {
        if (mounted.current) setPlaybackState(state);
        audioRef.current.setVoiceAudioActive(state.currentId !== null);
        if (Platform.OS === "web") browser.updatePlaying(state.playing);
      },
      onError: (cause) => { if (mounted.current) setError(errorMessage(cause)); },
    });
    return controller;
  }, [playlist]);

  const refresh = useCallback(async () => {
    const stored = await voiceStorageService.load();
    if (!mounted.current) return;
    if (scopeRef.current !== stored.scope) playback.stop();
    scopeRef.current = stored.scope;
    setVoices(stored.voices);
    setFolders(stored.folders);
    setScope(stored.scope);
    setModeState(stored.mode);
    await playback.sync(voicesInScope(stored.voices, stored.scope), stored.mode);
  }, [playback, setVoices, setModeState, setFolders, setScope]);

  useEffect(() => {
    mounted.current = true;
    playback.initialize();
    void refresh().catch((cause) => { if (mounted.current) setError(errorMessage(cause)); })
      .finally(() => { if (mounted.current) setLoading(false); });
    const subscription = playlist.addListener("playlistStatusUpdate", (status) => playback.check(status));
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") playback.check(playlist.currentStatus);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      appState.remove();
      try { playback.dispose(); } catch (cause) { console.warn("Could not release voice playback", cause); }
    };
  }, [playback, playlist, refresh]);

  useEffect(() => registerVoiceAudioStop(() => playback.stop()), [registerVoiceAudioStop, playback]);
  useEffect(() => {
    playback.setVolume(audio.settings?.soundVolume ?? 0.7);
    if (audio.settings?.soundEnabled === false) playback.stop();
  }, [audio.settings?.soundEnabled, audio.settings?.soundVolume, playback, playlist]);

  const operate = async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (operationActive.current || loading) throw new Error("ボイスの処理が完了するまでお待ちください。");
    operationActive.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      await refresh();
      return result;
    } catch (cause) {
      // Multi-step operations can commit a folder before selecting it fails.
      // Show the actual saved library so retrying never creates a hidden copy.
      await refresh().catch(() => {});
      if (mounted.current) setError(errorMessage(cause));
      throw cause;
    } finally {
      operationActive.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const value: VoiceLibrary = {
    voices, visibleVoices: voicesInScope(voices, scope), folders, scope, mode, loading, busy, error, ...playbackState,
    importVoices: () => operate(() => voiceStorageService.importVoices(scopeRef.current === "all" || scopeRef.current === "unfiled" ? null : scopeRef.current)),
    renameVoice: (id, name) => operate(() => voiceStorageService.rename(id, name)),
    reorderVoices: (orderedIds, scope) => operate(() => voiceStorageService.reorder(orderedIds, scope)),
    removeVoice: (id) => operate(async () => {
      // Release the audio source before storage revokes its URL or deletes it.
      if (playback.getState().currentId === id) playback.stop();
      await voiceStorageService.remove(id);
    }),
    clearVoices: () => operate(async () => {
      playback.stop();
      await voiceStorageService.clear();
    }),
    selectScope: (next) => next === scopeRef.current ? Promise.resolve() : operate(() => voiceStorageService.setScope(next)),
    createFolder: (name) => operate(async () => {
      const folder = await voiceStorageService.createFolder(name);
      await voiceStorageService.setScope(folder.id);
    }),
    renameFolder: (id, name) => operate(() => voiceStorageService.renameFolder(id, name)),
    removeFolder: (id) => operate(() => voiceStorageService.removeFolder(id)),
    setVoiceFolders: (id, folderIds) => operate(() => voiceStorageService.setVoiceFolders(id, folderIds)),
    setMode: (next) => operate(() => voiceStorageService.setMode(next)),
    play: (id) => {
      if (loading || operationActive.current) return;
      if (audio.settings?.soundEnabled === false) {
        setError("音声を再生するには、設定で効果音を有効にしてください。");
        return;
      }
      setError(null);
      void playback.play(id);
    },
    pause: () => playback.pause(),
    stop: () => playback.stop(),
    next: () => { if (!loading && !operationActive.current && audio.settings?.soundEnabled !== false) playback.step(1); },
    previous: () => { if (!loading && !operationActive.current && audio.settings?.soundEnabled !== false) playback.step(-1); },
  };
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoiceLibrary() {
  const value = useContext(VoiceContext);
  if (!value) throw new Error("VoiceLibraryProvider is missing");
  return value;
}
