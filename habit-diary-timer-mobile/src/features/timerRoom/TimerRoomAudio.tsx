import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Modal, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { loopAudioSources } from "@/audio/loopAudioSources";
import { createRoomLoopPlayback } from "@/audio/roomLoopPlayback";
import { AppText } from "@/components/AppText";
import { LocalizedPressable as Pressable } from "@/components/LocalizedPressable";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import { translateText } from "@/i18n";
import {
  copyTimerRoomAudioPreferences, createTimerRoomAudioPreferenceStore, defaultTimerRoomAudioPreferences,
  MAX_TIMER_ROOM_AUDIO_SETS, MAX_TIMER_ROOM_AUDIO_SET_NAME_LENGTH,
  TIMER_ROOM_AUDIO_OPTIONS, timerRoomAudioNames, timerRoomAudioSetIndex, timerRoomAudioSwitchSeconds,
  toggleTimerRoomAudio, validTimerRoomAudioSets,
  type TimerRoomAudioName, type TimerRoomAudioPreferences, type TimerRoomAudioSet,
} from "./audio";
import { useTimerRoomAudioPlayer } from "./useTimerRoomAudioPlayer";

const preferencesStore = createTimerRoomAudioPreferenceStore(AsyncStorage);

export function TimerRoomAudio({ active, startedAt }: { active: boolean; startedAt: number | null }) {
  const { settings } = useAppAudio();
  const insets = useSafeAreaInsets();
  const [preferences, setPreferences] = useState(defaultTimerRoomAudioPreferences);
  const [draft, setDraft] = useState(defaultTimerRoomAudioPreferences);
  const [editingSetIndex, setEditingSetIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preferenceError, setPreferenceError] = useState<"load" | "save" | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const [muted, setMuted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [foreground, setForeground] = useState(() => AppState.currentState === "active"
    && (typeof document === "undefined" || document.visibilityState !== "hidden"));
  const mounted = useRef(false);
  const revision = useRef(0);
  const pending = useRef(false);
  const invalidate = useCallback(() => { revision.current++; }, []);

  const load = useCallback(async () => {
    const request = ++revision.current;
    setPreferenceError(null);
    try {
      const saved = await preferencesStore.load();
      if (mounted.current && request === revision.current) {
        setPreferences(saved); setDraft(copyTimerRoomAudioPreferences(saved)); setReady(true);
      }
    } catch { if (mounted.current && request === revision.current) setPreferenceError("load"); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; invalidate(); };
  }, [invalidate, load]);
  useFocusEffect(useCallback(() => () => {
    // The navigator may retain this screen while unfocused. Let pending reads
    // and committed writes update it; only an actual unmount invalidates them.
    setVisible(false);
  }, []));
  useEffect(() => {
    const refresh = () => {
      setForeground(AppState.currentState === "active" && (typeof document === "undefined" || document.visibilityState !== "hidden"));
      setNow(Date.now());
    };
    const subscription = AppState.addEventListener("change", refresh);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", refresh);
    return () => {
      subscription.remove();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    setNow(Date.now());
    if (!active || !foreground) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [active, foreground, startedAt]);

  const open = () => {
    setDraft(copyTimerRoomAudioPreferences(preferences));
    setEditingSetIndex(timerRoomAudioSetIndex(preferences, startedAt, Date.now()));
    setVisible(true);
    setNow(Date.now());
    if (ready) setPreferenceError(null);
    else void load();
  };
  const close = () => { if (!pending.current) setVisible(false); };
  async function save() {
    if (!ready || pending.current || !validTimerRoomAudioSets(draft.sets)) return;
    pending.current = true;
    const request = ++revision.current;
    setBusy(true);
    setPreferenceError(null);
    try {
      const saved = await preferencesStore.save(draft);
      if (mounted.current && request === revision.current) {
        setPreferences(saved); setPlaybackError(false); setVisible(false);
      }
    } catch { if (mounted.current && request === revision.current) setPreferenceError("save"); }
    finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const selected = timerRoomAudioNames(preferences, startedAt, now);
  const selectedKey = selected.join(",");
  const currentSetIndex = Math.min(editingSetIndex, draft.sets.length - 1);
  const currentSet = draft.sets[currentSetIndex];
  const draftSelected = draft.mode === "auto" ? currentSet.voices : draft.manual;
  const validSets = validTimerRoomAudioSets(draft.sets);
  const locked = busy || !ready;
  const enabled = active && foreground && ready && !muted && settings?.soundEnabled === true;
  const reportError = useCallback(() => { if (mounted.current) setPlaybackError(true); }, []);
  useEffect(() => { setPlaybackError(false); }, [selectedKey, active]);

  function changeMode(mode: TimerRoomAudioPreferences["mode"]) {
    setDraft((current) => current.mode === mode ? current : {
      ...current, mode, manual: mode === "manual" ? timerRoomAudioNames(current, startedAt, now) : [...current.manual],
    });
  }

  function editSet(change: (set: TimerRoomAudioSet) => TimerRoomAudioSet) {
    setDraft((current) => ({ ...current, sets: current.sets.map((set, index) => index === currentSetIndex ? change(set) : set) }));
  }

  function toggleVoice(name: TimerRoomAudioName) {
    if (draft.mode === "manual") {
      setDraft((current) => toggleTimerRoomAudio(current, name, startedAt, now));
    } else {
      editSet((set) => ({ ...set, voices: set.voices.includes(name) ? set.voices.filter((voice) => voice !== name) : [...set.voices, name] }));
    }
  }

  function addSet() {
    if (locked || draft.sets.length >= MAX_TIMER_ROOM_AUDIO_SETS) return;
    setEditingSetIndex(draft.sets.length);
    setDraft((current) => ({ ...current, sets: [...current.sets, { name: "", voices: [] }] }));
  }

  function removeSet() {
    if (locked || draft.sets.length <= 1) return;
    setDraft((current) => ({ ...current, sets: current.sets.filter((_, index) => index !== currentSetIndex) }));
    setEditingSetIndex(Math.max(0, currentSetIndex - 1));
  }

  const playingSetIndex = timerRoomAudioSetIndex(preferences, startedAt, now);
  const playingSet = preferences.sets[playingSetIndex];

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="ボイスを選択" onPress={open}
      testID="room-voice-open-timer-room" style={styles.circle}>
      <AppText localize={false} style={styles.icon}>♫</AppText>
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <ScrollView style={styles.backdrop} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.container, { paddingTop: Math.max(20, insets.top), paddingBottom: Math.max(20, insets.bottom) }]}>
        <View style={styles.dialog} testID="room-voice-dialog-timer-room">
          <AppText variant="subtitle">ボイスを選択</AppText>
          <AppText variant="muted">チェックした音声をプレイ中に再生します。複数選択できます。</AppText>
          <View style={styles.modes}>
            {(["auto", "manual"] as const).map((mode) => <Pressable
              key={mode} accessibilityRole="radio" accessibilityState={{ checked: draft.mode === mode, disabled: locked }}
              aria-checked={draft.mode === mode} aria-disabled={locked} disabled={locked}
              accessibilityLabel={mode === "auto" ? "1分ごとにランダム切替" : "手動選択"}
              testID={`timer-room-audio-mode-${mode}`} onPress={() => changeMode(mode)}
              style={[styles.mode, draft.mode === mode && styles.selected]}>
              <AppText>{mode === "auto" ? "1分ごとにランダム切替" : "手動選択"}</AppText>
            </Pressable>)}
          </View>
          {draft.mode === "auto" ? <View style={styles.setEditor} testID="timer-room-audio-sets">
            <AppText variant="muted">自動切替では、1分ごとにセットをランダムに切り替えます。セット内の音声は同時にループ再生します。</AppText>
            <View style={styles.setHeading}>
              <AppText variant="label">音声セット</AppText>
              <AppText localize={false} variant="muted" testID="timer-room-audio-set-count">{`${draft.sets.length} / ${MAX_TIMER_ROOM_AUDIO_SETS}`}</AppText>
            </View>
            <SelectField label="編集するセット" value={String(currentSetIndex)}
              options={draft.sets.map((set, index) => ({ value: String(index), label: set.name.trim() || `セット ${index + 1}`, localize: !set.name.trim() }))}
              disabled={locked} onChange={(value) => setEditingSetIndex(Number(value))} testID="timer-room-audio-set-select" />
            <TextField label="セット名" value={currentSet.name} editable={!locked}
              maxLength={MAX_TIMER_ROOM_AUDIO_SET_NAME_LENGTH} onChangeText={(name) => editSet((set) => ({ ...set, name }))}
              accessibilityLabel={translateText("セット名", settings?.language ?? "ja")} testID="timer-room-audio-set-name" />
            <AppText variant="muted">未入力の場合はセット番号を表示します。</AppText>
            <PrimaryButton title="セットを追加" tone="secondary" disabled={locked || draft.sets.length >= MAX_TIMER_ROOM_AUDIO_SETS}
              onPress={addSet} testID="timer-room-audio-set-add" />
            <PrimaryButton title="このセットを削除" tone="danger" disabled={locked || draft.sets.length <= 1}
              onPress={removeSet} testID="timer-room-audio-set-remove" />
            {draft.sets.length >= MAX_TIMER_ROOM_AUDIO_SETS ? <AppText variant="muted">セットは最大20個まで登録できます。</AppText> : null}
          </View> : null}
          <AppText variant="label">{draft.mode === "auto" ? "このセットで再生する音声" : "標準の音声"}</AppText>
          {TIMER_ROOM_AUDIO_OPTIONS.map(({ key, title }) => {
            const checked = draftSelected.includes(key);
            return <Pressable key={key} accessibilityRole="checkbox" accessibilityLabel={title}
              accessibilityState={{ checked, disabled: locked }} aria-checked={checked} aria-disabled={locked}
              disabled={locked} onPress={() => toggleVoice(key)}
              testID={`room-voice-builtin-timer-room-${key}`} style={[styles.choice, checked && styles.selected]}>
              <AppText localize={false}>{checked ? "☑" : "☐"}</AppText><AppText style={styles.choiceLabel}>{title}</AppText>
            </Pressable>;
          })}
          {!validSets ? <AppText accessibilityRole="alert" testID="timer-room-audio-set-error">各セットで音声を1つ以上選択してください。</AppText> : null}
          {!validSets && draft.mode === "manual" ? <>
            <AppText variant="muted">音声が未設定のセットがあります。自動切替に戻って設定するか、削除してください。</AppText>
            <PrimaryButton title="未設定のセットを編集" tone="secondary" disabled={locked}
              testID="timer-room-audio-set-fix" onPress={() => {
                setEditingSetIndex(Math.max(0, draft.sets.findIndex((set) => !validTimerRoomAudioSets([set]))));
                changeMode("auto");
              }} />
          </> : null}
          {active && preferences.mode === "auto" ? <View style={styles.setEditor}>
            <AppText variant="muted">選択中のセット</AppText>
            <AppText localize={!playingSet.name} testID="timer-room-audio-playing-set">{playingSet.name || `セット ${playingSetIndex + 1}`}</AppText>
            {preferences.sets.length > 1 ? <View style={styles.countdown}>
              <AppText variant="muted">次のセットまで</AppText>
              <AppText testID="timer-room-audio-countdown">{`${timerRoomAudioSwitchSeconds(startedAt, now)}秒`}</AppText>
            </View> : null}
          </View> : null}
          <PrimaryButton title={muted ? "音声を再生" : "音声を停止"} tone="secondary"
            disabled={busy || !active || !ready || selected.length === 0 || settings?.soundEnabled !== true} testID="timer-room-audio-toggle"
            onPress={() => { setMuted((value) => !value); setPlaybackError(false); setAttempt((value) => value + 1); }} />
          {settings?.soundEnabled === false ? <AppText variant="muted">アプリ設定でサウンドがOFFになっています。</AppText> : null}
          {preferenceError ? <AppText accessibilityRole="alert" testID="timer-room-audio-settings-error">{preferenceError === "load"
            ? "ボイス設定を読み込めませんでした。再試行してください。" : "ボイス設定を保存できませんでした。もう一度お試しください。"}</AppText> : null}
          {!ready ? <PrimaryButton title="再試行" tone="secondary" onPress={() => void load()} /> : null}
          {playbackError && enabled ? <>
            <AppText accessibilityRole="alert" testID="timer-room-audio-error">音声を再生できませんでした。「音声を再試行」を押してください。</AppText>
            <PrimaryButton title="音声を再試行" tone="secondary" testID="timer-room-audio-retry"
              onPress={() => { setPlaybackError(false); setAttempt((value) => value + 1); }} />
          </> : null}
          <PrimaryButton title="設定する" tone="save" disabled={locked || !validSets}
            onPress={() => void save()} testID="room-voice-confirm-timer-room" />
          <PrimaryButton title="キャンセル" tone="secondary" disabled={busy} onPress={close} testID="room-voice-cancel-timer-room" />
        </View>
      </ScrollView>
    </Modal>
    {enabled ? selected.map((name) => <TimerRoomSound key={`${name}-${attempt}`} name={name} volume={settings?.soundVolume ?? 0}
      onError={reportError} />) : null}
  </>;
}

function TimerRoomSound({ name, volume, onError }: { name: TimerRoomAudioName; volume: number; onError(error: unknown): void }) {
  const player = useTimerRoomAudioPlayer(loopAudioSources[name], onError);
  const playback = useMemo(() => createRoomLoopPlayback(player), [player]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Audio player properties are native/browser setters.
    player.volume = Math.max(0, Math.min(1, volume));
  }, [player, volume]);
  useEffect(() => {
    void playback.setPaused(false).catch(onError);
    return () => playback.cancelPending();
  }, [playback, onError]);
  return null;
}

const styles = StyleSheet.create({
  circle: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: "#b0cbef", backgroundColor: "#192d46", alignItems: "center", justifyContent: "center" },
  icon: { color: "#fff", fontSize: 25, lineHeight: 30 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)" },
  container: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  dialog: { width: "100%", maxWidth: 460, padding: 18, gap: 12, backgroundColor: "#080808", borderWidth: 1, borderColor: "#fff" },
  modes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  setEditor: { gap: 10 },
  setHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  mode: { flexGrow: 1, minHeight: 44, padding: 10, borderWidth: 1, borderColor: "#768ba1", borderRadius: 4, justifyContent: "center", alignItems: "center" },
  choice: { flexDirection: "row", gap: 10, alignItems: "center", minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#777", borderRadius: 4 },
  choiceLabel: { flex: 1, minWidth: 0 },
  selected: { backgroundColor: "#194770", borderColor: "#9bcbff" },
  countdown: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
