import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppAudio } from "@/audio/AudioProvider";
import { lightTheme } from "@/constants/theme";
import { DatePickerModal } from "@/features/date-picker/DatePickerModal";
import { formatPickerValue } from "@/features/date-picker/format";
import type { DatePickerMode, PickerBounds } from "@/features/date-picker/model";
import { translateText } from "@/i18n";
import { AppText } from "./AppText";

type Props = PickerBounds & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode?: DatePickerMode;
  disabled?: boolean;
  allowClear?: boolean;
  testID?: string;
};

/** The same calendar selection is used by reports and record filters on every platform. */
export function DateField({ mode = "day", label, value, onChange, minimum, maximum,
  disabled = false, allowClear = false, testID }: Props) {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const [open, setOpen] = useState(false);
  const display = formatPickerValue(value, mode, language, mode === "day")
    ?? translateText(allowClear && !value ? "指定なし" : mode === "month" ? "月を選択" : "日付を選択", language);
  function select(next: string) {
    setOpen(false);
    if (!disabled) onChange(next);
  }
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <Pressable testID={testID} disabled={disabled} onPress={() => setOpen(true)}
        accessibilityRole="button" accessibilityLabel={translateText(label, language)}
        accessibilityHint={translateText("カレンダーを開く", language)}
        accessibilityValue={{ text: display }} accessibilityState={{ disabled, expanded: open }}
        style={({ pressed }) => [styles.field, disabled && styles.disabled, pressed && styles.pressed]}>
        <AppText localize={false} style={[styles.value, !value && styles.placeholder]}>{display}</AppText>
        <Ionicons name="calendar-outline" size={22} color={lightTheme.text} accessible={false} />
      </Pressable>
      {open && !disabled ? <DatePickerModal mode={mode} label={label} value={value}
        minimum={minimum} maximum={maximum} allowClear={allowClear}
        onSelect={select} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: { minHeight: 48, borderWidth: 1, borderColor: lightTheme.border, borderRadius: 4,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#080808", flexDirection: "row", alignItems: "center", gap: 12 },
  value: { flex: 1 },
  placeholder: { color: lightTheme.muted },
  disabled: { opacity: 0.5 },
  pressed: { backgroundColor: lightTheme.surfaceSoft },
});
