import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { DateField } from "@/components/DateField";
import { shiftReportDate, shiftReportMonth, validReportDate, validReportMonth } from "./periods";

export function PeriodSelector({ mode, value, maximum, onChange }: {
  mode: "day" | "month"; value: string; maximum: string; onChange: (value: string) => void;
}) {
  const shift = mode === "day" ? shiftReportDate : shiftReportMonth;
  const previous = shift(value, -1);
  const next = shift(value, 1);
  const valid = mode === "day" ? validReportDate : validReportMonth;
  return (
    <Card>
      <AppText variant="subtitle">{mode === "day" ? "活動日を選択" : "集計月を選択"}</AppText>
      <AppText variant="muted">{mode === "day" ? "活動日の選択は、ログインボーナスの受取日に影響しません。" : "今月は本日までと前月の同日まで、過去の月は月全体を比較します。"}</AppText>
      <View style={styles.row}>
        <View style={styles.button}><PrimaryButton title={mode === "day" ? "前日" : "前月"} tone="secondary" disabled={!valid(previous)} onPress={() => onChange(previous)} /></View>
        <View style={styles.button}><PrimaryButton title={mode === "day" ? "翌日" : "翌月"} tone="secondary" disabled={next > maximum} onPress={() => onChange(next)} /></View>
        <View style={styles.button}><PrimaryButton title={mode === "day" ? "本日" : "今月"} tone="record" disabled={value === maximum} onPress={() => onChange(maximum)} /></View>
      </View>
      <DateField testID="report-period-picker" mode={mode} label={mode === "day" ? "活動日" : "集計月"}
        minimum={mode === "day" ? "1900-01-01" : "1900-01"} maximum={maximum} value={value} onChange={onChange} />
    </Card>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { flex: 1, minWidth: 74 } });
