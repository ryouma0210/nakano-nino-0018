import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import {
  loginBonusRepository,
  type LoginBonusStatus,
} from "@/repositories/loginBonusRepository";
import {
  reportRepository,
  type ActivityReport,
} from "@/repositories/reportRepository";

type TodayData = {
  bonus: LoginBonusStatus;
  report: ActivityReport;
};

function loadTodayData(): TodayData {
  return {
    bonus: loginBonusRepository.status(),
    report: reportRepository.today(),
  };
}

export default function TodayScreen() {
  const [data, setData] = useState(loadTodayData);
  const reload = useCallback(() => setData(loadTodayData()), []);

  useFocusEffect(reload);

  const claimBonus = useCallback(() => {
    loginBonusRepository.claim();
    setData(loadTodayData());
  }, []);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText style={styles.kicker}>TODAY RECORD</AppText>
        <AppText variant="title">本日の記録</AppText>
        <View style={styles.rule} />
      </View>

      <Card style={styles.bonusCard}>
        <AppText style={styles.cardKicker}>LOGIN BONUS</AppText>
        <AppText variant="subtitle">ログインボーナス</AppText>
        <View style={styles.bonusRow}>
          <View>
            <AppText variant="muted">連続ログイン</AppText>
            <AppText style={styles.streak}>{data.bonus.claimStreak}日目</AppText>
          </View>
          <View style={styles.pointBox}>
            <AppText variant="muted">本日の獲得</AppText>
            <AppText style={styles.points}>{data.bonus.claimPoints}pt</AppText>
          </View>
        </View>
        <AppText variant="muted">
          1日目は1pt、2〜6日目は10pt、7日目は50pt。1日1回だけ受け取れます。
        </AppText>
        <PrimaryButton
          title={
            data.bonus.alreadyClaimed
              ? "本日は受取済み"
              : `ログインボーナスを受け取る（${data.bonus.claimPoints}pt）`
          }
          tone="record"
          disabled={data.bonus.alreadyClaimed}
          onPress={claimBonus}
        />
      </Card>

      <Card style={styles.reportCard}>
        <AppText style={styles.cardKicker}>TODAY SUMMARY</AppText>
        <AppText variant="subtitle">本日の報告</AppText>
        <View style={styles.grid}>
          <Metric label="調教回数" value={`${data.report.trainingCount}回`} />
          <Metric label="管理日数" value={`${data.report.managementDays}日`} />
          <Metric label="獲得ポイント" value={`${data.report.earnedPoints}pt`} />
          <Metric label="命令完了" value={`${data.report.orderCount}回`} />
          <Metric label="お仕置き" value={`${data.report.punishmentMinutes}分`} />
        </View>
      </Card>

      <PrimaryButton
        title="記録・交換メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu?section=record")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText variant="muted">{label}</AppText>
      <AppText style={styles.value}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 12 },
  kicker: {
    color: "#7db7ff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
  },
  rule: { height: 1, backgroundColor: "#fff" },
  bonusCard: { borderColor: "#f6d15f" },
  reportCard: { borderColor: "#7db7ff" },
  cardKicker: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
  },
  bonusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  streak: { color: "#f6d15f", fontSize: 42, lineHeight: 52, fontWeight: "900" },
  pointBox: {
    minWidth: 120,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f6d15f",
    alignItems: "center",
  },
  points: { color: "#f6d15f", fontSize: 28, lineHeight: 36, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: {
    minWidth: "46%",
    flexGrow: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: "#444",
    backgroundColor: "#101722",
  },
  value: { color: "#7db7ff", fontSize: 24, lineHeight: 32, fontWeight: "900" },
});
