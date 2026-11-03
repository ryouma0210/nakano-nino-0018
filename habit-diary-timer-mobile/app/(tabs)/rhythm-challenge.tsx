import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { useRoomVoicePlayback } from "@/audio/useRoomVoicePlayback";
import { automaticRhythmVoices } from "@/audio/rhythmVoicePlayback";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DailyGameRewardNotice } from "@/components/DailyGameRewardNotice";
import { PageTitle } from "@/components/PageTitle";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomVoiceButton } from "@/components/RoomVoiceButton";
import { RoomRhythmGauge } from "@/components/RoomRhythmGauge";
import { Screen } from "@/components/Screen";
import { getFileUsages } from "@/features/files/usages";
import {
  autoResumeRhythmSession, createRhythmSession, finishRhythmSession, pauseRhythmSession, randomRhythm,
  resumeRhythmSession, rhythmElapsedMs, rhythmPauseSecondsRemaining, suspendRhythmSession, type RhythmSession,
} from "@/features/rhythm/model";
import { RhythmImage, RhythmImageSettings } from "@/features/rhythm/RhythmImages";
import { RhythmFeedback } from "@/features/rhythm/RhythmFeedback";
import { PendingResultConfirmation, SessionSaveNotice } from "@/features/sessions/SessionSaveFeedback";
import { usePendingResultGuard } from "@/features/sessions/usePendingResultGuard";
import { fileStorageService, type StoredFile } from "@/services/fileStorageService";
import {
  rhythmChallengeService, rhythmResult, type RhythmHistoryEntry, type RhythmImages,
} from "@/services/rhythmChallengeService";
import { secondsToClock, toDateTimeKey } from "@/utils/date";
import { loadRewardedRhythm, saveRewardedRhythmResult } from "@/services/gameCompletionService";

const emptyImages: RhythmImages = { normal: null, paused: null, finished: null };

