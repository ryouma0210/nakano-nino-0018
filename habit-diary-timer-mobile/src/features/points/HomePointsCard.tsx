import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { pointRepository, rewardRepository } from "@/repositories/rewardRepository";
import { usePointMilestones } from "./PointMilestoneProvider";

export function HomePointsCard() {
  const { snapshot, error, refresh } = usePointMilestones();
  const [balance, setBalance] = useState<ReturnType<typeof rewardRepository.balance> | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const reloadBalance = useCallback(() => {
    try { setBalance(rewardRepository.balance()); setBalanceError(false); }
    catch { setBalanceError(true); }
  }, []);
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(reloadBalance, 0); };
    schedule();
    const unsubscribe = pointRepository.subscribe(schedule);
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [reloadBalance]));

  const target = snapshot?.next?.points;
  const ratio = snapshot && target ? Math.min(1, Math.max(0, snapshot.earned / target)) : 1;
  return <Card>
    <AppText variant="subtitle">ポイントと次の目標</AppText>
    {error || balanceError ? <>
      <AppText accessibilityRole="alert">ポイントを読み込めませんでした。</AppText>
      <PrimaryButton title="再読み込み" tone="secondary" onPress={() => { reloadBalance(); refresh(); }} />
    </> : balance && snapshot ? <>
      <View style={styles.totals}>
        <View style={styles.total}><AppText variant="muted">所持Pt</AppText><AppText variant="subtitle" localize={false} testID="home-points-available">{balance.available.toLocaleString()} Pt</AppText></View>
        <View style={styles.total}><AppText variant="muted">累計獲得Pt</AppText><AppText variant="subtitle" localize={false} testID="home-points-earned">{balance.earned.toLocaleString()} Pt</AppText></View>
      </View>
      {target ? <>
        <AppText testID="home-points-next">{`次の解放まであと${Math.max(0, target - snapshot.earned).toLocaleString()}Pt`}</AppText>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: target, now: Math.min(snapshot.earned, target) }}
          aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(snapshot.earned, target)}
          style={styles.track} testID="home-points-progress">
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
        </View>
        <AppText variant="muted" localize={false}>{snapshot.earned.toLocaleString()} / {target.toLocaleString()} Pt</AppText>
      </> : <AppText>すべてのポイント達成メッセージを解放しました！</AppText>}
      <PrimaryButton title="コレクションへ" tone="collection" onPress={() => router.push("/(tabs)/collection")} testID="home-points-collection" />
    </> : <AppText>読み込み中...</AppText>}
  </Card>;
}

const styles = StyleSheet.create({
  totals: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  total: { flex: 1, minWidth: 110, gap: 4 },
  track: { height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: "#38332b" },
  fill: { height: "100%", borderRadius: 5, backgroundColor: "#f2c94c" },
});
