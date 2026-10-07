import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { LoginBonusCalendar } from "@/components/LoginBonusCalendar";
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
  type ComparedActivityReport,
} from "@/repositories/reportRepository";
import { PeriodSelector } from "@/features/reports/PeriodSelector";
import { ReportComparison } from "@/features/reports/ReportComparison";
import { dailyComparison } from "@/features/reports/periods";
import { useReportRefresh } from "@/features/reports/useReportRefresh";
import { useAppModal } from "@/components/AppModalProvider";
import { toDateKey } from "@/utils/date";

type TodayData = {
  bonus: LoginBonusStatus;
  stamps: LoginBonusStamp[];
  report: ActivityReport;
  activity: ComparedActivityReport;
};

function loadTodayData(selectedDate: string | null): TodayData {
  const bonus = loginBonusRepository.status();
  const month = bonus.today.slice(0, 7);

  return {
    bonus,
    stamps: loginBonusRepository.monthlyStamps(month),
    report: reportRepository.today(),
    activity: reportRepository.compare(dailyComparison(selectedDate ?? bonus.today)),
  };
}

export default function TodayScreen() {
  const { showError } = useAppModal();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState(false);
  const reload = useCallback(() => {
    try { setData(loadTodayData(selectedDate)); setError(false); }
    catch { setError(true); }
  }, [selectedDate]);
  useReportRefresh(reload);

  const claimBonus = useCallback(() => {
    try {
      // Historical activity selection never changes the claim date.
      loginBonusRepository.claim();
      setData(loadTodayData(selectedDate));
    } catch (claimError) { showError("ログインボーナスを受け取れません", claimError); }
  }, [selectedDate, showError]);

  if (!data || error) return <Screen>
    <AppText variant="title">本日の記録</AppText>
    <AppText>{error ? "報告を読み込めませんでした。" : "読み込み中..."}</AppText>
    {error ? <PrimaryButton title="再読み込み" onPress={reload} /> : null}
    <PrimaryButton title="記録・交換メニューへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)/menu?section=record")} />
  </Screen>;

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">本日の記録</AppText>
        <View style={styles.rule} />
      </View>

      <Card style={styles.bonusCard}>
        <AppText variant="subtitle">ログインボーナス</AppText>
        <AppText variant="label" localize={false}>{data.bonus.today}</AppText>
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
        <AppText style={styles.claimStatus}>
          {data.bonus.alreadyClaimed ? "本日は受取済み" : "本日は未受取"}
        </AppText>
        <LoginBonusCalendar stamps={data.stamps} today={data.bonus.today} />
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

      <PeriodSelector mode="day" value={selectedDate ?? data.bonus.today} maximum={data.bonus.today} onChange={(value) => setSelectedDate(value === toDateKey() ? null : value)} />
      <ReportComparison title={selectedDate ? "選択日の報告" : "本日の報告"} comparison={data.activity} />
      <PrimaryButton title="週間・月間の報告を見る" tone="record" onPress={() => router.push("/(tabs)/report")} />

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
  claimStatus: {
    color: "#ff5fb3",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
});
