import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { useAppModal } from "@/components/AppModalProvider";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import {
  enduranceAssets,
  hasCompleteEnduranceAssets,
  type EnduranceMediaItem,
} from "@/features/endurance/assets";
import {
  EnduranceMedia,
  type EnduranceVideoHandle,
} from "@/features/endurance/EnduranceMedia";
import {
  advanceEndurance,
  canAdvanceEndurance,
  createEnduranceGame,
  ENDURANCE_LABELS,
  ENDURANCE_PRESETS,
  failEnduranceSlide,
  finishEndurance,
  RECOVERY_DURATION_MS,
  remainingEnduranceSlides,
  SLIDE_DURATION_MS,
  type EnduranceGame,
  type EndurancePreset,
  type EnduranceResult,
  type EnduranceVideoProgress,
} from "@/features/endurance/game";
import {
  loadEndurance,
  saveEnduranceCurrent,
  saveEnduranceResult,
  unlockEndurance,
} from "@/features/endurance/service";
import { useActiveTimer } from "@/features/endurance/useActiveTimer";
import { createEnduranceSession, type EnduranceSession } from "@/features/endurance/storage";
import { resolveEnduranceMedia } from "@/features/endurance/mediaResolver";
import { attachEnduranceBeforeUnload } from "@/features/endurance/beforeUnload";
import { DailyGameRewardNotice } from "@/components/DailyGameRewardNotice";
import { matchesGameResumeRequest } from "@/features/games/progress";
import { orderEnduranceMedia } from "@/features/endurance/mediaOrder";
import { EnduranceFilePicker } from "@/features/endurance/EnduranceFilePicker";
import {
  reconcileEnduranceFileSelection,
  toggleEnduranceFileSelection,
  type EnduranceFileSelection,
} from "@/features/endurance/fileSelection";
import { displayedFileName, storedFileKey } from "@/features/files/fileList";
import { fileHasPurpose } from "@/features/files/usages";
import { createCountdown, formatCountdown } from "@/features/sugoroku/countdown";
import {
  fileStorageService,
  mimeTypeForName,
  type StoredFile,
} from "@/services/fileStorageService";

