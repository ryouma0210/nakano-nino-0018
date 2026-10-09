import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { translateText, translateWeekday } from "@/i18n";
import { formatPickerValue, pickerDateFormatter } from "./format";
import { calendarMonthGrid, getPickerFocus, getPickerLimits, isPickerValueSelectable,
  monthHasSelectableDay, stepCalendarMonth, yearBlock, type DatePickerMode, type PickerBounds } from "./model";

type Props = PickerBounds & {
  mode: DatePickerMode;
  label: string;
  value: string;
  allowClear: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
};

export function DatePickerModal({ mode, label, value, allowClear, minimum, maximum, onSelect, onClose }: Props) {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const insets = useSafeAreaInsets();
  const bounds = { minimum, maximum };
  const limits = getPickerLimits(mode, bounds);
  const [month, setMonth] = useState(() => getPickerFocus(value, mode, bounds).slice(0, 7));
  const [view, setView] = useState<DatePickerMode | "year">(mode);
  const year = Number(month.slice(0, 4));
  const years = yearBlock(year);
  const firstYear = Number(limits.minimum.slice(0, 4));
  const lastYear = Number(limits.maximum.slice(0, 4));
  const formatters = useMemo(() => ({
    month: pickerDateFormatter(language, { month: "short" }),
    year: pickerDateFormatter(language, { year: "numeric" }),
  }), [language]);
  const monthDate = new Date(`${month}-01T12:00:00Z`);
  const heading = view === "day" ? formatPickerValue(month, "month", language)
    : view === "month" ? formatters.year.format(monthDate) : `${years[0]} – ${years[years.length - 1]}`;
  const today = getPickerFocus("", "day");

  function selectableMonth(key: string) {
    return mode === "month" ? isPickerValueSelectable(key, mode, bounds) : monthHasSelectableDay(key, bounds);
  }
  function selectableYear(candidate: number) {
    return limits.valid && candidate >= firstYear && candidate <= lastYear;
  }
  function moveYear(candidate: number) {
    setMonth(`${String(candidate).padStart(4, "0")}-${month.slice(5)}`);
  }
  function canMove(direction: -1 | 1) {
    if (view === "day") {
      const candidate = stepCalendarMonth(month, direction);
      return candidate !== month && selectableMonth(candidate);
    }
    if (view === "month") return selectableYear(year + direction);
    return direction < 0 ? years[0] > firstYear : years[years.length - 1] < lastYear;
  }
  function move(direction: -1 | 1) {
    if (!canMove(direction)) return;
    if (view === "day") setMonth(stepCalendarMonth(month, direction));
    else if (view === "month") moveYear(year + direction);
    else moveYear(direction < 0 ? years[0] - 1 : years[years.length - 1] + 1);
  }
  function chooseMonth(key: string) {
    if (!selectableMonth(key)) return;
    if (mode === "month") onSelect(key);
    else { setMonth(key); setView("day"); }
  }
  const previousLabel = view === "day" ? "前の月" : view === "month" ? "前の年" : "前の12年";
  const nextLabel = view === "day" ? "次の月" : view === "month" ? "次の年" : "次の12年";

  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View testID="date-picker" accessibilityViewIsModal style={styles.dialog}>
        <View style={styles.titleRow}>
          <View style={styles.title}>
            <AppText variant="label">{label}</AppText>
            <AppText variant="subtitle" accessibilityRole="header">{view === "day" ? "日付を選択" : view === "month" ? "月を選択" : "年を選択"}</AppText>
          </View>
          <Pressable testID="date-picker-close" accessibilityRole="button" accessibilityLabel={translateText("閉じる", language)}
            onPress={onClose} style={styles.iconButton}>
            <Ionicons name="close" size={24} color="#fff" accessible={false} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.navigation}>
            <Pressable testID="date-picker-previous" accessibilityRole="button" accessibilityLabel={translateText(previousLabel, language)}
              accessibilityState={{ disabled: !canMove(-1) }} disabled={!canMove(-1)} onPress={() => move(-1)}
              style={[styles.iconButton, !canMove(-1) && styles.disabled]}>
              <Ionicons name="chevron-back" size={22} color="#fff" accessible={false} />
            </Pressable>
            <Pressable testID="date-picker-heading" accessibilityRole="button" disabled={view === "year"}
              accessibilityLabel={heading} accessibilityHint={view === "year" ? undefined : translateText(view === "day" ? "月を選択" : "年を選択", language)}
              accessibilityState={{ disabled: view === "year" }}
              onPress={() => setView(view === "day" ? "month" : "year")} style={styles.heading}>
              <AppText localize={false} style={styles.headingText}>{heading}</AppText>
              {view !== "year" ? <Ionicons name="chevron-down" size={16} color="#aaa" accessible={false} /> : null}
            </Pressable>
            <Pressable testID="date-picker-next" accessibilityRole="button" accessibilityLabel={translateText(nextLabel, language)}
              accessibilityState={{ disabled: !canMove(1) }} disabled={!canMove(1)} onPress={() => move(1)}
              style={[styles.iconButton, !canMove(1) && styles.disabled]}>
              <Ionicons name="chevron-forward" size={22} color="#fff" accessible={false} />
            </Pressable>
          </View>
          {view === "day" ? <>
            <View style={styles.grid}>{Array.from({ length: 7 }, (_, index) =>
              <AppText key={index} localize={false} style={[styles.weekday, index === 0 && styles.sunday, index === 6 && styles.saturday]}>
                {translateWeekday(index, language)}
              </AppText>)}</View>
            <View style={styles.grid}>{calendarMonthGrid(month).map((date, index) => {
              if (!date) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const enabled = isPickerValueSelectable(date, "day", bounds);
              const selected = date === value;
              return <View key={date} style={styles.dayCell}>
                <Pressable testID={`date-picker-day-${date}`} accessibilityRole="button"
                  accessibilityLabel={formatPickerValue(date, "day", language)}
                  accessibilityState={{ selected, disabled: !enabled }} disabled={!enabled} onPress={() => onSelect(date)}
                  style={({ pressed }) => [styles.choice, date === today && styles.today, selected && styles.selected,
                    !enabled && styles.disabled, pressed && styles.pressed]}>
                  <AppText localize={false} style={[styles.choiceText, selected && styles.selectedText]}>{Number(date.slice(-2))}</AppText>
                </Pressable>
              </View>;
            })}</View>
          </> : view === "month" ? <View style={styles.grid}>{Array.from({ length: 12 }, (_, index) => {
            const key = `${month.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`;
            const enabled = selectableMonth(key);
            const selected = key === value.slice(0, 7);
            return <View key={key} style={styles.largeCell}>
              <Pressable testID={`date-picker-month-${key}`} accessibilityRole="button"
                accessibilityLabel={formatPickerValue(key, "month", language)}
                accessibilityState={{ selected, disabled: !enabled }} disabled={!enabled} onPress={() => chooseMonth(key)}
                style={({ pressed }) => [styles.choice, selected && styles.selected, !enabled && styles.disabled, pressed && styles.pressed]}>
                <AppText localize={false} style={[styles.choiceText, selected && styles.selectedText]}>
                  {formatters.month.format(new Date(`${key}-01T12:00:00Z`))}
                </AppText>
              </Pressable>
            </View>;
          })}</View> : <View style={styles.grid}>{years.map((candidate) => {
            const enabled = selectableYear(candidate);
            const selected = candidate === Number(value.slice(0, 4));
            return <View key={candidate} style={styles.largeCell}>
              <Pressable testID={`date-picker-year-${candidate}`} accessibilityRole="button" accessibilityLabel={String(candidate)}
                accessibilityState={{ selected, disabled: !enabled }} disabled={!enabled}
                onPress={() => { moveYear(candidate); setView("month"); }}
                style={({ pressed }) => [styles.choice, selected && styles.selected, !enabled && styles.disabled, pressed && styles.pressed]}>
                <AppText localize={false} style={[styles.choiceText, selected && styles.selectedText]}>{candidate}</AppText>
              </Pressable>
            </View>;
          })}</View>}
          {allowClear ? <View testID="date-picker-clear"><PrimaryButton title="指定なし" tone="secondary" onPress={() => onSelect("")} /></View> : null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, backgroundColor: "rgba(0,0,0,0.8)" },
  dialog: { width: "100%", maxWidth: 400, maxHeight: "100%", borderWidth: 1, borderColor: "#777", borderRadius: 8, backgroundColor: "#101010", padding: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", paddingLeft: 4, paddingBottom: 12 },
  title: { flex: 1, gap: 2 },
  content: { gap: 12 },
  navigation: { flexDirection: "row", alignItems: "center" },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 4 },
  heading: { flex: 1, minHeight: 44, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  headingText: { fontWeight: "700", textAlign: "center", flexShrink: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", color: "#aaa", fontSize: 12 },
  sunday: { color: "#ff8c98" },
  saturday: { color: "#7db7ff" },
  dayCell: { width: `${100 / 7}%`, height: 46, padding: 1 },
  largeCell: { width: `${100 / 3}%`, height: 54, padding: 3 },
  choice: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 4, borderWidth: 1, borderColor: "transparent" },
  choiceText: { textAlign: "center" },
  today: { borderColor: "#999" },
  selected: { backgroundColor: "#fff", borderColor: "#fff" },
  selectedText: { color: "#111", fontWeight: "800" },
  disabled: { opacity: 0.28 },
  pressed: { opacity: 0.65 },
});
