import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { CharacterPanel } from "@/components/CharacterPanel";
import { EventRouteStrip } from "@/components/EventRouteStrip";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomCard } from "@/components/RoomCard";
import { Screen } from "@/components/Screen";
import { appRooms } from "@/constants/rooms";
import { lightTheme } from "@/constants/theme";
import { habitRepository } from "@/repositories/habitRepository";
import { journalRepository } from "@/repositories/journalRepository";
import { timerRepository } from "@/repositories/timerRepository";
import type { HabitWithToday, Journal, TimerPreset } from "@/types/models";
import { formatDateJa, toDateKey } from "@/utils/date";

export default function HomeScreen() {
  const [habits, setHabits] = useState<HabitWithToday[]>([]);
  const [latestJournal, setLatestJournal] = useState<Journal | null>(null);
  const [todayJournalCount, setTodayJournalCount] = useState(0);
  const [timers, setTimers] = useState<TimerPreset[]>([]);

  const load = useCallback(() => {
    setHabits(habitRepository.listWithToday());
    setLatestJournal(journalRepository.latest() ?? null);
    setTodayJournalCount(journalRepository.countToday());
    setTimers(timerRepository.presets().slice(0, 3));
  }, []);

  useEffect(load, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const completedCount = habits.filter((habit) => habit.today_status === "completed").length;
  const achievementRate = habits.length ? Math.round((completedCount / habits.length) * 100) : 0;
  const streakTotal = useMemo(
    () => habits.reduce((sum, habit) => sum + habitRepository.streak(habit.id).current, 0),
    [habits],
  );

  async function toggleHabit(habit: HabitWithToday) {
    const nextStatus = habit.today_status === "completed" ? "skipped" : "completed";
    habitRepository.upsertRecord(habit.id, nextStatus, habit.target_count);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    load();
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="title">Nino Room</AppText>
          <AppText variant="muted">{formatDateJa(toDateKey())}</AppText>
        </View>
        <AppText style={styles.percent}>{achievementRate}%</AppText>
      </View>

      <CharacterPanel
        achievementRate={achievementRate}
        completedCount={completedCount}
        totalHabits={habits.length}
        journalCount={todayJournalCount}
      />

      <EventRouteStrip progress={achievementRate} />

      <View style={styles.summaryGrid}>
        <Card>
          <AppText variant="label">達成</AppText>
          <AppText variant="subtitle">{completedCount}/{habits.length}</AppText>
        </Card>
        <Card>
          <AppText variant="label">連続達成</AppText>
          <AppText variant="subtitle">{streakTotal}日</AppText>
        </Card>
        <Card>
          <AppText variant="label">本日の記録</AppText>
          <AppText variant="subtitle">{todayJournalCount}件</AppText>
        </Card>
      </View>

      <View style={styles.roomSection}>
        <View>
          <AppText variant="subtitle">行き先を選択</AppText>
          <AppText variant="muted">シミュレーションゲームの場所選択のように、部屋から行動を選びます。</AppText>
        </View>
        {appRooms.map((room) => (
          <RoomCard key={room.key} room={room} />
        ))}
      </View>

      <Card>
        <AppText variant="subtitle">今日の習慣</AppText>
        {habits.length === 0 ? <AppText variant="muted">習慣はまだありません。</AppText> : null}
        {habits.map((habit) => (
          <Pressable key={habit.id} onPress={() => toggleHabit(habit)} style={styles.habitRow}>
            <View style={[styles.colorDot, { backgroundColor: habit.color }]} />
            <View style={styles.grow}>
              <AppText style={styles.habitName}>{habit.name}</AppText>
              <AppText variant="muted">{habit.category || "未分類"} / 目標 {habit.target_count}回</AppText>
            </View>
            <AppText style={habit.today_status === "completed" ? styles.done : styles.todo}>
              {habit.today_status === "completed" ? "達成" : "未"}
            </AppText>
          </Pressable>
        ))}
      </Card>

      <Card>
        <AppText variant="subtitle">直近の日記</AppText>
        {latestJournal ? (
          <>
            <AppText style={styles.habitName}>{latestJournal.title}</AppText>
            <AppText variant="muted" numberOfLines={3}>{latestJournal.body}</AppText>
          </>
        ) : (
          <AppText variant="muted">まだ記録がありません。</AppText>
        )}
      </Card>

      <Card>
        <AppText variant="subtitle">最近使用したタイマー</AppText>
        <View style={styles.timerButtons}>
          {timers.map((timer) => (
            <PrimaryButton key={timer.id} title={timer.name} onPress={() => router.push("/(tabs)/timer")} />
          ))}
        </View>
      </Card>

      <Card>
        <AppText variant="subtitle">今日のひとこと</AppText>
        <AppText>小さく続けることが、いちばん強い記録になります。</AppText>
      </Card>

      <View style={styles.shortcutGrid}>
        <PrimaryButton title="習慣へ" onPress={() => router.push("/(tabs)/habits")} />
        <PrimaryButton title="記録へ" onPress={() => router.push("/(tabs)/records")} tone="secondary" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  percent: {
    color: lightTheme.primary,
    fontSize: 34,
    fontWeight: "900",
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 8,
  },
  roomSection: {
    gap: 12,
  },
  habitRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: lightTheme.border,
    paddingVertical: 10,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  grow: {
    flex: 1,
  },
  habitName: {
    fontWeight: "800",
  },
  done: {
    color: lightTheme.primary,
    fontWeight: "900",
  },
  todo: {
    color: lightTheme.muted,
    fontWeight: "800",
  },
  timerButtons: {
    gap: 8,
  },
  shortcutGrid: {
    flexDirection: "row",
    gap: 10,
  },
});
