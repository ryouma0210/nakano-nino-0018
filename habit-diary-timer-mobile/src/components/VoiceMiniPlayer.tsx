import { StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVoiceLibrary } from "@/audio/VoiceLibraryProvider";
import { AppText } from "./AppText";
import { LocalizedPressable as Pressable } from "./LocalizedPressable";

export function VoiceMiniPlayer({ bottomInset = false }: { bottomInset?: boolean }) {
  const { visibleVoices, folders, scope, currentId, playing, loading, busy, play, pause, stop, previous, next } = useVoiceLibrary();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 440;
  const current = visibleVoices.find((voice) => voice.id === currentId);
  const folder = folders.find((item) => item.id === scope);
  if (!current) return null;
  const disabled = loading || busy;
  const stepDisabled = disabled || visibleVoices.length < 2;
  return <View testID="voice-mini-player" style={[styles.bar, compact && styles.compactBar, bottomInset && { paddingBottom: Math.max(6, insets.bottom) }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="ボイス格納を開く"
      onPress={() => router.navigate("/(tabs)/voices")} style={[styles.info, compact && styles.compactInfo]}>
      <Ionicons name="musical-note" size={20} color="#c1e3ff" accessible={false} />
      <View style={styles.labels}>
        <AppText localize={false} numberOfLines={1} style={styles.name}>{current.name}</AppText>
        <AppText localize={!folder} numberOfLines={1} variant="muted" style={styles.hint}>{folder?.name ?? (scope === "all" ? "すべてのボイス" : "未分類")}</AppText>
        <AppText variant="muted" numberOfLines={1} style={styles.hint}>{playing ? "再生中・タップして設定" : "一時停止中"}</AppText>
      </View>
    </Pressable>
    <View style={[styles.controls, compact && styles.compactControls]}>
      <Pressable accessibilityRole="button" accessibilityLabel="前のボイス" testID="voice-mini-previous"
        accessibilityState={{ disabled: stepDisabled }} disabled={stepDisabled} onPress={previous}
        style={[styles.control, compact && styles.compactControl, stepDisabled && styles.disabled]}>
        <Ionicons name="play-skip-back" size={19} color="#fff" accessible={false} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? "一時停止" : "再生"}
        accessibilityState={{ disabled }} disabled={disabled} testID="voice-mini-play-pause"
        onPress={() => playing ? pause() : play(current.id)} style={[styles.control, compact && styles.compactControl, disabled && styles.disabled]}>
        <Ionicons name={playing ? "pause" : "play"} size={19} color="#fff" accessible={false} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="次のボイス" testID="voice-mini-next"
        accessibilityState={{ disabled: stepDisabled }} disabled={stepDisabled} onPress={next}
        style={[styles.control, compact && styles.compactControl, stepDisabled && styles.disabled]}>
        <Ionicons name="play-skip-forward" size={19} color="#fff" accessible={false} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="ボイスの再生を停止" testID="voice-mini-stop"
        onPress={stop} style={[styles.control, styles.stop, compact && styles.compactControl]}>
        <Ionicons name="stop" size={15} color="#fff" accessible={false} />
        <AppText style={styles.stopLabel}>停止</AppText>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", flexShrink: 0, gap: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#102334", borderTopWidth: 1, borderTopColor: "#52728e" },
  compactBar: { flexDirection: "column", alignItems: "stretch" },
  info: { flexGrow: 1, flexShrink: 1, flexBasis: 0, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, minWidth: 0 },
  compactInfo: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  labels: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 10, lineHeight: 16 },
  controls: { flexDirection: "row", alignItems: "center", flexShrink: 0, gap: 6 },
  compactControls: { width: "100%" },
  control: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#234b6b" },
  compactControl: { flex: 1 },
  stop: { flexDirection: "row", gap: 3, paddingHorizontal: 10, backgroundColor: "#733044" },
  stopLabel: { fontSize: 12 },
  disabled: { opacity: 0.45 },
});
