import { StyleSheet, View } from "react-native";
import { useAppAudio } from "@/audio/AudioProvider";
import { loopAudioOptions } from "@/audio/loopAudioLabels";
import { useLoopSleepRemaining } from "@/audio/useLoopSleepRemaining";
import { lightTheme } from "@/constants/theme";
import { translateText } from "@/i18n";
import { AppText } from "./AppText";
import { PrimaryButton } from "./PrimaryButton";

/** Inline controls: the host owns scrolling and dismissal. */
export function LoopAudioControls({ canStart }: { canStart: boolean }) {
  const { loopAudioNames, playLoopAudio, stopLoopAudio, loopSleepDeadline, setLoopSleepMinutes, settings } = useAppAudio();
  const remaining = useLoopSleepRemaining(loopSleepDeadline);
  const hasAudio = loopAudioNames.length > 0;

  return <View testID="loop-audio-controls" style={styles.content}>
    <AppText variant="subtitle" accessibilityRole="header">再生する音声</AppText>
    <AppText variant="muted">複数の音声を同時に再生できます。</AppText>
    {!hasAudio ? <AppText variant="muted">再生中の音声はありません。</AppText> : null}
    {!canStart ? <AppText variant="muted">ループ音声　※未開放</AppText> : null}
    {!settings?.soundEnabled ? <AppText style={styles.warning}>効果音がOFFです。設定で効果音をONにしてください。</AppText> : null}
    {loopAudioOptions.map(({ key, title }) => {
      const playing = loopAudioNames.includes(key);
      return <View key={key} testID={`loop-audio-track-${key}`} style={styles.track}>
        <View style={styles.trackName}>
          <AppText>{title}</AppText>
          {playing ? <AppText variant="muted">再生中</AppText> : null}
        </View>
        <PrimaryButton
          title={playing ? "停止" : "再生"}
          tone={playing ? "danger" : "secondary"}
          disabled={!playing && (!canStart || !settings?.soundEnabled)}
          onPress={() => { if (playing) stopLoopAudio(key); else if (canStart && settings?.soundEnabled) playLoopAudio(key); }}
        />
      </View>;
    })}
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
  warning: { color: lightTheme.danger, fontWeight: "900" },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { flexGrow: 1, flexBasis: "42%" },
});
