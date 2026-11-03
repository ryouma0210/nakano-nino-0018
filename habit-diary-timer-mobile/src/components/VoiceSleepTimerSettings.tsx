import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVoiceLibrary } from "@/audio/VoiceLibraryProvider";
import { useLoopSleepRemaining } from "@/audio/useLoopSleepRemaining";
import { useAppAudio } from "@/audio/AudioProvider";
import { translateText } from "@/i18n";
import { AppText } from "./AppText";
import { PrimaryButton } from "./PrimaryButton";

const presets = [5, 15, 30, 60] as const;

export function VoiceSleepTimerSettings({ disabled = false }: { disabled?: boolean }) {
  const { currentId, loading, busy, sleepDeadline, sleepMinutes, setSleepMinutes } = useVoiceLibrary();
  const remaining = useLoopSleepRemaining(sleepDeadline);
  const [visible, setVisible] = useState(false);
  const [minutes, setMinutes] = useState(15);
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const insets = useSafeAreaInsets();
  const locked = disabled || loading || busy || currentId === null;
  const active = sleepDeadline !== null;

  useFocusEffect(useCallback(() => () => setVisible(false), []));

  function open() {
    if (locked) return;
    setMinutes(sleepMinutes ?? 15);
    setVisible(true);
  }

  function confirm() {
    if (locked) return;
    setSleepMinutes(minutes);
    setVisible(false);
  }

  return <View style={styles.section}>
    <AppText variant="subtitle">停止タイマー</AppText>
    {active ? <>
      <View style={styles.summary}>
        <AppText variant="muted">設定時間</AppText>
        <AppText testID="voice-sleep-configured">{`${sleepMinutes ?? minutes}分`}</AppText>
      </View>
      <AppText localize={false} testID="voice-sleep-remaining">{`${translateText("停止まで", language)} ${remaining ?? "00:00"}`}</AppText>
    </> : <AppText variant="muted" testID="voice-sleep-unset">タイマー未設定</AppText>}
    <PrimaryButton title={active ? "停止タイマーを変更" : "停止タイマーを設定"} tone="secondary"
      disabled={locked} onPress={open} testID="voice-sleep-settings-open" />
    {active ? <PrimaryButton title="タイマーを解除" tone="secondary" onPress={() => setSleepMinutes(null)} testID="voice-sleep-clear" /> : null}
    {currentId === null ? <AppText variant="muted">ボイスを再生すると、停止タイマーを設定できます。</AppText> : null}
    <AppText variant="muted">一時停止中も時間は進みます。停止するとタイマーを解除します。</AppText>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <ScrollView style={styles.backdrop} contentContainerStyle={[styles.dialogContainer, {
        paddingTop: Math.max(24, insets.top), paddingBottom: Math.max(24, insets.bottom),
      }]}>
        <View style={styles.dialog} accessibilityViewIsModal onAccessibilityEscape={() => setVisible(false)} testID="voice-sleep-settings-dialog">
          <AppText variant="subtitle">停止タイマーの設定</AppText>
          <AppText>停止するまでの時間を選択してください。「設定する」を押した時点からカウントします。</AppText>
          <View style={styles.presets}>
            {presets.map((value) => <Pressable key={value} accessibilityRole="button"
              accessibilityLabel={translateText(`${value}分`, language)} accessibilityState={{ selected: value === minutes, disabled: locked }}
              aria-pressed={value === minutes} disabled={locked} onPress={() => setMinutes(value)} testID={`voice-sleep-${value}`}
              style={[styles.preset, value === minutes && styles.selected, locked && styles.disabled]}>
              <AppText style={styles.presetText}>{`${value}分`}</AppText>
            </Pressable>)}
          </View>
          <View style={styles.summary}>
            <AppText>選択中の時間</AppText><AppText testID="voice-sleep-draft">{`${minutes}分`}</AppText>
          </View>
          <PrimaryButton title="設定する" tone="save" disabled={locked} onPress={confirm} testID="voice-sleep-settings-confirm" />
          <PrimaryButton title="キャンセル" tone="secondary" onPress={() => setVisible(false)} testID="voice-sleep-settings-cancel" />
        </View>
      </ScrollView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  summary: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)" },
  dialogContainer: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  dialog: { width: "100%", maxWidth: 460, gap: 16, padding: 20, borderWidth: 1, borderColor: "#fff", backgroundColor: "#080808" },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { flexBasis: "42%", flexGrow: 1, minHeight: 46, padding: 10, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#aaa", borderRadius: 4, backgroundColor: "#151515" },
  selected: { borderColor: "#9bcbff", backgroundColor: "#194770" },
  presetText: { fontWeight: "800" },
  disabled: { opacity: 0.45 },
});
