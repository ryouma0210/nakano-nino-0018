import { Pressable, StyleSheet, View } from "react-native";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { SelectField } from "@/components/SelectField";
import { lightTheme } from "@/constants/theme";
import { translateText, translateWithValues } from "@/i18n";

type Props = {
  title: string;
  options: readonly { value: string; label: string; localize?: boolean }[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  limit: number;
  disabled?: boolean;
  testID?: string;
};

export function RankedSelectionEditor({ title, options, value, onChange, limit, disabled = false, testID }: Props) {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const remaining = options.filter((option) => !value.includes(option.value));
  const full = value.length >= limit;

  function move(index: number, offset: number) {
    const destination = index + offset;
    if (disabled || destination < 0 || destination >= value.length) return;
    const next = [...value];
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next);
  }

  function add(item: string) {
    if (disabled || full || !remaining.some((option) => option.value === item)) return;
    onChange([...value, item]);
  }

  return <View testID={testID} style={styles.editor}>
    <View style={styles.heading}>
      <AppText variant="label" accessibilityRole="header" style={styles.title}>{title}</AppText>
      <AppText localize={false} variant="muted">{`${value.length} / ${limit}`}</AppText>
    </View>
    {value.length === 0 ? <AppText variant="muted">順位はまだ設定されていません。</AppText> : null}
    {value.map((item, index) => {
      const option = options.find((candidate) => candidate.value === item);
      const label = option?.label ?? item;
      const displayLabel = option && option.localize !== false ? translateText(label, language) : label;
      const rank = translateWithValues("{0}位", [String(index + 1)], language);
      const actions = [
        { key: "up", label: "上へ", disabled: disabled || index === 0, run: () => move(index, -1) },
        { key: "down", label: "下へ", disabled: disabled || index === value.length - 1, run: () => move(index, 1) },
        { key: "remove", label: "順位解除", disabled, run: () => { if (!disabled) onChange(value.filter((entry) => entry !== item)); } },
      ];
      return <View key={item} testID={testID ? `${testID}-rank-${index + 1}` : undefined} style={styles.row}>
        <View style={styles.rankHeading}>
          <AppText localize={false} style={styles.rank}>{rank}</AppText>
          <AppText localize={false} style={styles.item}>{displayLabel}</AppText>
        </View>
        <View style={styles.actions}>
          {actions.map((action) => <Pressable key={action.key}
            testID={testID ? `${testID}-${action.key}-${index + 1}` : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${rank} ${displayLabel} ${translateText(action.label, language)}`}
            accessibilityState={{ disabled: action.disabled }} disabled={action.disabled} onPress={action.run}
            style={({ pressed }) => [styles.action, action.disabled && styles.disabled, pressed && !action.disabled && styles.pressed]}>
            <AppText style={styles.actionText}>{action.label}</AppText>
          </Pressable>)}
        </View>
      </View>;
    })}
    {options.length === 0 ? <AppText variant="muted">先に項目を選択してください。</AppText>
      : full ? <AppText variant="muted">上限に達しました。入れ替える場合は順位を解除してください。</AppText>
        : remaining.length === 0 ? <AppText variant="muted">選択した項目はすべて順位に追加されています。</AppText>
          : <SelectField label="順位に追加" value="" disabled={disabled} testID={testID ? `${testID}-add` : undefined}
            options={[{ value: "", label: "追加する項目を選択" }, ...remaining]} onChange={add} />}
  </View>;
}

const styles = StyleSheet.create({
  editor: { gap: 10 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, minWidth: 0 },
  row: { gap: 6, padding: 8, borderWidth: 1, borderColor: lightTheme.border, borderRadius: 4, backgroundColor: "#080808" },
  rankHeading: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rank: { color: lightTheme.primaryDark, fontWeight: "800" },
  item: { flex: 1, minWidth: 0 },
  actions: { flexDirection: "row", gap: 6 },
  action: { flex: 1, minWidth: 44, minHeight: 44, paddingHorizontal: 6, paddingVertical: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: lightTheme.border, borderRadius: 4 },
  actionText: { textAlign: "center", fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.5 },
  pressed: { backgroundColor: lightTheme.surfaceSoft },
});
