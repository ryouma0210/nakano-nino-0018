import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppAudio } from "@/audio/AudioProvider";
import { lightTheme } from "@/constants/theme";
import { translateText } from "@/i18n";
import { AppText } from "./AppText";

type Props = {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  testID?: string;
};

export function SelectField({ label, value, options, onChange, disabled = false, testID }: Props) {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const [open, setOpen] = useState(false);
  // Keep previously saved values visible even when the available choices change.
  const display = options.find((option) => option.value === value)?.label ?? value;
  useEffect(() => { setOpen(false); }, [disabled, value]);

  return <View style={styles.wrap}>
    <AppText variant="label">{label}</AppText>
    <Pressable testID={testID} accessibilityRole="button"
      accessibilityLabel={`${translateText(label, language)} ${translateText(display, language)}`}
      accessibilityState={{ expanded: open && !disabled, disabled }} disabled={disabled}
      onPress={() => setOpen((previous) => !previous)} onAccessibilityEscape={() => setOpen(false)}
      style={({ pressed }) => [styles.field, disabled && styles.disabled, pressed && styles.pressed]}>
      <AppText style={styles.value}>{display}</AppText>
      <Ionicons name={open && !disabled ? "chevron-up" : "chevron-down"} size={18} color={lightTheme.text} accessible={false} />
    </Pressable>
    {open && !disabled ? <View testID={testID ? `${testID}-options` : undefined}
      accessibilityRole="radiogroup" accessibilityLabel={translateText(label, language)} style={styles.options}>
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.list}>
        {options.map((option) => <Pressable key={option.value}
          testID={testID ? `${testID}-option-${option.value || "empty"}` : undefined}
          accessibilityRole="radio" accessibilityLabel={translateText(option.label, language)}
          accessibilityState={{ checked: option.value === value }}
          onPress={() => { setOpen(false); onChange(option.value); }}
          style={({ pressed }) => [styles.option, option.value === value && styles.selected, pressed && styles.pressed]}>
          <AppText style={styles.value}>{option.label}</AppText>
          {option.value === value ? <Ionicons name="checkmark" size={18} color={lightTheme.text} accessible={false} /> : null}
        </Pressable>)}
      </ScrollView>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: { minHeight: 48, borderWidth: 1, borderColor: lightTheme.border, borderRadius: 4,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#080808", flexDirection: "row", alignItems: "center", gap: 12 },
  value: { flex: 1 },
  options: { borderWidth: 1, borderColor: lightTheme.border, borderRadius: 4, overflow: "hidden", backgroundColor: "#080808" },
  list: { maxHeight: 264 },
  option: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  selected: { backgroundColor: "#173855" },
  disabled: { opacity: 0.5 },
  pressed: { backgroundColor: lightTheme.surfaceSoft },
});
