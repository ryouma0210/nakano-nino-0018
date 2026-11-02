import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/Card";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { usePointMilestones } from "./PointMilestoneProvider";

export function PointMilestoneCollection({ visibleIds, renderBadge }: {
  visibleIds?: ReadonlySet<string>;
  renderBadge?: (id: string) => ReactNode;
} = {}) {
  const { snapshot, error, refresh } = usePointMilestones();
  return <Card style={styles.card}>
    <AppText variant="subtitle" accessibilityRole="header">ポイント達成メッセージ</AppText>
    <AppText variant="muted">累計獲得Ptで解放されます。交換でPtを使っても、解放したメッセージは残ります。</AppText>
    {error ? <>
      <AppText accessibilityRole="alert">ポイント達成イベントを読み込めませんでした。</AppText>
      <PrimaryButton title="再読み込み" tone="secondary" onPress={refresh} />
    </> : snapshot ? <>
      <AppText testID="point-milestone-earned">{`累計獲得：${snapshot.earned.toLocaleString()}Pt`}</AppText>
      {snapshot.next ? <AppText testID="point-milestone-next">{`次の解放まであと${Math.max(0, snapshot.next.points - snapshot.earned).toLocaleString()}Pt`}</AppText>
        : <AppText>すべてのポイント達成メッセージを解放しました！</AppText>}
      {snapshot.unlocked.length === 0 ? <AppText variant="muted">最初のメッセージは累計100Ptで解放されます。</AppText> : null}
      {snapshot.unlocked.filter((item) => !visibleIds || visibleIds.has(item.id)).map((item) => <View key={item.id} style={styles.row} testID={`point-milestone-card-${item.id}`}>
        {renderBadge?.(item.id)}
        <AppText variant="label">{item.title}</AppText>
        <AppText variant="muted">{`累計${item.points.toLocaleString()}Pt達成`}</AppText>
        <AppText>{item.message}</AppText>
      </View>)}
    </> : <AppText>読み込み中...</AppText>}
  </Card>;
}

const styles = StyleSheet.create({
  card: { borderColor: "#f2c94c" },
  row: { paddingTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#51472e" },
});
