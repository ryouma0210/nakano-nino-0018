import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVoiceLibrary } from "@/audio/VoiceLibraryProvider";
import { AppText } from "./AppText";
import { LocalizedPressable as Pressable } from "./LocalizedPressable";

export function VoiceMiniPlayer({ bottomInset = false }: { bottomInset?: boolean }) {
  const { visibleVoices, folders, scope, currentId, playing, loading, busy, play, pause, stop } = useVoiceLibrary();
  const insets = useSafeAreaInsets();
  const current = visibleVoices.find((voice) => voice.id === currentId);
  const folder = folders.find((item) => item.id === scope);
  if (!current) return null;
  const disabled = loading || busy;
  return <View testID="voice-mini-player" style={[styles.bar, bottomInset && { paddingBottom: Math.max(6, insets.bottom) }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="ボイス格納を開く"
      onPress={() => router.navigate("/(tabs)/voices")} style={styles.info}>
      <Ionicons name="musical-note" size={20} color="#c1e3ff" accessible={false} />
      <View style={styles.labels}>
        <AppText localize={false} numberOfLines={1} style={styles.name}>{current.name}</AppText>
        <AppText localize={!folder} numberOfLines={1} variant="muted" style={styles.hint}>{folder?.name ?? (scope === "all" ? "すべてのボイス" : "未分類")}</AppText>
        <AppText variant="muted" style={styles.hint}>{playing ? "再生中・タップして設定" : "一時停止中"}</AppText>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={playing ? "一時停止" : "再生"}
      accessibilityState={{ disabled }} disabled={disabled} testID="voice-mini-play-pause"
      onPress={() => playing ? pause() : play(current.id)} style={[styles.control, disabled && styles.disabled]}>
      <Ionicons name={playing ? "pause" : "play"} size={19} color="#fff" accessible={false} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="ボイスの再生を停止" testID="voice-mini-stop"
      onPress={stop} style={[styles.control, styles.stop]}>
      <Ionicons name="stop" size={15} color="#fff" accessible={false} />
      <AppText style={styles.stopLabel}>停止</AppText>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", flexShrink: 0, gap: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#102334", borderTopWidth: 1, borderTopColor: "#52728e" },
  info: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, minWidth: 0 },
  labels: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 10, lineHeight: 16 },
  control: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#234b6b" },
  stop: { flexDirection: "row", gap: 3, paddingHorizontal: 10, backgroundColor: "#733044" },
  stopLabel: { fontSize: 12 },
  disabled: { opacity: 0.45 },
});
