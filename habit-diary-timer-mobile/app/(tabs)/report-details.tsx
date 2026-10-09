import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PageTitle } from "@/components/PageTitle";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { isReportMetric, reportMetrics } from "@/features/reports/metrics";
import { reportPeriodLabel, validReportPeriod } from "@/features/reports/periods";
import { useReportRefresh } from "@/features/reports/useReportRefresh";
import { reportRepository, type ReportDetail } from "@/repositories/reportRepository";

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }

export default function ReportDetailsScreen() {
  const params = useLocalSearchParams<{ metric?: string | string[]; startDate?: string | string[]; endDate?: string | string[] }>();
  const metric = single(params.metric);
  const startDate = single(params.startDate);
  const endDate = single(params.endDate);
  const valid = isReportMetric(metric) && validReportPeriod({ startDate, endDate });
  const [data, setData] = useState<{ records: ReportDetail[]; total: number } | null>(null);
  const [error, setError] = useState(false);
  const [limit, setLimit] = useState(50);
  const reload = useCallback(() => {
    if (!isReportMetric(metric) || !validReportPeriod({ startDate, endDate })) return;
    try {
      setData({ records: reportRepository.details(metric, { startDate, endDate }), total: reportRepository.summarize(startDate, endDate)[metric] });
      setLimit(50);
      setError(false);
    } catch { setError(true); }
  }, [metric, startDate, endDate]);
  useReportRefresh(reload);
  const definition = reportMetrics.find((item) => item.key === metric);

  return <Screen>
    <PageTitle>集計の内訳</PageTitle>
    {!valid ? <Card><AppText>集計期間を確認してください。</AppText></Card> : <>
      <Card>
        <AppText variant="subtitle">{definition?.label}</AppText>
        <AppText localize={false}>{reportPeriodLabel({ startDate, endDate })}</AppText>
        <AppText variant="muted">{definition?.explanation}</AppText>
        {data && !error ? <AppText variant="title">{`${data.total.toLocaleString()}${definition?.unit ?? ""}`}</AppText> : null}
      </Card>
      {error ? <Card><AppText>記録を読み込めませんでした。</AppText><PrimaryButton title="再読み込み" onPress={reload} /></Card> : !data ? <AppText>読み込み中...</AppText> : data.records.length === 0 ? <Card><AppText>この期間に該当する記録はありません。</AppText></Card> : <>
        {data.records.slice(0, limit).map((record) => <Card key={record.id}>
          <AppText variant="muted" localize={false}>{record.date.replace("T", " ")}</AppText>
          <AppText variant="subtitle">{record.title}</AppText>
          <AppText style={styles.value}>{`${record.amount.toLocaleString()}${record.unit}`}</AppText>
          {record.body ? <AppText localize={false}>{record.body}</AppText> : null}
          {record.journalDate ? <PrimaryButton title="この日の該当日記を見る" tone="record" onPress={() => router.push({ pathname: "/(tabs)/records", params: { fromDate: record.journalDate, toDate: record.journalDate, tags: "射精記録" } })} /> : null}
        </Card>)}
        {limit < data.records.length ? <PrimaryButton title="さらに表示" tone="secondary" onPress={() => setLimit((current) => current + 50)} /> : null}
      </>}
    </>}
    <PrimaryButton title="報告へ戻る" tone="secondary" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/report")} />
    <PrimaryButton title="記録・交換メニューへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)/menu?section=record")} />
  </Screen>;
}

const styles = StyleSheet.create({
  value: { fontSize: 24, lineHeight: 32, color: "#a8ceff", fontWeight: "800" },
});
