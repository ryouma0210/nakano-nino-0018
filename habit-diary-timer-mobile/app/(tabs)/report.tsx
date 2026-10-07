import { useCallback, useState } from "react";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { roomMessages } from "@/constants/messages";
import {
  reportRepository,
  type ActivityReport,
  type ComparedActivityReport,
} from "@/repositories/reportRepository";
import { PeriodSelector } from "@/features/reports/PeriodSelector";
import { ReportComparison } from "@/features/reports/ReportComparison";
import { monthlyComparison, weeklyComparison } from "@/features/reports/periods";
import { useReportRefresh } from "@/features/reports/useReportRefresh";
import { toDateKey } from "@/utils/date";

type Reports = {
  week: ComparedActivityReport;
  month: ComparedActivityReport;
};

function loadReports(month: string): Reports {
  return {
    week: reportRepository.compare(weeklyComparison()),
    month: reportRepository.compare(monthlyComparison(month)),
  };
}

function evaluation(report: ActivityReport, period: "week" | "month") {
  const score =
    report.trainingCount * 3 +
    report.managementDays * 2 +
    report.orderCount +
    Math.min(5, Math.floor(report.punishmentMinutes / 10));
  const active =
    report.trainingCount + report.managementDays + report.orderCount;
  if (active === 0) {
    return "この期間は記録がないわ。次の報告では、私を退屈させないでね。";
  }
  if (score >= (period === "month" ? 30 : 12)) {
    return "よく続けたわね♡記録にも成果がしっかり表れているわ。この調子で積み重ねなさい。";
  }
  if (report.managementDays > 0 && report.trainingCount > 0) {
    return "調教も管理もこなしているのね。悪くないわ。次は回数をもう少し増やしなさい♡";
  }
  return "報告は確認したわ。まだ物足りないけれど、続けたことだけは評価してあげる。";
}

export default function ReportScreen() {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const month = selectedMonth ?? toDateKey().slice(0, 7);
  const [reports, setReports] = useState<Reports | null>(null);
  const [error, setError] = useState(false);
  const reload = useCallback(() => {
    try { setReports(loadReports(selectedMonth ?? toDateKey().slice(0, 7))); setError(false); }
    catch { setError(true); }
  }, [selectedMonth]);
  useReportRefresh(reload);
  return (
    <Screen>
      <PageTitle>週間報告部屋</PageTitle>
      <RoomConversation
        characterSource={require("../../assets/characters/diary-nino.png")}
        roomName="週間報告部屋"
        lines={[
          ...(roomMessages.report.lines ?? []),
          ...(reports ? [{ text: evaluation(reports.week.current, "week"), withName: true }] : []),
        ]}
        contractLines={roomMessages.report.contractLines}
      />

      <PeriodSelector mode="month" value={month} maximum={toDateKey().slice(0, 7)} onChange={(value) => setSelectedMonth(value === toDateKey().slice(0, 7) ? null : value)} />
      {error ? <Card><AppText>報告を読み込めませんでした。</AppText><PrimaryButton title="再読み込み" onPress={reload} /></Card> : reports ? <>
        <ReportComparison title="直近7日間" comparison={reports.week} />
        <ReportComparison title="選択月の報告" comparison={reports.month} />
        <Card><AppText>{evaluation(reports.month.current, "month")}</AppText></Card>
      </> : <AppText variant="muted">読み込み中...</AppText>}

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

