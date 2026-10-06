import { StyleSheet, View } from "react-native";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { translateWeekday } from "@/i18n";
import type { LoginBonusStamp } from "@/repositories/loginBonusRepository";
import { isJapaneseHoliday } from "@/utils/japaneseHoliday";

type Props = {
  stamps: LoginBonusStamp[];
  today: string;
};

export function LoginBonusCalendar({ stamps, today }: Props) {
  const { settings } = useAppAudio();
  const month = today.slice(0, 7);
  const monthLabel = `${Number(month.slice(0, 4))}年${Number(month.slice(5))}月`;
  const leading = new Date(`${month}-01T12:00:00`).getDay();
  const calendarDays: (LoginBonusStamp | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...stamps,
  ];

  return (
    <View style={styles.calendar} testID="login-bonus-calendar">
      <AppText variant="subtitle" style={styles.monthTitle}>
        {monthLabel}のスタンプ
      </AppText>
      <View style={styles.weekRow}>
        {Array.from({ length: 7 }, (_, weekday) => (
          <AppText
            key={weekday}
            localize={false}
            style={[
              styles.weekDay,
              weekday === 0 && styles.holidayText,
              weekday === 6 && styles.saturdayText,
            ]}
          >
            {translateWeekday(weekday, settings?.language ?? "ja")}
          </AppText>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {calendarDays.map((stamp, index) => {
          if (!stamp) return <View key={`blank-${index}`} style={styles.dayCell} />;
          const weekday = new Date(`${stamp.date}T12:00:00`).getDay();
          const holiday = isJapaneseHoliday(stamp.date);
          return (
            <View
              key={stamp.date}
              testID={`login-bonus-day-${stamp.date}`}
              style={[
                styles.dayCell,
                stamp.date === today && styles.todayCell,
                stamp.date > today && styles.futureDay,
              ]}
            >
              <AppText style={[
                styles.dayText,
                weekday === 6 && styles.saturdayText,
                (weekday === 0 || holiday) && styles.holidayText,
              ]}>
                {stamp.day}
              </AppText>
              <AppText style={[styles.stampMark, stamp.claimed && styles.claimedMark]}>
                {stamp.claimed ? "♡" : "—"}
              </AppText>
              {stamp.claimed ? <AppText style={styles.stampPoint}>{stamp.points}pt</AppText> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { backgroundColor: "#fff", borderRadius: 4, padding: 12, gap: 10 },
  monthTitle: { color: "#111", textAlign: "center" },
  weekRow: { flexDirection: "row" },
  weekDay: {
    width: `${100 / 7}%`,
    color: "#111",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: `${100 / 7}%`,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d7d7d7",
    backgroundColor: "#fff",
  },
  todayCell: { borderColor: "#1667c7", borderWidth: 3 },
  futureDay: { opacity: 0.25 },
  dayText: { color: "#111", fontWeight: "800" },
  saturdayText: { color: "#1667c7" },
  holidayText: { color: "#d92332" },
  stampMark: { color: "#777", fontSize: 16, lineHeight: 20, fontWeight: "900" },
  claimedMark: { color: "#d92b83" },
  stampPoint: { color: "#555", fontSize: 10, lineHeight: 14, fontWeight: "800" },
});
