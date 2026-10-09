import type { ActivityReport } from "@/repositories/reportRepository";

export type ReportMetric = keyof ActivityReport;
export const reportMetrics: { key: ReportMetric; label: string; unit: string; explanation: string }[] = [
  { key: "trainingCount", label: "調教回数", unit: "回", explanation: "対象期間の「射精記録」タグを含む日記を集計します。" },
  { key: "managementDays", label: "管理日数", unit: "日", explanation: "完了した管理指示がある日数です。同じ日に複数あっても1日として集計します。" },
  { key: "earnedPoints", label: "獲得ポイント", unit: "pt", explanation: "対象期間のプラスのポイント取引を集計します。消費・減少は含みません。" },
  { key: "orderCount", label: "命令完了", unit: "回", explanation: "本日の命令の完了に対応するポイント付与記録を集計します。" },
  { key: "punishmentMinutes", label: "お仕置き", unit: "分", explanation: "正常終了したタイマーの秒数を合計し、1分未満を切り捨てます。途中終了は含みません。" },
];

export function isReportMetric(value: string): value is ReportMetric {
  return reportMetrics.some((metric) => metric.key === value);
}
