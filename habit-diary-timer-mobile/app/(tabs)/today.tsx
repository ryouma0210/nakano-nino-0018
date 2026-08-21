import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import {
  loginBonusRepository,
  type LoginBonusStamp,
  type LoginBonusStatus,
} from "@/repositories/loginBonusRepository";
import {
  reportRepository,
  type ActivityReport,
} from "@/repositories/reportRepository";

type TodayData = {
  bonus: LoginBonusStatus;
  monthLabel: string;
  stamps: LoginBonusStamp[];
  report: ActivityReport;
};

function loadTodayData(): TodayData {
  const bonus = loginBonusRepository.status();
  const month = bonus.today.slice(0, 7);

  return {
    bonus,
    monthLabel: `${month.replace("-", "年")}月`,
    stamps: loginBonusRepository.monthlyStamps(month),
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
        <AppText variant="title">本日の記録</AppText>
        <View style={styles.rule} />
      </View>

      <Card style={styles.bonusCard}>
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
          1日目:1pt、2〜6日目:10pt、7日目以降:50pt。
        </AppText>
        <View style={styles.todayPointRow}>
          <AppText variant="muted">本日の獲得Pt</AppText>
          <AppText style={styles.todayPoints}>
            {data.report.earnedPoints.toLocaleString()}pt
          </AppText>
        </View>
        <View style={styles.monthHeader}>
          <AppText variant="subtitle">{data.monthLabel}のスタンプ</AppText>
          <AppText style={styles.claimStatus}>
            {data.bonus.alreadyClaimed ? "本日は受取済み" : "本日は未受取"}
          </AppText>
        </View>
        <ScrollView
          style={styles.stampScroll}
          contentContainerStyle={styles.stampGrid}
          nestedScrollEnabled
        >
          {data.stamps.map((stamp) => (
            <StampCell
              key={stamp.date}
              stamp={stamp}
              isToday={stamp.date === data.bonus.today}
            />
          ))}
        </ScrollView>
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

function StampCell({ stamp, isToday }: { stamp: LoginBonusStamp; isToday: boolean }) {
  return (
    <View
      style={[
        styles.stampCell,
        stamp.claimed && styles.stampCellClaimed,
        isToday && styles.stampCellToday,
      ]}
    >
      <AppText style={styles.stampDay}>{stamp.day}</AppText>
      <AppText style={[styles.stampMark, stamp.claimed && styles.stampMarkClaimed]}>
        {stamp.claimed ? "♡" : "—"}
      </AppText>
      {stamp.claimed ? <AppText style={styles.stampPoint}>{stamp.points}pt</AppText> : null}
    </View>
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
  todayPointRow: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#121212",
    gap: 4,
  },
  todayPoints: {
    color: "#f6d15f",
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "900",
  },
  monthHeader: {
    gap: 6,
    marginTop: 4,
  },
  claimStatus: {
    color: "#ff5fb3",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  stampScroll: { maxHeight: 300 },
  stampGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingVertical: 2,
  },
  stampCell: {
    width: "13.2%",
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 6,
    backgroundColor: "#111",
    paddingVertical: 4,
  },
  stampCellClaimed: {
    borderColor: "#ff5fb3",
    backgroundColor: "#2a071a",
  },
  stampCellToday: {
    borderColor: "#f2c94c",
  },
  stampDay: {
    color: "#fff",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  stampMark: {
    color: "#555",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  stampMarkClaimed: { color: "#ff5fb3" },
  stampPoint: {
    color: "#aaa",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
  },
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
