import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { useVoiceLibrary } from "@/audio/VoiceLibraryProvider";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SelectField } from "@/components/SelectField";
import { Disclosure } from "@/components/Disclosure";
import { useAppToast } from "@/components/AppToastProvider";
import { TimerRoomMedia } from "@/features/timerRoom/TimerRoomMedia";
import { TimerRoomAudio } from "@/features/timerRoom/TimerRoomAudio";
import { isValidTimerRoomMinutes, MIN_TIMER_ROOM_MINUTES, remainingTimerRoomSeconds, TIMER_ROOM_DURATION_MINUTES } from "@/features/timerRoom/session";
import { timerRoomStore } from "@/features/timerRoom/store";

const durationOptions = TIMER_ROOM_DURATION_MINUTES.map((minutes) => ({
  value: String(minutes),
  label: minutes === 1440 ? "24時間（1日）" : minutes < 60 ? `${minutes}分`
    : minutes % 60 === 0 ? `${minutes / 60}時間` : `${Math.floor(minutes / 60)}時間30分`,
}));

function clockText(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = seconds % 60;
  return `${hours > 0 ? `${hours.toString().padStart(2, "0")}:` : ""}${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

export default function TimerRoomScreen() {
  const { session, ready, error: storageError } = useSyncExternalStore(timerRoomStore.subscribe, timerRoomStore.getSnapshot, timerRoomStore.getSnapshot);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { stopLoopAudio, setRoomAudioScene, setSessionAudioActive } = useAppAudio();
  const voiceLibrary = useVoiceLibrary();
  const stopVoices = useRef(voiceLibrary.stop);
  stopVoices.current = voiceLibrary.stop;
  const { showErrorToast } = useAppToast();
  const [minutes, setMinutes] = useState(String(MIN_TIMER_ROOM_MINUTES));
  const [mediaReady, setMediaReady] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const wide = width >= 900;
  const landscape = width > height;
  const remaining = session ? remainingTimerRoomSeconds(session, now) : 0;
  const expired = session !== null && remaining === 0;
  const validMinutes = isValidTimerRoomMinutes(Number(minutes));

  useFocusEffect(useCallback(() => {
    setFocused(true);
    setNow(Date.now());
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    const update = () => {
      setForeground(AppState.currentState === "active" && (Platform.OS !== "web" || typeof document === "undefined" || document.visibilityState !== "hidden"));
      setNow(Date.now());
    };
    const subscription = AppState.addEventListener("change", update);
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", update);
    update();
    return () => {
      subscription.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!focused || !foreground || !session) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [focused, foreground, session]);

  useEffect(() => {
    if (!focused || !session) return;
    stopVoices.current();
    void stopLoopAudio().catch(console.error);
    setRoomAudioScene(null);
    setSessionAudioActive(true);
    return () => setSessionAudioActive(false);
  }, [focused, session, setRoomAudioScene, setSessionAudioActive, stopLoopAudio]);

  async function start() {
    if (pending.current || !ready || !mediaReady || session || !validMinutes) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await timerRoomStore.start(Number(minutes));
      setNow(Date.now());
    } catch {
      setError("タイマーを開始できませんでした。もう一度お試しください。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function leave(stopEarly: boolean) {
    if (pending.current || (!stopEarly && session && remainingTimerRoomSeconds(session, Date.now()) > 0)) return;
    pending.current = true;
    setBusy(true);
    // clear() deactivates the guard synchronously. Leaving must not wait on a
    // slow storage write; any failure can still be shown by the global toast.
    const stopped = timerRoomStore.clear();
    setSessionAudioActive(false);
    router.replace("/(tabs)/basement");
    try {
      await stopped;
    } catch {
      showErrorToast("退出しましたが、終了状態を保存できませんでした。次回起動時にタイマーが復元された場合は、もう一度停止してください。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const safePadding = { paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(12, insets.bottom), paddingLeft: Math.max(12, insets.left), paddingRight: Math.max(12, insets.right) };
  const expandedHeader = <View style={styles.header}>
    <AppText variant="label" style={styles.title}>監禁部屋</AppText>
    <View style={styles.clock}>
      <AppText variant="muted">残り時間</AppText>
      <AppText localize={false} style={styles.time} testID="timer-room-remaining">{clockText(remaining)}</AppText>
    </View>
  </View>;
  const renderExpandedLayout = (frame: ReactNode, mediaControls: ReactNode) => (
    <View style={[styles.expanded, landscape && styles.expandedLandscape]} testID="timer-room-expanded">
      {!landscape ? expandedHeader : null}
      <View style={styles.expandedMedia} testID="timer-room-media-pane">{frame}</View>
      <View style={[styles.expandedControls, landscape && styles.landscapeControls]} testID="timer-room-controls">
        <ScrollView style={styles.expandedDetails} contentContainerStyle={styles.expandedDetailsContent} keyboardShouldPersistTaps="handled">
          {landscape ? expandedHeader : null}
          {mediaControls}
          {storageError ? <AppText accessibilityRole="alert" style={styles.error}>{storageError}</AppText> : null}
          <AppText variant="muted" testID="timer-room-status">{expired ? "設定時間が終了しました。このまま継続するか、部屋から出られます。" : "タイマー実行中"}</AppText>
        </ScrollView>
        <View style={styles.footerButtons}>
          <View style={styles.footerButton}><PrimaryButton title="部屋から出る" tone="secondary" disabled={busy || !expired} onPress={() => void leave(false)} testID="timer-room-exit" /></View>
          <View style={styles.footerButton}><PrimaryButton title="停止して退出" tone="danger" disabled={busy} onPress={() => void leave(true)} testID="timer-room-stop" /></View>
        </View>
      </View>
    </View>
  );
  const media = <TimerRoomMedia active={focused && foreground} expanded={session !== null}
    renderExpandedLayout={renderExpandedLayout}
    startedAt={session?.startedAt ?? null} now={now}
    height={wide ? Math.max(280, height - insets.top - insets.bottom - 230) : Math.max(240, Math.min(440, height * 0.47))}
    onSelectionReadyChange={setMediaReady}
    topRightControl={<TimerRoomAudio active={focused && foreground && session !== null} startedAt={session?.startedAt ?? null} />} />;

  if (session) return <View style={[styles.root, safePadding]} testID="timer-room-screen">
    {media}
  </View>;

  return <View style={[styles.root, safePadding]} testID="timer-room-screen">
    <View style={styles.header}>
      <AppText variant="title" style={styles.title}>監禁部屋</AppText>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.contents} keyboardShouldPersistTaps="handled">
      <View style={styles.setupLayout}>
      <View style={styles.controls} testID="timer-room-controls">
        {!ready ? <AppText>読み込み中...</AppText> : null}
        {storageError ? <AppText accessibilityRole="alert" style={styles.error}>{storageError}</AppText> : null}
        <View style={styles.setup}>
          <SelectField label="タイマーを選択" value={minutes} options={durationOptions} onChange={setMinutes} disabled={busy} testID="timer-room-minutes" />
          <AppText variant="muted">30分単位で、最大24時間（1日）まで選べます。</AppText>
        </View>
      </View>
      <View style={styles.mediaPane}>{media}</View>
      </View>
      <View style={styles.controls}>
        {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}
        <Disclosure title="遊び方" testID="timer-room-help">
          <AppText>タイマーと表示する画像・動画を選んでから開始します。ファイル格納では「監禁用」のファイルを選べます。</AppText>
          <AppText>開始すると拡大表示に切り替わります。横長の画面では画像・動画を左、残り時間と操作ボタンを右側中央に表示します。縦長の画面では残り時間を上部、操作ボタンを下部に表示します。</AppText>
          <AppText>時間を設定して開始します。アプリを閉じている間も時間は進み、残り時間があれば起動時にこの部屋へ戻ります。</AppText>
          <AppText>デフォルト動画は1番から始まり、実行中は1分ごとにランダムで切り替わります。格納ファイルは「前へ」「次へ」で手動で切り替えます。動画は音声なしで自動再生・ループします。</AppText>
          <AppText>デフォルト動画も「前へ」「次へ」で切り替えられます。次の自動切替までは選んだ動画を表示します。</AppText>
          <AppText>画像右上の丸いボイスボタンから、ループ音声と同じ音源を選べます。</AppText>
          <AppText>音声は1分ごとのランダム切替と、手動選択を切り替えられます。</AppText>
          <AppText>時間が終了すると「部屋から出る」が使えます。終了後も画像・動画と音声は継続します。途中で終了したい場合は「停止して退出」を押してください。</AppText>
        </Disclosure>
        <PrimaryButton title="監禁開始" tone="save" disabled={!ready || !mediaReady || busy || !validMinutes} onPress={() => void start()} testID="timer-room-start" />
        <PrimaryButton title="部屋から出る" tone="secondary" disabled={busy} onPress={() => void leave(false)} testID="timer-room-exit" />
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: "#000", gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { flex: 1 },
  scroll: { flex: 1, minHeight: 0 },
  contents: { width: "100%", maxWidth: 960, alignSelf: "center", gap: 24, paddingBottom: 16 },
  setupLayout: { gap: 24 },
  mediaPane: { minWidth: 0 },
  controls: { gap: 16, minWidth: 0 },
  expanded: { flex: 1, minHeight: 0, gap: 8 },
  expandedLandscape: { flexDirection: "row" },
  expandedMedia: { flex: 1, minWidth: 0, minHeight: 0 },
  expandedControls: { flexShrink: 1, maxHeight: "60%", minHeight: 0, gap: 8 },
  landscapeControls: { width: "42%", maxWidth: 430, maxHeight: "100%", alignSelf: "center" },
  expandedDetails: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  expandedDetailsContent: { gap: 8 },
  clock: { alignItems: "flex-end" },
  time: { fontSize: 32, lineHeight: 38, fontWeight: "800", fontVariant: ["tabular-nums"] },
  footerButtons: { flexDirection: "row", gap: 8 },
  footerButton: { flex: 1, minWidth: 0 },
  setup: { gap: 12 },
  error: { color: "#ff9aa0" },
});
