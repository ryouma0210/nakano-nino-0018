import { StyleSheet, View } from "react-native";
import { useAppAudio } from "@/audio/AudioProvider";
import { loopAudioOptions } from "@/audio/loopAudioLabels";
import { useLoopSleepRemaining } from "@/audio/useLoopSleepRemaining";
import { translateText } from "@/i18n";
import { AppText } from "./AppText";
import { PrimaryButton } from "./PrimaryButton";

/** Inline controls: the host owns scrolling and dismissal. */
export function LoopAudioControls() {
  const { loopAudioNames, stopLoopAudio, loopSleepDeadline, setLoopSleepMinutes, settings } = useAppAudio();
  const remaining = useLoopSleepRemaining(loopSleepDeadline);
  const playingAudios = loopAudioOptions.filter(({ key }) => loopAudioNames.includes(key));
  const hasAudio = playingAudios.length > 0;

  return <View testID="loop-audio-controls" style={styles.content}>
    <AppText variant="subtitle" accessibilityRole="header">再生中の音声</AppText>
    {hasAudio ? playingAudios.map(({ key, title }) => <View key={key} testID={`loop-audio-track-${key}`} style={styles.track}>
      <AppText style={styles.trackName}>{title}</AppText>
      <PrimaryButton title="停止" tone="secondary" onPress={() => stopLoopAudio(key)} />
    </View>) : <AppText variant="muted">再生中の音声はありません。</AppText>}
    <AppText variant="subtitle">停止タイマー</AppText>
    {remaining ? <AppText localize={false}>{`${translateText("停止まで", settings?.language ?? "ja")} ${remaining}`}</AppText>
      : <AppText variant="muted">タイマー未設定</AppText>}
    <View style={styles.presets}>
      {[5, 15, 30, 60].map((minutes) => <View key={minutes} testID={`loop-audio-timer-${minutes}`} style={styles.preset}>
        <PrimaryButton title={`${minutes}分`} tone="secondary" disabled={!hasAudio} onPress={() => setLoopSleepMinutes(minutes)} />
      </View>)}
    </View>
    <View testID="loop-audio-timer-clear">
      <PrimaryButton title="タイマーを解除" tone="secondary" disabled={loopSleepDeadline === null} onPress={() => setLoopSleepMinutes(null)} />
    </View>
    <View testID="loop-audio-stop-all">
      <PrimaryButton title="すべて停止" tone="danger" disabled={!hasAudio} onPress={() => stopLoopAudio()} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  track: { flexDirection: "row", alignItems: "center", gap: 12 },
  trackName: { flex: 1 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { flexGrow: 1, flexBasis: "42%" },
});
