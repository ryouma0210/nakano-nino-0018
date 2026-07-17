import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";
import { useTimerController } from "@/hooks/useTimerController";
import { timerRepository } from "@/repositories/timerRepository";
import type { TimerHistory, TimerPreset } from "@/types/models";
import { secondsToClock } from "@/utils/date";

export default function TimerScreen() {
  const [presets, setPresets] = useState<TimerPreset[]>([]);
  const [histories, setHistories] = useState<TimerHistory[]>([]);
  const timer = useTimerController();

  const load = useCallback(() => {
    setPresets(timerRepository.presets());
    setHistories(timerRepository.histories(20));
  }, []);

  useEffect(load, [load]);

  async function complete() {
    await timer.complete();
    load();
  }

  return (
    <Screen>
      <AppText variant="title">集中の部屋</AppText>

      <Card>
        <AppText variant="label">{timer.preset?.name ?? "プリセットを選択"}</AppText>
        <AppText style={styles.clock}>{secondsToClock(timer.remainingSeconds)}</AppText>
        <View style={styles.actions}>
          {timer.paused ? (
            <PrimaryButton title="再開" onPress={timer.resume} />
          ) : (
            <PrimaryButton title="一時停止" onPress={timer.pause} disabled={!timer.running} tone="secondary" />
          )}
          <PrimaryButton title="+5分" onPress={() => timer.addSeconds(300)} disabled={!timer.preset} tone="secondary" />
          <PrimaryButton title="完了" onPress={complete} disabled={!timer.preset} />
          <PrimaryButton title="リセット" onPress={timer.reset} disabled={!timer.preset} tone="danger" />
        </View>
      </Card>

      <Card>
        <AppText variant="subtitle">プリセット</AppText>
        {presets.map((preset) => (
          <View key={preset.id} style={styles.presetRow}>
            <View style={styles.grow}>
              <AppText style={styles.presetName}>{preset.name}</AppText>
              <AppText variant="muted">{Math.round(preset.duration_seconds / 60)}分 / {preset.timer_type}</AppText>
            </View>
            <PrimaryButton title="開始" onPress={() => timer.start(preset)} />
          </View>
        ))}
      </Card>

      <Card>
        <AppText variant="subtitle">履歴</AppText>
        {histories.length === 0 ? <AppText variant="muted">履歴はまだありません。</AppText> : null}
        {histories.map((history) => (
          <View key={history.id} style={styles.historyRow}>
            <View style={styles.grow}>
              <AppText style={styles.presetName}>{history.timer_name}</AppText>
              <AppText variant="muted">{history.started_at}</AppText>
            </View>
            <AppText style={styles.historyTime}>{secondsToClock(history.actual_duration_seconds)}</AppText>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  clock: {
    color: lightTheme.primaryDark,
    fontSize: 54,
    fontWeight: "900",
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: lightTheme.border,
    gap: 10,
    paddingVertical: 10,
  },
  grow: {
    flex: 1,
  },
  presetName: {
    fontWeight: "800",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: lightTheme.border,
    paddingVertical: 10,
  },
  historyTime: {
    color: lightTheme.primary,
    fontWeight: "900",
  },
});
