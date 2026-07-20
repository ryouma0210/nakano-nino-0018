import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { roomMessages } from "@/constants/messages";
import {
  reportRepository,
  type ActivityReport,
} from "@/repositories/reportRepository";

type Reports = {
  today: ActivityReport;
  week: ActivityReport;
  month: ActivityReport;
};

function loadReports(): Reports {
  return {
    today: reportRepository.today(),
    week: reportRepository.recentSevenDays(),
    month: reportRepository.currentMonth(),
  };
}

function evaluation(
  report: ActivityReport,
  period: "today" | "week" | "month",
) {
  const score =
    report.trainingCount * 3 +
    report.managementDays * 2 +
    report.orderCount +
    Math.min(5, Math.floor(report.punishmentMinutes / 10));
  const active =
    report.trainingCount + report.managementDays + report.orderCount;
  if (active === 0) {
    return period === "today"
      ? "今日はまだ何も報告できないようね。最初の命令から始めなさい。"
      : "この期間は記録がないわ。次の報告では、私を退屈させないでね。";
  }
  if (score >= (period === "month" ? 30 : period === "week" ? 12 : 5)) {
    return "よく続けたわね♡記録にも成果がしっかり表れているわ。この調子で積み重ねなさい。";
  }
  if (report.managementDays > 0 && report.trainingCount > 0) {
    return "調教も管理もこなしているのね。悪くないわ。次は回数をもう少し増やしなさい♡";
  }
  return "報告は確認したわ。まだ物足りないけれど、続けたことだけは評価してあげる。";
}

export default function ReportScreen() {
  const [reports, setReports] = useState(loadReports);
  const reload = useCallback(() => setReports(loadReports()), []);
  useFocusEffect(reload);

  const monthLabel = `${new Date().getFullYear()}年${new Date().getMonth() + 1}月`;
  return (
    <Screen>
      <AppText variant="title">週間報告部屋</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/diary-nino.png")}
        roomName="週間報告部屋"
        lines={[
          ...(roomMessages.report.lines ?? []),
          { text: evaluation(reports.week, "week"), withName: true },
        ]}
        contractLines={roomMessages.report.contractLines}
      />

      <ReportCard
        title="本日の報告"
        report={reports.today}
        evaluation={evaluation(reports.today, "today")}
      />
      <ReportCard
        title="直近7日間"
        report={reports.week}
        evaluation={evaluation(reports.week, "week")}
      />
      <ReportCard
        title={monthLabel}
        report={reports.month}
        evaluation={evaluation(reports.month, "month")}
      />

      <PrimaryButton
        title="記録・管理メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

function ReportCard({
  title,
  report,
  evaluation: message,
}: {
  title: string;
  report: ActivityReport;
  evaluation: string;
}) {
  return (
    <Card style={styles.reportCard}>
      <AppText variant="subtitle">{title}</AppText>
      <View style={styles.grid}>
        <Metric label="調教回数" value={`${report.trainingCount}回`} />
        <Metric label="管理日数" value={`${report.managementDays}日`} />
        <Metric label="獲得ポイント" value={`${report.earnedPoints}pt`} />
        <Metric label="命令完了" value={`${report.orderCount}回`} />
        <Metric label="お仕置き" value={`${report.punishmentMinutes}分`} />
      </View>
      <View style={styles.evaluation}>
        <AppText style={styles.name}>ニノ</AppText>
        <AppText>{message}</AppText>
      </View>
    </Card>
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
  reportCard: { borderColor: "#7db7ff" },
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
  evaluation: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#555",
    paddingTop: 12,
  },
  name: { color: "#e31e2f", fontWeight: "900" },
});
