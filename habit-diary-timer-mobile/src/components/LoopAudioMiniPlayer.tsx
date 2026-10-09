import { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { loopAudioOptions } from "@/audio/loopAudioLabels";
import { useLoopSleepRemaining } from "@/audio/useLoopSleepRemaining";
import { translateText } from "@/i18n";
import { AppText } from "./AppText";
import { LocalizedPressable as Pressable } from "./LocalizedPressable";
import { PrimaryButton } from "./PrimaryButton";
import { LoopAudioControls } from "./LoopAudioControls";

export function LoopAudioMiniPlayer({ bottomInset = false }: { bottomInset?: boolean }) {
  const { loopAudioNames, stopLoopAudio, loopSleepDeadline, settings } = useAppAudio();
  const [expanded, setExpanded] = useState(false);
  const remaining = useLoopSleepRemaining(loopSleepDeadline);
  const insets = useSafeAreaInsets();
  useEffect(() => { if (!loopAudioNames.length) setExpanded(false); }, [loopAudioNames.length]);
  if (loopAudioNames.length === 0) return null;
  const playingAudios = loopAudioOptions.filter(({ key }) => loopAudioNames.includes(key));
  const names = playingAudios.map(({ title }) => translateText(title, settings?.language ?? "ja")).join(" / ");
  return <>
    <View testID="loop-mini-player" style={[styles.bar, bottomInset && { paddingBottom: Math.max(6, insets.bottom) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="再生中の音声と停止タイマー" onPress={() => setExpanded(true)} style={styles.info}>
        <Ionicons name="musical-notes" size={20} color="#ffbad4" />
        <View style={styles.labels}>
          <AppText localize={false} numberOfLines={1} style={styles.names}>{names}</AppText>
          <AppText variant="muted" style={styles.hint}>再生中・タップして設定</AppText>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="停止タイマー" onPress={() => setExpanded(true)} style={styles.timerButton}>
        <Ionicons name="timer-outline" size={19} color="#c7dfff" />
        {remaining ? <AppText localize={false} style={styles.remaining}>{remaining}</AppText> : null}
      </Pressable>
      <Pressable testID="loop-mini-stop" accessibilityRole="button" accessibilityLabel="すべて停止" onPress={() => stopLoopAudio()} style={styles.stop}>
        <Ionicons name="stop" size={15} color="#fff" /><AppText style={styles.stopLabel}>停止</AppText>
      </Pressable>
    </View>
    <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
      <View style={[styles.backdrop, { paddingTop: Math.max(20, insets.top), paddingBottom: Math.max(20, insets.bottom) }]}>
        <View style={styles.dialog} accessibilityViewIsModal onAccessibilityEscape={() => setExpanded(false)}>
          <ScrollView contentContainerStyle={styles.dialogContent}>
            <LoopAudioControls />
            <PrimaryButton title="閉じる" onPress={() => setExpanded(false)} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#23151f", borderTopWidth: 1, borderTopColor: "#664354", flexShrink: 0 },
  info: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, minWidth: 0 },
  labels: { flex: 1, minWidth: 0 },
  names: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 10, lineHeight: 16 },
  timerButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  remaining: { fontSize: 10, lineHeight: 15 },
  stop: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, minHeight: 44, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "#733044" },
  stopLabel: { fontSize: 12 },
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, backgroundColor: "#000b" },
  dialog: { width: "100%", maxWidth: 460, maxHeight: "100%", backgroundColor: "#181017", borderRadius: 12, borderWidth: 1, borderColor: "#a26b85", overflow: "hidden" },
  dialogContent: { padding: 20, gap: 14 },
});