export default function EnduranceScreen() {
  const navigation = useNavigation();
  const { resumeId } = useLocalSearchParams<{ resumeId?: string | string[] }>();
  const resumeRequest = useRef(resumeId);
  resumeRequest.current = resumeId;
  const resumeRequestId = typeof resumeId === "string" ? resumeId : null;
  const handledResumeRequest = useRef<string | null>(null);
  const [resumeUnavailable, setResumeUnavailable] = useState(false);
  const { setRoomAudioScene } = useAppAudio();
  const { showError, showNotice } = useAppModal();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState !== "background" &&
      AppState.currentState !== "inactive",
  );
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fileLoadFailed, setFileLoadFailed] = useState(false);
  const [preset, setPreset] = useState<EndurancePreset>("game-1");
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [fileSelection, setFileSelection] = useState<EnduranceFileSelection>({ knownKeys: [], selectedKeys: [] });
  const selectedKeys = fileSelection.selectedKeys;
  const [showFilePicker, setShowFilePicker] = useState(false);
  const fileLoadRequest = useRef(0);
  const [media, setMedia] = useState<EnduranceMediaItem[]>([]);
  const [game, setGame] = useState<EnduranceGame | null>(null);
  const [result, setResult] = useState<EnduranceResult | null>(null);
  const [history, setHistory] = useState<EnduranceResult[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<EndurancePreset | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedCurrent, setSavedCurrent] = useState<EnduranceSession | null>(null);
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [initialVideo, setInitialVideo] = useState<{ progress: EnduranceVideoProgress; complete: boolean } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [videoComplete, setVideoComplete] = useState(false);
  const [videoProgress, setVideoProgress] = useState<EnduranceVideoProgress>({ positionMs: 0, durationMs: null });
  const videoRef = useRef<EnduranceVideoHandle | null>(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const savingRef = useRef(false);
  const actionLock = useRef(false);
  const sessionRef = useRef<EnduranceSession | null>(null);
  const finishedRef = useRef(false);
  const historyFailedRef = useRef(false);
  const autosaveFailedRef = useRef(false);
  const lastCheckpoint = useRef("");
  const pendingTransition = useRef<{ session: EnduranceSession; media: EnduranceMediaItem[] } | null>(null);
  const checkpointRef = useRef<(force?: boolean) => boolean>(() => true);
  const pauseTimersRef = useRef<() => void>(() => {});
  const departRef = useRef<() => boolean>(() => true);
  const activeGame = game !== null && result === null;
  const active =
    focused && foreground && activeGame && !showHistory && !confirmRetire && !autosaveFailed;
  const slideTimer = useActiveTimer(
    SLIDE_DURATION_MS,
    active && game?.preset !== "game-6" && !game?.recovering,
    () => {
      showNotice(
        "時間になりました",
        "1分が経過しました。次のスライドへ進めます。",
      );
    },
  );
  const extraTimer = useActiveTimer(RECOVERY_DURATION_MS, active && game?.preset !== "game-6", () => {
    showNotice("時間になりました", "3分が経過しました。");
  });
  const roomAudioActive = active && game?.preset !== "game-6" && (
    (!game?.recovering && slideTimer.state.status === "running") || extraTimer.state.status === "running"
  );
  const refreshFiles = useCallback(async () => {
    const request = ++fileLoadRequest.current;
    setLoading(true);
    setFileLoadFailed(false);
    try {
      const stored = await fileStorageService.list("endurance");
      if (request !== fileLoadRequest.current) return;
      const next = stored.filter((file) => fileHasPurpose(file, "endurance") && /^(image|video)\//.test(mimeTypeForName(file.name)));
      setFiles(next);
      setFileSelection((previous) => reconcileEnduranceFileSelection(previous, next.map(storedFileKey)));
      return next;
    } catch (error) {
      if (request !== fileLoadRequest.current) return;
      setFileLoadFailed(true);
      showError("ファイルを読み込めませんでした", error);
    } finally {
      if (request === fileLoadRequest.current) setLoading(false);
    }
  }, [showError]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setLoadFailed(false);
      setResumeUnavailable(false);
      handledResumeRequest.current = null;
      try {
        const saved = loadEndurance();
        setHistory(saved.history);
        setUnlocked(saved.unlocked);
        // A failed departure keeps the unsaved in-memory state available for retry.
        if (!autosaveFailedRef.current && !historyFailedRef.current) {
          setSavedCurrent(saved.current);
          setGame(null);
          setMedia([]);
          setResult(null);
          sessionRef.current = null;
          finishedRef.current = false;
          lastCheckpoint.current = "";
        }
        if (!saved.unlocked)
          setPreset((current) =>
            current === "game-5" || current === "game-6" ? "game-1" : current,
          );
      } catch (error) {
        setLoadFailed(true);
        showError("勃起我慢を読み込めませんでした", error);
      }
      void refreshFiles();
      return () => {
        departRef.current();
        fileLoadRequest.current++;
        setFocused(false);
        setShowHistory(false);
        setShowFilePicker(false);
        setUnlockTarget(null);
        setPassword("");
      };
    }, [refreshFiles, showError]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        pauseTimersRef.current();
        checkpointRef.current(true);
      }
      setForeground(state === "active");
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    pauseTimersRef.current();
    if (!checkpointRef.current(true)) event.preventDefault();
  }), [navigation]);
  useEffect(() => attachEnduranceBeforeUnload(Platform.OS, () => {
    pauseTimersRef.current();
    return checkpointRef.current(true);
  }), []);
  useEffect(() => {
    if (!roomAudioActive) return;
    setRoomAudioScene("endurance");
    return () => setRoomAudioScene(null);
  }, [roomAudioActive, setRoomAudioScene]);
  useEffect(() => {
    actionLock.current = false;
  }, [game, result]);
  useEffect(() => { checkpointRef.current(); }, [slideTimer.state.status, extraTimer.state.status]);
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => checkpointRef.current(), 1000);
    return () => clearInterval(interval);
  }, [active]);

  const selectedMedia: EnduranceMediaItem[] =
    preset === "custom"
      ? selectedKeys.flatMap((key) => {
          const file = files.find((item) => storedFileKey(item) === key);
          return file ? [mediaForFile(file)] : [];
        })
      : enduranceAssets[preset];
  const resumeMedia = savedCurrent ? resolveEnduranceMedia(savedCurrent.mediaIds,
    savedCurrent.game.preset === "custom" ? files.map(mediaForFile) : enduranceAssets[savedCurrent.game.preset]) : null;
  const configured = hasCompleteEnduranceAssets(preset, selectedMedia);
  const locked = (preset === "game-5" || preset === "game-6") && !unlocked;
  const currentIndex = result ? galleryIndex : (game?.index ?? 0);
  const currentMedia = media[currentIndex];
  const ready =
    game !== null &&
    !mediaFailed &&
    canAdvanceEndurance(
      game,
      game.preset === "game-6"
        ? videoComplete
        : slideTimer.state.status === "complete",
      extraTimer.state.status === "complete",
    );

  function choosePreset(next: EndurancePreset) {
    if ((next === "game-5" || next === "game-6") && !unlocked) {
      setUnlockTarget(next);
      setPassword("");
      setPasswordError(false);
      return;
    }
    setPreset(next);
  }
  function unlock() {
    try {
      if (!unlockEndurance(password)) {
        setPasswordError(true);
        return;
      }
      setUnlocked(true);
      if (unlockTarget) setPreset(unlockTarget);
      setUnlockTarget(null);
      setPassword("");
    } catch (error) {
      showError("解除を保存できませんでした", error);
    }
  }
  function toggleFile(file: StoredFile) {
    setFileSelection((previous) => toggleEnduranceFileSelection(previous, storedFileKey(file)));
  }
  const restoreSlideTimer = slideTimer.restore;
  const restoreExtraTimer = extraTimer.restore;
  const applySession = useCallback((session: EnduranceSession, ordered: EnduranceMediaItem[]) => {
    sessionRef.current = session;
    pendingTransition.current = null;
    finishedRef.current = false;
    autosaveFailedRef.current = false;
    historyFailedRef.current = false;
    setAutosaveFailed(false);
    setResumeUnavailable(false);
    setSavedCurrent(session);
    setPreset(session.game.preset);
    setMedia(ordered);
    setGame(session.game);
    setResult(null);
    setSaveFailed(false);
    setMediaFailed(false);
    setVideoComplete(session.videoComplete);
    setVideoProgress(session.videoProgress);
    setInitialVideo(session.game.preset === "game-6" ? { progress: session.videoProgress, complete: session.videoComplete } : null);
    setGalleryIndex(0);
    restoreSlideTimer(session.slideTimer);
    restoreExtraTimer(session.extraTimer);
  }, [restoreSlideTimer, restoreExtraTimer]);
  function writeCurrent(session: EnduranceSession) {
    const serialized = JSON.stringify(session);
    if (serialized !== lastCheckpoint.current) {
      if (!saveEnduranceCurrent(session)) throw new Error("This saved game has already finished.");
      lastCheckpoint.current = serialized;
    }
    setSavedCurrent(session);
  }
  function markAutosaveFailed() {
    autosaveFailedRef.current = true;
    setAutosaveFailed(true);
    slideTimer.pause();
    extraTimer.pause();
  }
  function checkpoint(force = false): boolean {
    if (historyFailedRef.current || pendingTransition.current) return false;
    if (finishedRef.current || !sessionRef.current) return true;
    if (autosaveFailedRef.current && !force) return false;
    try {
      const session = createEnduranceSession({
        ...sessionRef.current,
        slideTimer: slideTimer.getSnapshot(),
        extraTimer: extraTimer.getSnapshot(),
        videoProgress: sessionRef.current.game.preset === "game-6"
          ? videoRef.current?.getProgress() ?? sessionRef.current.videoProgress
          : sessionRef.current.videoProgress,
      });
      writeCurrent(session);
      sessionRef.current = session;
      autosaveFailedRef.current = false;
      setAutosaveFailed(false);
      return true;
    } catch {
      markAutosaveFailed();
      return false;
    }
  }
  function saveTransition(session: EnduranceSession, ordered: EnduranceMediaItem[]) {
    try {
      writeCurrent(session);
      applySession(session, ordered);
    } catch {
      pendingTransition.current = { session, media: ordered };
      markAutosaveFailed();
      actionLock.current = false;
    }
  }
  function retryAutosave() {
    const pending = pendingTransition.current;
    if (pending) saveTransition(pending.session, pending.media);
    else checkpoint(true);
  }
  function startNew() {
    if (!configured || locked || loading || loadFailed || (preset === "custom" && fileLoadFailed) || savingRef.current) return;
    const ordered = orderEnduranceMedia(preset, selectedMedia);
    saveTransition(createEnduranceSession({
      game: createEnduranceGame(preset, ordered.length), mediaIds: ordered.map((item) => item.id),
      slideTimer: createCountdown(SLIDE_DURATION_MS), extraTimer: createCountdown(RECOVERY_DURATION_MS),
      videoProgress: { positionMs: 0, durationMs: null }, videoComplete: false,
    }), ordered);
  }
  function start() {
    if (savedCurrent) setConfirmNew(true);
    else startNew();
  }
  const resume = useCallback(async () => {
    const session = savedCurrent;
    if (!session || loading || loadFailed || autosaveFailed ||
      ((session.game.preset === "game-5" || session.game.preset === "game-6") && !unlocked)) return;
    const availableFiles = session.game.preset === "custom" ? await refreshFiles() : files;
    if (!availableFiles) return;
    const ordered = resolveEnduranceMedia(session.mediaIds,
      session.game.preset === "custom" ? availableFiles.map(mediaForFile) : enduranceAssets[session.game.preset]);
    if (!ordered) return;
    lastCheckpoint.current = JSON.stringify(session);
    applySession(session, ordered);
    if (matchesGameResumeRequest(resumeRequest.current, session.game.id)) {
      // Only a completed resume consumes the link; missing media keeps it retryable.
      router.setParams({ resumeId: undefined });
    }
  }, [savedCurrent, loading, loadFailed, autosaveFailed, unlocked, refreshFiles, files, applySession]);
  useEffect(() => {
    if (!focused || loading || loadFailed || autosaveFailed || activeGame || result
      || !resumeRequestId || handledResumeRequest.current === resumeRequestId) return;
    if (!savedCurrent || savedCurrent.game.id !== resumeRequestId) {
      handledResumeRequest.current = resumeRequestId;
      setResumeUnavailable(true);
      return;
    }
    if (!resumeMedia || (savedCurrent.game.preset === "custom" && fileLoadFailed)
      || ((savedCurrent.game.preset === "game-5" || savedCurrent.game.preset === "game-6") && !unlocked)) return;
    handledResumeRequest.current = resumeRequestId;
    setResumeUnavailable(false);
    void resume();
  }, [focused, loading, loadFailed, autosaveFailed, activeGame, result, resumeRequestId, savedCurrent,
    resumeMedia, fileLoadFailed, unlocked, resume]);
  function persist(finished: EnduranceResult) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    historyFailedRef.current = false;
    try {
      const saved = saveEnduranceResult(finished);
      setHistory(saved.history);
      sessionRef.current = null;
      pendingTransition.current = null;
      setSavedCurrent(null);
      autosaveFailedRef.current = false;
      setAutosaveFailed(false);
    } catch (error) {
      historyFailedRef.current = true;
      setSaveFailed(true);
      showError("プレイ履歴を保存できませんでした", error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  function finish(retired: boolean, currentGame = game) {
    if (!currentGame || result) return;
    const progress = currentGame.preset === "game-6"
      ? videoRef.current?.getProgress() ?? videoProgress
      : undefined;
    const finished = finishEndurance(currentGame, retired, new Date().toISOString(), progress);
    finishedRef.current = true;
    slideTimer.pause();
    extraTimer.pause();
    setResult(finished);
    setGalleryIndex(currentGame.index);
    persist(finished);
  }
  function next() {
    if (!game || !ready || !active || result || actionLock.current) return;
    actionLock.current = true;
    if (game.index === game.total - 1) {
      finish(false);
      return;
    }
    const nextGame = advanceEndurance(
        game,
        game.preset === "game-6"
          ? videoComplete
          : slideTimer.state.status === "complete",
        extraTimer.state.status === "complete",
      );
    saveTransition(createEnduranceSession({
      game: nextGame, mediaIds: media.map((item) => item.id),
      slideTimer: createCountdown(SLIDE_DURATION_MS), extraTimer: createCountdown(RECOVERY_DURATION_MS),
      videoProgress: { positionMs: 0, durationMs: null }, videoComplete: false,
    }), media);
  }
  function fail() {
    if (!game || game.recovering || result || !active || actionLock.current) return;
    actionLock.current = true;
    if (game.preset === "game-6") {
      finish(false, failEnduranceSlide(game));
      return;
    }
    saveTransition(createEnduranceSession({
      game: failEnduranceSlide(game), mediaIds: media.map((item) => item.id),
      slideTimer: slideTimer.getSnapshot(), extraTimer: createCountdown(RECOVERY_DURATION_MS),
      videoProgress: { positionMs: 0, durationMs: null }, videoComplete: false,
    }), media);
  }
  function leave() {
    if (checkpoint(true)) router.replace("/(tabs)/games");
  }
  const onMediaError = useCallback(() => setMediaFailed(true), []);
  const onVideoEnd = useCallback(() => {
    if (sessionRef.current?.game.preset !== "game-6" || finishedRef.current) return;
    sessionRef.current = { ...sessionRef.current, videoComplete: true };
    setVideoComplete(true);
    checkpointRef.current();
  }, []);
  const onVideoProgress = useCallback((progress: EnduranceVideoProgress) => {
    if (sessionRef.current?.game.preset !== "game-6" || finishedRef.current) return;
    sessionRef.current = { ...sessionRef.current, videoProgress: progress };
    setVideoProgress(progress);
  }, []);
  useLayoutEffect(() => {
    checkpointRef.current = checkpoint;
    pauseTimersRef.current = () => { slideTimer.pause(); extraTimer.pause(); };
    departRef.current = () => {
      slideTimer.pause();
      extraTimer.pause();
      const saved = checkpoint(true);
      if (!saved) {
        showError("進行状況を保存できませんでした", new Error("進行状況を保存できませんでした。保存を再試行してから続けてください。"));
        return false;
      }
      sessionRef.current = null;
      setGame(null);
      setMedia([]);
      return true;
    };
  });

  return (
    <Screen desktopLayout="single">
      <AppText variant="title">勃起我慢</AppText>
      {loading ? <ActivityIndicator color="#fff" /> : null}
      {loadFailed ? (
        <AppText style={styles.failed}>勃起我慢を読み込めませんでした</AppText>
      ) : null}
      {resumeUnavailable ? (
        <AppText style={styles.failed}>保存中のゲームが見つかりません。ゲーム部屋で進行状況を確認してください。</AppText>
      ) : null}
      {autosaveFailed ? (
        <Card>
          <AppText style={styles.failed}>進行状況を保存できませんでした。保存を再試行してから続けてください。</AppText>
          <PrimaryButton title="進行状況の保存を再試行" onPress={retryAutosave} />
        </Card>
      ) : null}
      {!activeGame && !result ? (
        <>
          {savedCurrent ? (
            <Card>
              <AppText variant="subtitle">保存中のゲーム</AppText>
              <AppText>{ENDURANCE_LABELS[savedCurrent.game.preset]}</AppText>
              <AppText localize={false}>{`${savedCurrent.game.index + 1} / ${savedCurrent.game.total}`}</AppText>
              <AppText variant="muted">進行状況は自動保存されます。タイマーは再開時に一時停止しています。</AppText>
              {!loading && !resumeMedia ? (
                <AppText style={styles.failed}>続きの素材を読み込めませんでした。ファイル格納で元のファイルを確認してください。保存した進行状況は残っています。</AppText>
              ) : null}
              {savedCurrent.game.preset === "custom" && (!resumeMedia || fileLoadFailed) ? (
                <PrimaryButton title="ファイルを再読み込み" tone="secondary" disabled={loading} onPress={() => void refreshFiles()} />
              ) : null}
              <PrimaryButton title="続きから" tone="defeat"
                disabled={loading || loadFailed || autosaveFailed || !resumeMedia || (savedCurrent.game.preset === "custom" && fileLoadFailed)}
                onPress={() => {
                  if ((savedCurrent.game.preset === "game-5" || savedCurrent.game.preset === "game-6") && !unlocked) {
                    choosePreset(savedCurrent.game.preset);
                  } else void resume();
                }} />
            </Card>
          ) : null}
          <View style={styles.presets}>
            {ENDURANCE_PRESETS.map((value) => (
              <View key={value} style={styles.preset}>
                <PrimaryButton
                  title={
                    !unlocked && value === "game-5"
                      ? "勃起我慢⑤（未公開）"
                      : !unlocked && value === "game-6"
                        ? "勃起我慢⑥（未公開）"
                        : ENDURANCE_LABELS[value]
                  }
                  tone={preset === value ? "defeat" : "secondary"}
                  onPress={() => choosePreset(value)}
                />
              </View>
            ))}
          </View>
          <Card>
            <AppText variant="subtitle">{ENDURANCE_LABELS[preset]}</AppText>
            {preset === "custom" ? (
              <>
                <AppText>
                  使う画像・動画を選んでください。開始時にランダムな順番で表示します。
                </AppText>
                <AppText variant="muted">最大100件まで選択できます。</AppText>
                {!loading && !fileLoadFailed && files.length === 0 ? (
                  <AppText variant="muted">
                    勃起我慢ゲーム用の画像・動画がありません。ファイル格納で用途を追加してください。
                  </AppText>
                ) : null}
                {fileLoadFailed ? <AppText style={styles.failed}>ファイルを読み込めませんでした</AppText> : null}
                <PrimaryButton
                  title="ファイル選択"
                  tone="preparation"
                  onPress={() => {
                    setShowFilePicker(true);
                    if (!loading) void refreshFiles();
                  }}
                />
              </>
            ) : (
              <AppText variant="muted">
                {preset === "game-6" ? "動画1本" : "画像4枚・各1分"}
              </AppText>
            )}
            {!configured ? <AppText variant="muted">素材未設定</AppText> : null}
            <PrimaryButton
              title={savedCurrent ? "新しいゲームを開始" : "ゲーム開始"}
              tone="defeat"
              disabled={!configured || locked || loading || loadFailed || autosaveFailed || (preset === "custom" && fileLoadFailed)}
              onPress={start}
            />
          </Card>
        </>
      ) : null}
      {game && currentMedia ? (
        <Card>
          <AppText variant="subtitle">{ENDURANCE_LABELS[game.preset]}</AppText>
          <AppText
            localize={false}
            style={styles.center}
          >{`${currentIndex + 1} / ${game.total}`}</AppText>
          <AppText localize={false} numberOfLines={2}>
            {currentMedia.label}
          </AppText>
          <EnduranceMedia
            key={`${game.id}:${currentMedia.id}`}
            item={currentMedia}
            active={active}
            loopVideo={game.preset === "custom"}
            audioActive={game.preset === "game-6" ? active : roomAudioActive}
            onNext={
              result
                ? galleryIndex < media.length - 1
                  ? () => setGalleryIndex(galleryIndex + 1)
                  : undefined
                : ready
                  ? next
                  : undefined
            }
            onPrevious={
              result && galleryIndex > 0
                ? () => setGalleryIndex(galleryIndex - 1)
                : undefined
            }
            onVideoEnd={onVideoEnd}
            onVideoProgress={game.preset === "game-6" ? onVideoProgress : undefined}
            videoRef={game.preset === "game-6" ? videoRef : undefined}
            initialVideoProgress={initialVideo?.progress}
            initialVideoComplete={initialVideo?.complete}
            onError={onMediaError}
          />
          {mediaFailed ? (
            <AppText style={styles.failed}>
              素材を表示できませんでした。ファイルを確認してください。
            </AppText>
          ) : null}
          {activeGame ? (
            <>
              <AppText variant="muted">進行状況は自動保存されます。タイマーは再開時に一時停止しています。</AppText>
              {game.preset === "game-6" ? (
                <View>
                  <AppText variant="subtitle">動画の再生時間</AppText>
                  <AppText localize={false} style={styles.clock}>
                    {`${formatPlaybackTime(videoProgress.positionMs)} / ${videoProgress.durationMs === null ? "--:--" : formatPlaybackTime(videoProgress.durationMs)}`}
                  </AppText>
                </View>
              ) : null}
              {game.preset !== "game-6" && !game.recovering ? (
                <Card>
                  <AppText variant="subtitle">1分タイマー</AppText>
                  <AppText localize={false} style={styles.clock}>
                    {formatCountdown(slideTimer.state.remainingMs)}
                  </AppText>
                  <PrimaryButton
                    title={
                      slideTimer.state.status === "running"
                        ? "一時停止"
                        : slideTimer.state.status === "paused"
                          ? "再開"
                          : "1分タイマー開始"
                    }
                    tone="secondary"
                    disabled={
                      !active ||
                      mediaFailed ||
                      slideTimer.state.status === "complete"
                    }
                    onPress={
                      slideTimer.state.status === "running"
                        ? () => { slideTimer.pause(); checkpoint(true); }
                        : () => { slideTimer.start(); checkpoint(true); }
                    }
                  />
                </Card>
              ) : null}
              {game.preset !== "game-6" && game.recovering ? (
                <AppText style={styles.failed}>
                  我慢失敗。【チンピク】50回できたら、「3分タイマー開始」を押して、【ノンストップオナニー】を始めてください。終了後に次へ進めます。
                </AppText>
              ) : null}
              {game.preset !== "game-6" ? (
              <Card>
                <AppText variant="subtitle">3分タイマー</AppText>
                <AppText localize={false} style={styles.clock}>
                  {formatCountdown(extraTimer.state.remainingMs)}
                </AppText>
                <View style={styles.row}>
                  <View style={styles.button}>
                    <PrimaryButton
                      title={
                        extraTimer.state.status === "running"
                          ? "一時停止"
                          : extraTimer.state.status === "paused"
                            ? "再開"
                            : "3分タイマー開始"
                      }
                      tone="secondary"
                      disabled={!active}
                      onPress={
                        extraTimer.state.status === "running"
                          ? () => { extraTimer.pause(); checkpoint(true); }
                          : () => { extraTimer.start(); checkpoint(true); }
                      }
                    />
                  </View>
                  <View style={styles.button}>
                    <PrimaryButton
                      title="リセット"
                      tone="secondary"
                      disabled={!active}
                      onPress={() => { extraTimer.reset(); checkpoint(true); }}
                    />
                  </View>
                </View>
              </Card>
              ) : null}
              {ready ? (
                <AppText style={styles.cleared}>
                  {game.preset === "game-6" ? "動画を最後まで再生できました。" : "時間になりました。次へ進めます。"}
                </AppText>
              ) : game.preset === "game-6" && !game.recovering ? (
                <AppText variant="muted">
                  動画を最後まで再生すると終了できます。
                </AppText>
              ) : (
                <AppText variant="muted">
                  タイマーが終わると次のスライドへ進めます。
                </AppText>
              )}
              <PrimaryButton
                title={
                  game.index === game.total - 1
                    ? game.failures > 0
                      ? "ゲーム終了"
                      : "最後まで我慢できた"
                    : "次へ"
                }
                tone="defeat"
                disabled={!ready || !active}
                onPress={next}
              />
              <View style={styles.row}>
                <View style={styles.button} testID="endurance-fail-button">
                  <PrimaryButton
                    title="我慢失敗"
                    tone="punishment"
                    disabled={game.recovering || !active}
                    onPress={fail}
                  />
                </View>
                <View style={styles.button} testID="endurance-retire-button">
                  <PrimaryButton
                    title="リタイア"
                    tone="primary"
                    disabled={autosaveFailed}
                    onPress={() => {
                      setConfirmRetire(true);
                    }}
                  />
                </View>
              </View>
            </>
          ) : null}
        </Card>
      ) : null}
      {result ? (
        <Card>
          <ResultDetails result={result} />
          {saving ? <ActivityIndicator color="#fff" /> : null}
          {saveFailed ? (
            <>
              <AppText style={styles.failed}>
                履歴がまだ保存されていません。
              </AppText>
              <PrimaryButton
                title="保存を再試行"
                onPress={() => persist(result)}
              />
            </>
          ) : null}
          <PrimaryButton
            title="もう一度"
            tone="defeat"
            disabled={saving || saveFailed}
            onPress={() => {
              setResult(null);
              setGame(null);
              setMedia([]);
              finishedRef.current = false;
            }}
          />
        </Card>
      ) : null}
      <PrimaryButton
        title="遊び方を見る"
        tone="secondary"
        onPress={() => setShowRules(!showRules)}
      />
      {showRules ? (
        <Card>
          <AppText variant="subtitle">ルール</AppText>
          {(game?.preset ?? preset) === "game-6" ? (
            <AppText>
              ⑥は動画を最後まで再生して完了します。我慢失敗・リタイアではその時点で終了し、動画の再生位置を履歴に記録します。3分タイマーはありません。
            </AppText>
          ) : (
          <>
          <AppText>
            {
              "①1分間ずつタイマーをセットして\nスライドして【勃起】したら負け♡\n②負けた場合、その画像で【チンピク】を50回してノンストップオナニーをやりなさい。\nノンストップオナニーを3分間我慢できたら次へ進めることができます。\n③最後まで我慢できたら好きな画像に画面越しに【射精】"
            }
          </AppText>
          <AppText variant="muted">
            画面を離れたときやバックグラウンドでは、タイマーを一時停止します。戻ったら「再開」を押してください。
          </AppText>
          </>
          )}
        </Card>
      ) : null}
      <PrimaryButton
        title="プレイ履歴を表示する"
        tone="secondary"
        onPress={() => setShowHistory(true)}
      />
      <PrimaryButton
        title="ファイル格納"
        tone="preparation"
        onPress={() => { if (checkpoint(true)) router.push("/(tabs)/files"); }}
      />
      <PrimaryButton
        title="ゲーム部屋へ戻る"
        tone="secondary"
        disabled={saving || saveFailed}
        onPress={leave}
      />
      <HistoryModal
        visible={showHistory}
        history={history}
        onClose={() => setShowHistory(false)}
      />
      <EnduranceFilePicker
        visible={showFilePicker}
        files={files}
        selectedKeys={selectedKeys}
        loading={loading}
        loadFailed={fileLoadFailed}
        onToggle={toggleFile}
        onRetry={() => void refreshFiles()}
        onClose={() => setShowFilePicker(false)}
      />
      <ConfirmModal
        visible={confirmNew}
        title="新しいゲームを始めますか？"
        message="保存中のゲームを上書きして、新しいゲームを始めます。"
        confirmLabel="新しいゲームを開始"
        confirmTone="defeat"
        onCancel={() => setConfirmNew(false)}
        onConfirm={() => { setConfirmNew(false); startNew(); }}
      />
      <ConfirmModal
        visible={confirmRetire}
        title="リタイア"
        message="このゲームを終了して、プレイ履歴に記録しますか？"
        confirmLabel="リタイア"
        confirmTone="primary"
        onCancel={() => {
          setConfirmRetire(false);
        }}
        onConfirm={() => {
          setConfirmRetire(false);
          finish(true);
        }}
      />
      <Modal
        visible={unlockTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setUnlockTarget(null);
          setPassword("");
        }}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <AppText variant="subtitle">未公開ゲームを解除</AppText>
            <AppText>
              パスワードが知りたい場合は、【特別会員室】に入ってください♡
            </AppText>
            <TextField
              label="パスワード"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError(false);
              }}
            />
            {passwordError ? (
              <AppText style={styles.failed}>パスワードが違います。</AppText>
            ) : null}
            <PrimaryButton title="解除" tone="defeat" onPress={unlock} />
            <PrimaryButton
              title="閉じる"
              tone="secondary"
              onPress={() => {
                setUnlockTarget(null);
                setPassword("");
              }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function mediaForFile(file: StoredFile): EnduranceMediaItem {
  return {
    id: storedFileKey(file), label: displayedFileName(file),
    kind: mimeTypeForName(file.name).startsWith("video/") ? "video" : "image",
    source: { uri: file.uri },
  };
}

function formatPlaybackTime(milliseconds: number) {
  return formatCountdown(Math.floor(milliseconds / 1000) * 1000);
}

function ResultDetails({ result }: { result: EnduranceResult }) {
  const time = new Date(result.finishedAt);
  const date = `${time.getFullYear()}/${String(time.getMonth() + 1).padStart(2, "0")}/${String(time.getDate()).padStart(2, "0")}`;
  return (
    <>
      <AppText localize={false}>{date}</AppText>
      <AppText>{ENDURANCE_LABELS[result.preset]}</AppText>
      <AppText
        style={result.outcome === "cleared" ? styles.cleared : styles.failed}
      >
        {result.outcome === "cleared" ? "クリア" : "未達成"}
      </AppText>
      <DailyGameRewardNotice game="endurance" resultId={result.id} />
      {result.preset === "game-6" ? (
        <View style={styles.resultRows}>
          {result.outcome !== "cleared" ? (
            <AppText style={styles.failed}>{result.outcome === "retired" ? "リタイア" : "我慢失敗"}</AppText>
          ) : null}
          <View style={styles.row}>
            <AppText>{result.outcome === "failed" ? "失敗時の再生位置：" : result.outcome === "retired" ? "リタイア時の再生位置：" : "終了時の再生位置："}</AppText>
            {result.videoProgress ? (
              <AppText localize={false}>{formatPlaybackTime(result.videoProgress.positionMs)}</AppText>
            ) : <AppText>記録なし</AppText>}
          </View>
          {result.videoProgress?.durationMs != null ? (
            <View style={styles.row}>
              <AppText>動画の長さ：</AppText>
              <AppText localize={false}>{formatPlaybackTime(result.videoProgress.durationMs)}</AppText>
            </View>
          ) : null}
        </View>
      ) : result.outcome !== "cleared" ? (
        <View style={styles.resultRows}>
          <AppText style={styles.failed}>
            {result.outcome === "retired" ? "リタイア" : "失敗"}
          </AppText>
          <View style={styles.row}>
            <AppText style={styles.failed}>終了したスライド：</AppText>
            <AppText
              localize={false}
              style={styles.failed}
            >{`${result.index + 1} / ${result.total}`}</AppText>
          </View>
          {result.failedIndex !== null ? (
            <View style={styles.row}>
              <AppText style={styles.failed}>最初に失敗したスライド：</AppText>
              <AppText localize={false} style={styles.failed}>
                {String(result.failedIndex + 1)}
              </AppText>
            </View>
          ) : null}
          <View style={styles.row}>
            <AppText style={styles.failed}>残りスライド：</AppText>
            <AppText localize={false} style={styles.failed}>
              {String(remainingEnduranceSlides(result))}
            </AppText>
          </View>
        </View>
      ) : null}
    </>
  );
}

function HistoryModal({
  visible,
  history,
  onClose,
}: {
  visible: boolean;
  history: EnduranceResult[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.history,
          {
            paddingTop: Math.max(16, insets.top),
            paddingBottom: Math.max(16, insets.bottom),
          },
        ]}
      >
        <AppText variant="title">我慢 プレイ履歴</AppText>
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.historyList}
          renderItem={({ item }) => (
            <Card>
              <ResultDetails result={item} />
            </Card>
          )}
          ListEmptyComponent={
            <AppText variant="muted">プレイ履歴はまだありません。</AppText>
          }
        />
        <PrimaryButton title="閉じる" tone="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  preset: { minWidth: 140, flexGrow: 1, flexBasis: "45%", gap: 4 },
  center: { textAlign: "center" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { flex: 1, minWidth: 110 },
  clock: {
    textAlign: "center",
    fontSize: 28,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  failed: { color: "#ff3b45", fontWeight: "700" },
  cleared: { color: "#7cb342", fontWeight: "700" },
  resultRows: { gap: 8 },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.88)",
  },
  dialog: {
    width: "100%",
    maxWidth: 400,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#080808",
  },
  history: { flex: 1, paddingHorizontal: 16, gap: 16, backgroundColor: "#000" },
  historyList: { gap: 12, paddingBottom: 16 },
});
