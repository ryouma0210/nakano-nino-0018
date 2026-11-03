import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVoiceLibrary } from "@/audio/VoiceLibraryProvider";
import { roomVoiceStore } from "@/audio/roomVoiceStore";
import { loopAudioOptions } from "@/audio/loopAudioLabels";
import { ROOM_VOICE_BUILTINS, type RoomVoiceRoom, type RoomVoiceSelection } from "@/audio/roomVoiceSelection";
import { AppText } from "./AppText";
import { LocalizedPressable as Pressable } from "./LocalizedPressable";
import { PrimaryButton } from "./PrimaryButton";

export function RoomVoiceButton({ room, onOpen, automaticBuiltin = [] }: {
  room: RoomVoiceRoom; onOpen?: () => void; automaticBuiltin?: readonly string[];
}) {
  const insets = useSafeAreaInsets();
  const library = useVoiceLibrary();
  const preferences = useSyncExternalStore(roomVoiceStore.subscribe, roomVoiceStore.getSnapshot, roomVoiceStore.getSnapshot);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoomVoiceSelection>({ builtin: [], storedIds: [] });
  const [automatic, setAutomatic] = useState<readonly string[]>([]);
  const operation = useRef(0);
  useFocusEffect(useCallback(() => {
    roomVoiceStore.load().catch(() => {});
    return () => { operation.current += 1; setVisible(false); setBusy(false); };
  }, []));

  async function open() {
    // Capture the current play phase before opening settings suspends its audio.
    setAutomatic([...automaticBuiltin]);
    onOpen?.();
    const request = ++operation.current;
    setError(null); setBusy(true); setVisible(true);
    try {
      await roomVoiceStore.load();
      if (operation.current === request) {
        const selection = roomVoiceStore.getSnapshot().preferences.rooms[room];
        setDraft({ builtin: [...selection.builtin], storedIds: [...selection.storedIds] });
      }
    } catch { if (operation.current === request) setError("ボイス設定を読み込めませんでした。再試行してください。"); }
    finally { if (operation.current === request) setBusy(false); }
  }

  async function save() {
    if (busy || !preferences.ready || library.loading || library.busy) return;
    const request = ++operation.current;
    setBusy(true); setError(null);
    try {
      await roomVoiceStore.save(room, { ...draft, storedIds: library.error ? draft.storedIds : draft.storedIds.filter((id) => library.voices.some((voice) => voice.id === id)) });
      if (operation.current === request) setVisible(false);
    } catch { if (operation.current === request) setError("ボイス設定を保存できませんでした。もう一度お試しください。"); }
    finally { if (operation.current === request) setBusy(false); }
  }

  const close = () => { if (!busy) { operation.current += 1; setVisible(false); } };
  function toggle(kind: keyof RoomVoiceSelection, id: string) {
    setDraft((current) => ({ ...current, [kind]: current[kind].includes(id) ? current[kind].filter((value) => value !== id) : [...current[kind], id] }));
  }
  const locked = busy || !preferences.ready;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="ボイスを選択" onPress={() => void open()}
      testID={`room-voice-open-${room}`} style={styles.circle}>
      <AppText localize={false} style={styles.icon}>♫</AppText>
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <ScrollView style={styles.backdrop} contentContainerStyle={[styles.container, { paddingTop: Math.max(20, insets.top), paddingBottom: Math.max(20, insets.bottom) }]}>
        <View style={styles.dialog} testID={`room-voice-dialog-${room}`}>
          <AppText variant="subtitle">ボイスを選択</AppText>
          <AppText variant="muted">チェックした音声をプレイ中に再生します。複数選択できます。</AppText>
          {automatic.length > 0 ? <AppText variant="muted">自動選択の音声は、プレイ状況に応じて切り替わります。</AppText> : null}
          <AppText variant="label">標準の音声</AppText>
          {ROOM_VOICE_BUILTINS[room].map((id) => {
            const autoSelected = automatic.includes(id);
            const selected = autoSelected || draft.builtin.includes(id);
            const disabled = locked || autoSelected;
            const label = loopAudioOptions.find(({ key }) => key === id)?.title ?? "リズム音";
            return <Pressable key={id} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }}
              aria-checked={selected} aria-disabled={disabled}
              accessibilityLabel={label} disabled={disabled} testID={`room-voice-builtin-${room}-${id}`} onPress={() => toggle("builtin", id)} style={[styles.choice, selected && styles.selected]}>
              <AppText localize={false}>{selected ? "☑" : "☐"}</AppText><AppText style={styles.choiceLabel}>{label}</AppText>
              {autoSelected ? <AppText variant="muted">自動</AppText> : null}
            </Pressable>;
          })}
          <AppText variant="label">格納したボイス</AppText>
          {library.loading ? <AppText variant="muted">読み込み中…</AppText> : null}
          {library.error ? <AppText accessibilityRole="alert">ボイス一覧を読み込めませんでした。ボイス格納で確認してください。</AppText> : null}
          {!library.loading && !library.error && library.voices.length === 0 ? <AppText variant="muted">ボイス格納で音声を追加すると、ここから選べます。</AppText> : null}
          {library.voices.map((voice) => {
            const selected = draft.storedIds.includes(voice.id);
            return <Pressable key={voice.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: locked || library.busy }}
              aria-checked={selected} aria-disabled={locked || library.busy}
              accessibilityLabel={voice.name} disabled={locked || library.busy} testID={`room-voice-stored-${room}-${voice.id}`}
              onPress={() => toggle("storedIds", voice.id)} style={[styles.choice, selected && styles.selected]}>
              <AppText localize={false}>{selected ? "☑" : "☐"}</AppText><AppText localize={false} style={styles.choiceLabel}>{voice.name}</AppText>
            </Pressable>;
          })}
          {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
          {!preferences.ready && !busy ? <PrimaryButton title="再試行" tone="secondary" onPress={() => void open()} /> : null}
          <PrimaryButton title="設定する" tone="save" disabled={locked || library.loading || library.busy}
            onPress={() => void save()} testID={`room-voice-confirm-${room}`} />
          <PrimaryButton title="キャンセル" tone="secondary" disabled={busy} onPress={close} testID={`room-voice-cancel-${room}`} />
        </View>
      </ScrollView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  circle: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: "#b0cbef", backgroundColor: "#192d46", alignItems: "center", justifyContent: "center" },
  icon: { color: "#fff", fontSize: 25, lineHeight: 30 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)" },
  container: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  dialog: { width: "100%", maxWidth: 460, padding: 18, gap: 12, backgroundColor: "#080808", borderWidth: 1, borderColor: "#fff" },
  choice: { flexDirection: "row", gap: 10, alignItems: "center", minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#777", borderRadius: 4 },
  choiceLabel: { flex: 1, minWidth: 0 },
  selected: { borderColor: "#9bcbff", backgroundColor: "#194770" },
});
