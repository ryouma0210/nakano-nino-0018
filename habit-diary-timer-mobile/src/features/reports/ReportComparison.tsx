import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { LocalizedPressable as Pressable } from "@/components/LocalizedPressable";
import type { ComparedActivityReport } from "@/repositories/reportRepository";
import { reportMetrics } from "./metrics";
import { reportPeriodLabel } from "./periods";

export function ReportComparison({ title, comparison }: { title: string; comparison: ComparedActivityReport }) {
  return (
    <Card style={styles.card}>
      <AppText variant="subtitle">{title}</AppText>
      <AppText variant="label">今回の期間</AppText>
      <AppText localize={false}>{reportPeriodLabel(comparison.periods.current)}</AppText>
      <AppText variant="muted">比較する前の期間</AppText>
      <AppText localize={false} variant="muted">{reportPeriodLabel(comparison.periods.previous)}</AppText>
      <AppText variant="muted">数値や棒を押すと、集計に使った記録を確認できます。</AppText>
      <View style={styles.grid}>
        {reportMetrics.map((metric) => {
          const current = comparison.current[metric.key];
          const previous = comparison.previous[metric.key];
          const maximum = Math.max(current, previous, 1);
          const difference = current - previous;
          return (
            <View style={styles.metric} key={metric.key}>
              <AppText variant="label">{metric.label}</AppText>
              {(["current", "previous"] as const).map((period) => {
                const value = comparison[period][metric.key];
                return (
                  <Pressable
                    key={period}
                    accessibilityRole="button"
                    accessibilityLabel={period === "current" ? "今回の記録を確認" : "前の期間の記録を確認"}
                    onPress={() => router.push({ pathname: "/(tabs)/report-details", params: { metric: metric.key, ...comparison.periods[period] } })}
                    style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
                  >
                    <View style={styles.row}>
                      <AppText variant="muted">{period === "current" ? "今回" : "前の期間"}</AppText>
                      <AppText style={styles.value}>{`${value.toLocaleString()}${metric.unit}`}</AppText>
                    </View>
                    <View style={styles.track}><View style={[styles.bar, period === "previous" && styles.previousBar, { width: `${value / maximum * 100}%` }]} /></View>
                  </Pressable>
                );
              })}
              <View style={styles.row}>
                <AppText variant="muted">前の期間との差</AppText>
                <AppText>{`${difference > 0 ? "+" : ""}${difference.toLocaleString()}${metric.unit}`}</AppText>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: "#7db7ff", gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexGrow: 1, flexBasis: 240, minWidth: 0, gap: 5, padding: 12, borderWidth: 1, borderColor: "#444", backgroundColor: "#101722" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  value: { color: "#a8ceff", fontSize: 21, lineHeight: 28, fontWeight: "800" },
  barButton: { minHeight: 58, gap: 6, paddingVertical: 6, borderRadius: 4 },
  track: { height: 10, backgroundColor: "#29313d", borderRadius: 3, overflow: "hidden" },
  bar: { height: "100%", backgroundColor: "#7db7ff", borderRadius: 3 },
  previousBar: { backgroundColor: "#aab5c6" },
  pressed: { backgroundColor: "#253954" },
});
