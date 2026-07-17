import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { lightTheme } from "@/constants/theme";
import { habitRepository } from "@/repositories/habitRepository";
import { habitFormSchema, type HabitFormValues } from "@/schemas/forms";
import type { HabitWithToday } from "@/types/models";

export default function HabitsScreen() {
  const [habits, setHabits] = useState<HabitWithToday[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<HabitWithToday | null>(null);
  const form = useForm<HabitFormValues>({
    resolver: zodResolver(habitFormSchema) as never,
    defaultValues: {
      name: "",
      description: "",
      category: "未分類",
      icon: "star",
      color: "#2f8b72",
      frequencyType: "daily",
      targetCount: 1,
      reminderEnabled: false,
      reminderTime: "",
    },
  });

  const load = useCallback(() => {
    setHabits(habitRepository.listWithToday());
  }, []);

  useEffect(load, [load]);

  function openCreate() {
    form.reset();
    setFormVisible(true);
  }

  function save(values: HabitFormValues) {
    habitRepository.create(values);
    setFormVisible(false);
    load();
  }

  function removeHabit(habit: HabitWithToday) {
    Alert.alert("削除確認", `${habit.name}を削除しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          habitRepository.remove(habit.id);
          setSelectedHabit(null);
          load();
        },
      },
    ]);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">習慣の部屋</AppText>
        <PrimaryButton title="登録" onPress={openCreate} />
      </View>

      {habits.map((habit) => {
        const streak = habitRepository.streak(habit.id);
        return (
          <Pressable key={habit.id} onPress={() => setSelectedHabit(habit)}>
            <Card>
              <View style={styles.habitHeader}>
                <View style={[styles.icon, { backgroundColor: habit.color }]}>
                  <AppText style={styles.iconText}>{habit.icon?.slice(0, 1).toUpperCase() || "H"}</AppText>
                </View>
                <View style={styles.grow}>
                  <AppText variant="subtitle">{habit.name}</AppText>
                  <AppText variant="muted">{habit.category || "未分類"} / {habit.frequency_type}</AppText>
                </View>
                <AppText style={habit.today_status === "completed" ? styles.done : styles.todo}>
                  {habit.today_status === "completed" ? "達成" : "未達成"}
                </AppText>
              </View>
              <View style={styles.stats}>
                <AppText variant="muted">連続 {streak.current}日</AppText>
                <AppText variant="muted">最長 {streak.longest}日</AppText>
                <AppText variant="muted">通算 {habit.total_completed}回</AppText>
              </View>
            </Card>
          </Pressable>
        );
      })}

      <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet">
        <Screen>
          <AppText variant="title">習慣登録</AppText>
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <TextField label="習慣名" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
            )}
          />
          <Controller
            control={form.control}
            name="description"
            render={({ field }) => (
              <TextField label="説明" value={field.value} onChangeText={field.onChange} multiline />
            )}
          />
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <TextField label="カテゴリ" value={field.value} onChangeText={field.onChange} />
            )}
          />
          <Controller
            control={form.control}
            name="targetCount"
            render={({ field }) => (
              <TextField label="1日の目標回数" value={String(field.value)} onChangeText={field.onChange} keyboardType="number-pad" />
            )}
          />
          <View style={styles.actions}>
            <PrimaryButton title="キャンセル" onPress={() => setFormVisible(false)} tone="secondary" />
            <PrimaryButton title="保存" onPress={form.handleSubmit(save)} />
          </View>
        </Screen>
      </Modal>

      <Modal visible={Boolean(selectedHabit)} animationType="slide" presentationStyle="pageSheet">
        <Screen>
          {selectedHabit ? (
            <>
              <AppText variant="title">{selectedHabit.name}</AppText>
              <Card>
                <AppText variant="subtitle">習慣情報</AppText>
                <AppText>{selectedHabit.description || "説明はありません。"}</AppText>
                <AppText variant="muted">カテゴリ: {selectedHabit.category || "-"}</AppText>
                <AppText variant="muted">今日: {selectedHabit.today_status || "未記録"}</AppText>
              </Card>
              <Card>
                <AppText variant="subtitle">簡単なグラフ</AppText>
                <View style={styles.graphTrack}>
                  <View style={[styles.graphBar, { width: `${Math.min(100, selectedHabit.total_completed * 5)}%` }]} />
                </View>
                <AppText variant="muted">通算達成回数を簡易表示しています。</AppText>
              </Card>
              <PrimaryButton title="達成にする" onPress={() => {
                habitRepository.upsertRecord(selectedHabit.id, "completed", selectedHabit.target_count);
                setSelectedHabit(null);
                load();
              }} />
              <PrimaryButton title="削除" tone="danger" onPress={() => removeHabit(selectedHabit)} />
              <PrimaryButton title="閉じる" tone="secondary" onPress={() => setSelectedHabit(null)} />
            </>
          ) : null}
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  habitHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  iconText: {
    color: "#fff",
    fontWeight: "900",
  },
  grow: {
    flex: 1,
  },
  done: {
    color: lightTheme.primary,
    fontWeight: "900",
  },
  todo: {
    color: lightTheme.muted,
    fontWeight: "800",
  },
  stats: {
    flexDirection: "row",
    gap: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  graphTrack: {
    overflow: "hidden",
    height: 14,
    borderRadius: 7,
    backgroundColor: lightTheme.surfaceSoft,
  },
  graphBar: {
    height: 14,
    backgroundColor: lightTheme.primary,
  },
});
