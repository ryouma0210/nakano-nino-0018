import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { useAppAudio } from "@/audio/AudioProvider";
import { translateText } from "@/i18n";
import { isDateKey } from "@nino/shared/date";
import type { RecordFilters } from "./filters";

type Props = {
  filters: RecordFilters;
  onChange: (patch: Partial<RecordFilters>) => void;
  types?: readonly { value: string; label: string }[];
  typeLabel?: string;
  supportsTags?: boolean;
  ready: boolean;
  disabled?: boolean;
  error?: string;
  storageError?: string;
};

export function RecordFilterFields({ filters, onChange, types = [], typeLabel = "種類", supportsTags = false,
  ready, disabled = false, error, storageError }: Props) {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const locked = disabled || !ready;
  return <Card>
    <AppText variant="subtitle">絞り込み条件</AppText>
    <AppText variant="muted">条件を組み合わせて検索できます。日付を「指定なし」にすると期間を制限しません。</AppText>
    <View style={styles.dates}>
      <View style={styles.date}><DateField label="開始日"
        testID="record-filter-from" value={filters.fromDate} disabled={locked} allowClear
        maximum={isDateKey(filters.toDate) ? filters.toDate : undefined}
        onChange={(fromDate) => onChange({ fromDate })} /></View>
      <View style={styles.date}><DateField label="終了日"
        testID="record-filter-to" value={filters.toDate} disabled={locked} allowClear
        minimum={isDateKey(filters.fromDate) ? filters.fromDate : undefined}
        onChange={(toDate) => onChange({ toDate })} /></View>
    </View>
    {types.length > 0 ? <>
      <AppText variant="label">{typeLabel}</AppText>
      <View style={styles.options}>{[{ value: "", label: "すべて" }, ...types].map((type) => <Pressable
        key={type.value} testID={`record-filter-type-${type.value || "all"}`} disabled={locked}
        accessibilityRole="button" accessibilityLabel={translateText(type.label, language)}
        accessibilityState={{ selected: filters.recordType === type.value, disabled: locked }}
        onPress={() => onChange({ recordType: type.value })}
        style={[styles.option, filters.recordType === type.value && styles.selected, locked && styles.disabled]}>
        <AppText>{type.label}</AppText>
      </Pressable>)}</View>
    </> : null}
    {supportsTags ? <TextField label="タグ（カンマ区切り・すべて一致）" value={filters.tags}
      testID="record-filter-tags" accessibilityLabel={translateText("タグ（カンマ区切り・すべて一致）", language)}
      editable={!locked} onChangeText={(tags) => onChange({ tags })} placeholder="仕事, 体調" /> : null}
    {!ready ? <AppText variant="muted">検索条件を読み込み中...</AppText> : null}
    {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}
    {storageError ? <AppText accessibilityRole="alert" style={styles.error}>{storageError}</AppText> : null}
  </Card>;
}

const styles = StyleSheet.create({
  dates: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  date: { flexGrow: 1, flexBasis: 145 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { borderWidth: 1, borderColor: "#777", padding: 10, borderRadius: 4, minHeight: 44 },
  selected: { borderColor: "#7db7ff", backgroundColor: "#173855" },
  disabled: { opacity: 0.5 }, error: { color: "#ff8c98" },
});