export default function RhythmChallengeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const { playEffect } = useAppAudio();
  const [session, setSessionState] = useState<RhythmSession | null>(null);
  const sessionRef = useRef<RhythmSession | null>(null);
  const [images, setImages] = useState<RhythmImages>(emptyImages);
  const [history, setHistory] = useState<RhythmHistoryEntry[]>([]);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [fileError, setFileError] = useState(false);
  const [imageSettingsOpen, setImageSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [bpm, setBpm] = useState(72);
  const [phase, setPhase] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const loadRequest = useRef(0);
  const fileRequest = useRef(0);
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const running = session?.status === "running" && focused && appActive;
  const rhythmVoices = { resting: session?.status === "paused" && session.autoResumeAt !== null, interruptions: session?.interruptions ?? 0 };
  const automaticVoices = session && session.status !== "finished" ? automaticRhythmVoices(rhythmVoices) : [];

  const setSession = useCallback((value: RhythmSession | null) => {
    sessionRef.current = value;
    setSessionState(value);
  }, []);
  const suspend = useCallback(() => {
    const current = sessionRef.current;
    if (!current || current.status === "finished") return;
    const time = Date.now();
    setSession(suspendRhythmSession(current, time));
    setNow(time);
  }, [setSession]);
  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true); setLoadError(false);
    try {
      const state = await loadRewardedRhythm();
      if (mounted.current && request === loadRequest.current) { setImages(state.images); setHistory(state.history); }
    } catch { if (mounted.current && request === loadRequest.current) setLoadError(true); }
    finally { if (mounted.current && request === loadRequest.current) setLoading(false); }
  }, []);
  const loadFiles = useCallback(async () => {
    const request = ++fileRequest.current;
    setLoadingFiles(true); setFileError(false);
    try {
      const stored = await fileStorageService.list();
      if (mounted.current && request === fileRequest.current) {
        setFiles(stored.filter((file) => getFileUsages(file).length > 0 && /\.(png|jpe?g|webp|gif)$/i.test(file.name)));
      }
    } catch { if (mounted.current && request === fileRequest.current) setFileError(true); }
    finally { if (mounted.current && request === fileRequest.current) setLoadingFiles(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadRequest.current += 1; fileRequest.current += 1; };
  }, []);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    void load();
    void loadFiles();
    return () => { setFocused(false); setHelpOpen(false); suspend(); };
  }, [load, loadFiles, suspend]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
      if (state !== "active") suspend();
    });
    return () => subscription.remove();
  }, [suspend]);

  useEffect(() => {
    if (!running) return;
    let rhythm = randomRhythm();
    let previousTick = Date.now();
    let changeAt = previousTick + rhythm.durationMs;
    let beatPhase = 0;
    let gaugePhase = 0;
    setBpm(rhythm.bpm);
    setPhase(0);
    const timer = setInterval(() => {
      if (sessionRef.current?.status !== "running") return;
      const time = Date.now();
      // If JS stalls, do not replay a backlog of missed beats.
      const delta = Math.max(0, Math.min(time - previousTick, 250));
      previousTick = time;
      beatPhase += delta * rhythm.bpm / 60_000;
      // Three hearts share one trip across the track, one arrival per beat.
      gaugePhase = (gaugePhase + delta * rhythm.bpm / 180_000) % 1;
      if (beatPhase >= 1) { beatPhase %= 1; playEffect("rhythmBeat"); }
      if (time >= changeAt) {
        rhythm = randomRhythm(rhythm.bpm);
        changeAt = time + rhythm.durationMs;
        setBpm(rhythm.bpm);
      }
      setNow(time);
      setPhase(gaugePhase);
    }, 40);
    return () => clearInterval(timer);
  }, [playEffect, running]);

  const hasPending = useCallback(() => {
    const current = sessionRef.current;
    return current !== null && (current.status !== "finished" || !savedRef.current);
  }, []);
  const discard = useCallback(() => { setSession(null); savedRef.current = false; setSaved(false); }, [setSession]);
  const exitGuard = usePendingResultGuard(session !== null && (session.status !== "finished" || !saved), hasPending, discard);
  useEffect(() => { if (exitGuard.requested) suspend(); }, [exitGuard.requested, suspend]);
  useRoomVoicePlayback("rhythm", running, {
    paused: session?.status === "paused", rhythmVoices,
    finished: session?.status === "finished" && focused && appActive && !historyOpen && !exitGuard.requested,
  });

  useEffect(() => {
    if (!focused || !appActive || imageSettingsOpen || historyOpen || exitGuard.requested
      || session?.status !== "paused" || session.autoResumeAt === null) return;
    const tick = () => {
      const current = sessionRef.current;
      if (!current || current.status !== "paused" || current.autoResumeAt === null) return;
      const time = Date.now();
      setNow(time);
      const next = autoResumeRhythmSession(current, time);
      if (next !== current) setSession(next);
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [appActive, exitGuard.requested, focused, historyOpen, imageSettingsOpen, session?.autoResumeAt, session?.status, setSession]);

  function start() {
    if (loading || loadError || savingRef.current || sessionRef.current) return;
    const time = Date.now();
    const id = `rhythm-${time}-${Math.random().toString(36).slice(2, 10)}`;
    savedRef.current = false; setSaved(false); setSaveError(false); setNow(time);
    setSession(createRhythmSession(id, time));
  }
  function togglePause() {
    const current = sessionRef.current;
    if (!current || current.status === "finished" || current.status !== session?.status) return;
    const time = Date.now();
    setSession(current.status === "running" ? pauseRhythmSession(current, time) : resumeRhythmSession(current, time));
    setNow(time);
  }
  async function saveResult(result: RhythmSession) {
    if (savingRef.current || savedRef.current) return;
    savingRef.current = true; setSaving(true); setSaveError(false);
    try {
      const next = await saveRewardedRhythmResult(rhythmResult(result));
      if (mounted.current) {
        setHistory(next); savedRef.current = true; setSaved(true); exitGuard.cancel();
      }
    } catch { if (mounted.current) setSaveError(true); }
    finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  }
  function finish() {
    const current = sessionRef.current;
    if (!current || current.status === "finished") return;
    const time = Date.now();
    const result = finishRhythmSession(current, time);
    setSession(result); setNow(time);
    void saveResult(result);
  }
  const imageState = session?.status === "finished" ? "finished" : session?.status === "paused" ? "paused" : "normal";
  const elapsed = session ? rhythmElapsedMs(session, now) / 1000 : 0;
  const pauseSecondsRemaining = session ? rhythmPauseSecondsRemaining(session, now) : null;

  function leaveChallenge() {
    if (savingRef.current) return;
    suspend();
    router.replace("/(tabs)/games");
  }

  return <Screen desktopLayout="single">
    <PageTitle>寸止め耐久チャレンジ</PageTitle>
    {!session ? <View style={styles.content}>
      <View style={styles.preview}>
        <RhythmImage state="normal" images={images} files={files} loading={loadingFiles}
          action={<RoomVoiceButton room="rhythm" onOpen={suspend} />} />
        <View style={styles.startPanel}>
        <PrimaryButton title="チャレンジ開始" tone="training" disabled={loading || loadError} onPress={start} testID="rhythm-start" />
        <PrimaryButton title="遊び方" tone="secondary" onPress={() => setHelpOpen(true)} testID="rhythm-help-open" />
        {loading ? <AppText variant="muted">読み込み中…</AppText> : null}
        {loadError ? <View style={styles.error}>
          <AppText accessibilityRole="alert">チャレンジの設定と記録を読み込めませんでした。</AppText>
          <PrimaryButton title="再試行" tone="secondary" onPress={() => void load()} testID="rhythm-load-retry" />
        </View> : null}
        <PrimaryButton title="画像を設定" tone="secondary" disabled={loading || loadError} onPress={() => { void loadFiles(); setImageSettingsOpen(true); }} testID="rhythm-images-open" />
        <PrimaryButton title="プレイ履歴" tone="secondary" disabled={loading || loadError} onPress={() => setHistoryOpen(true)} testID="rhythm-history-open" />
        </View>
      </View>
      <PrimaryButton title="ゲーム部屋へ戻る" tone="secondary" onPress={leaveChallenge} testID="rhythm-back" />
    </View> : null}
    <Modal visible={session !== null} animationType="fade" statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]} onRequestClose={leaveChallenge}>
      {session ? <View style={[styles.fullscreen, {
        paddingTop: insets.top, paddingBottom: Math.max(10, insets.bottom),
        paddingLeft: Math.max(10, insets.left), paddingRight: Math.max(10, insets.right),
      }]} testID="rhythm-fullscreen">
        <View style={[styles.playArea, landscape && styles.landscape]}>
          <View style={styles.mediaFrame} testID="rhythm-media-area">
            <RhythmImage state={imageState} images={images} files={files} loading={loadingFiles} fill overlay={
              <RhythmFeedback state={session.status}
              eventKey={`${session.id}:${session.status}:${session.runningSince ?? session.interruptions}`}
              active={focused && appActive && !historyOpen && !exitGuard.requested} fill />
            } action={<RoomVoiceButton room="rhythm" onOpen={suspend} automaticBuiltin={automaticVoices} />} />
          </View>
          <View style={[styles.controls, Platform.OS === "web" && styles.webControls, landscape && styles.landscapeControls]} testID="rhythm-controls">
          <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.controlsContent}>
          <Card style={styles.statusPanel}>
          <View style={styles.tempo}>
            <AppText variant="muted" testID="rhythm-state">{session.status === "finished" ? "チャレンジ終了" : session.status === "paused" ? "一時停止中" : "チャレンジ中"}</AppText>
            {session.status !== "finished" ? <AppText variant="muted" localize={false} testID="rhythm-bpm">{bpm} BPM</AppText> : null}
          </View>
          <View style={styles.statistics}>
            <View style={styles.statistic}><AppText variant="muted">寸止め回数</AppText><AppText style={styles.value} localize={false} testID="rhythm-interruptions">{session.interruptions}</AppText></View>
            <View style={styles.statistic}><AppText variant="muted">プレイ時間</AppText><AppText style={styles.value} localize={false} testID="rhythm-elapsed">{secondsToClock(elapsed)}</AppText></View>
          </View>
          {session.status !== "finished" ? <>
            <RoomRhythmGauge elapsedSeconds={elapsed}
              markers={[0, 1 / 3, 2 / 3].map((offset) => ({ phase: (phase - offset + 1) % 1 }))}
              expanded testID="rhythm-gauge" accessibilityLabel="リズムゲージ" />
            {pauseSecondsRemaining !== null ? <View style={styles.tempo}>
              <AppText variant="muted">自動再開まで</AppText>
              <AppText testID="rhythm-pause-countdown">{`${pauseSecondsRemaining}秒`}</AppText>
            </View> : session.status === "paused" ? <AppText variant="muted">再開を押すとリズムとボイスが再開します。</AppText> : null}
          </> : <>
            {saving ? <AppText variant="muted" testID="rhythm-saving">保存中…</AppText> : null}
            {saveError ? <View testID="rhythm-save-error"><SessionSaveNotice onRetry={() => { if (sessionRef.current) void saveResult(sessionRef.current); }} /></View> : null}
            {saved ? <>
              <AppText testID="rhythm-saved">記録を保存しました。</AppText>
              <DailyGameRewardNotice game="rhythm" resultId={session.id} />
            </> : null}
            <PrimaryButton title="もう一度遊ぶ" disabled={!saved || saving} onPress={discard} testID="rhythm-again" />
            <PrimaryButton title="プレイ履歴" tone="secondary" disabled={!saved || saving} onPress={() => setHistoryOpen(true)} testID="rhythm-history-open" />
            <PrimaryButton title="ゲーム部屋へ戻る" tone="secondary" disabled={saving} onPress={leaveChallenge} testID="rhythm-back" />
          </>}
          </Card>
          </ScrollView>
          {session.status !== "finished" ? <View style={[styles.actions, styles.playActions]}>
            <View style={styles.action}><PrimaryButton title={session.status === "paused" ? "再開" : "イきそう♡"}
              tone="secondary" onPress={togglePause} testID="rhythm-pause" /></View>
            <View style={styles.action}><PrimaryButton title="もう限界です。" tone="danger" onPress={finish} testID="rhythm-finish" /></View>
          </View> : null}
          </View>
        </View>
      </View> : null}
      <Modal visible={historyOpen && session !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setHistoryOpen(false)}>
        {renderHistory()}
      </Modal>
      <PendingResultConfirmation visible={exitGuard.requested && session?.status === "finished" && !saving} onCancel={exitGuard.cancel} onConfirm={exitGuard.confirm} />
      <ConfirmModal visible={exitGuard.requested && session?.status !== "finished"}
        title="記録せずに移動しますか？" message="進行中のチャレンジは保存されません。記録する場合はキャンセルして「終了」を押してください。"
        confirmLabel="記録せずに移動" confirmTone="danger" onCancel={exitGuard.cancel} onConfirm={exitGuard.confirm} />
    </Modal>
    <Modal visible={helpOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setHelpOpen(false)}>
      <View style={[styles.backdrop, { paddingTop: Math.max(16, insets.top), paddingBottom: Math.max(16, insets.bottom) }]}>
        <View style={styles.dialog} testID="rhythm-help-dialog" accessibilityViewIsModal>
          <AppText variant="subtitle" accessibilityRole="header">遊び方</AppText>
          <ScrollView style={styles.helpScroll} contentContainerStyle={styles.helpContent}>
            <AppText>ランダムに変わるリズムに合わせて楽しむチャレンジです。</AppText>
            <AppText>イきそう♡を押した回数（寸止めした回数）を、終了時に記録します。</AppText>
            <AppText>イきそう♡を押すと休憩に入り、高速乳首カリカリだけを再生します。ほかの音声は一時停止します。「再開」で続けられ、押さなければ30秒後に強制的に自動再開します。</AppText>
            <AppText>寸止め10回以上で高速シコシコを自動選択します。</AppText>
            <AppText>画面を離れると自動で一時停止します。再開は手動で行います。</AppText>
            <AppText>終了した記録だけを保存します。</AppText>
            <AppText>終了後は射精音声を繰り返し再生し、終了画面を離れると停止します。</AppText>
            <AppText>1プレイで寸止め10回以上を記録して終了するとクリアです。1日初回のクリアで50ptを獲得します。</AppText>
          </ScrollView>
          <PrimaryButton title="閉じる" tone="secondary" onPress={() => setHelpOpen(false)} testID="rhythm-help-close" />
        </View>
      </View>
    </Modal>
    <RhythmImageSettings visible={imageSettingsOpen} images={images} files={files} loadingFiles={loadingFiles}
      fileError={fileError} onReload={() => void loadFiles()} onClose={() => setImageSettingsOpen(false)}
      onSave={async (next) => { await rhythmChallengeService.saveImages(next); if (mounted.current) setImages(next); }} />
    <Modal visible={historyOpen && session === null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setHistoryOpen(false)}>
      {renderHistory()}
    </Modal>
  </Screen>;

  function renderHistory() {
    return (
      <View style={[styles.backdrop, { paddingTop: Math.max(16, insets.top), paddingBottom: Math.max(16, insets.bottom) }]}>
        <View style={styles.dialog} testID="rhythm-history-dialog" accessibilityViewIsModal>
          <AppText variant="subtitle">寸止め耐久チャレンジの履歴</AppText>
          <AppText variant="muted">最新100件の記録を表示します。</AppText>
          <ScrollView contentContainerStyle={styles.history}>
            {history.length === 0 ? <AppText variant="muted">まだプレイ記録がありません。</AppText> : history.map((entry) => <View key={entry.id} style={styles.historyEntry} testID={`rhythm-history-${entry.id}`}>
              <AppText localize={false}>{toDateTimeKey(new Date(entry.completedAt))}</AppText>
              <View style={styles.tempo}><AppText variant="muted">寸止め回数</AppText><AppText localize={false}>{entry.interruptions}</AppText></View>
              <View style={styles.tempo}><AppText variant="muted">プレイ時間</AppText><AppText localize={false}>{secondsToClock(entry.elapsedSeconds)}</AppText></View>
              <DailyGameRewardNotice game="rhythm" resultId={entry.id} />
            </View>)}
          </ScrollView>
          <PrimaryButton title="閉じる" tone="secondary" onPress={() => setHistoryOpen(false)} testID="rhythm-history-close" />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  content: { width: "100%", maxWidth: 720, alignSelf: "center", gap: 14 },
  preview: { overflow: "hidden", borderWidth: 1, borderColor: "#fff", borderRadius: 4, backgroundColor: "#000" },
  startPanel: { gap: 10, padding: 14 },
  fullscreen: { flex: 1, backgroundColor: "#000", gap: 8 },
  playArea: { flex: 1, minHeight: 0, gap: 8 },
  landscape: { flexDirection: "row" },
  mediaFrame: { flex: 1, minHeight: 0, overflow: "hidden", backgroundColor: "#000" },
  controls: { flexGrow: 0, flexShrink: 1, maxHeight: "52%" },
  webControls: { maxHeight: "75%" },
  detailsScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  playActions: { flexShrink: 0, paddingTop: 8, width: "100%", maxWidth: 720, alignSelf: "center" },
  landscapeControls: { width: "42%", maxWidth: 430, maxHeight: "100%", alignSelf: "center" },
  controlsContent: { width: "100%", maxWidth: 720, alignSelf: "center" },
  statusPanel: { padding: 10, backgroundColor: "#080808", gap: 8 },
  error: { gap: 8 },
  statistics: { flexDirection: "row", gap: 12 },
  statistic: { flex: 1, minWidth: 0, gap: 4 },
  value: { fontSize: 22, lineHeight: 28, fontWeight: "800" },
  tempo: { flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  backdrop: { flex: 1, padding: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.85)" },
  dialog: { width: "100%", maxWidth: 520, maxHeight: "90%", padding: 16, gap: 14, backgroundColor: "#101018", borderWidth: 1, borderColor: "#fff", borderRadius: 6 },
  helpScroll: { flexShrink: 1, minHeight: 0 },
  helpContent: { gap: 14 },
  history: { gap: 12 },
  historyEntry: { gap: 6, padding: 12, borderWidth: 1, borderColor: "#555", borderRadius: 4 },
});
