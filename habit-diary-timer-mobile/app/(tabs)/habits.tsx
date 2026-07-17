import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { TrainingVideo, type TrainingResult } from "@/components/TrainingVideo";
import { lightTheme } from "@/constants/theme";
import { habitRepository } from "@/repositories/habitRepository";
import { journalRepository } from "@/repositories/journalRepository";
import { habitFormSchema, type HabitFormValues } from "@/schemas/forms";
import type { HabitWithToday } from "@/types/models";
import { formatDateJa, toDateKey } from "@/utils/date";
import { fileStorageService, type StoredFile } from "@/services/fileStorageService";

export default function HabitsScreen() {
  const [habits, setHabits] = useState<HabitWithToday[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<HabitWithToday | null>(null);
  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [trainingImages, setTrainingImages] = useState<StoredFile[]>([]);
  const [mediaMode, setMediaMode] = useState<"default" | "slides">("default");
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
  useFocusEffect(useCallback(() => {
    fileStorageService.list().then((files) => {
      const images = files.filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file.name));
      setTrainingImages(images);
      if (images.length === 0) setMediaMode("default");
    });
  }, []));

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

  function completeTraining(result: TrainingResult) {
    const recordDate = toDateKey();
    journalRepository.create({
      recordDate,
      title: "調教完了記録",
      body: `タイトル: 調教完了記録\n実施日: ${recordDate}\n難易度: ${result.difficulty}\n秒数: ${result.elapsedSeconds}秒`,
      recordType: "diary",
      tags: `調教,完了,射精記録,${result.difficulty}`,
    });
    setTrainingResult(result);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">調教部屋</AppText>
        <PrimaryButton title="登録" onPress={openCreate} />
      </View>

      <RoomConversation characterSource={require("../../assets/characters/training-nino.png")} roomName="調教部屋" lines={[{ text: "今日の課題を確認するわ。続けるものを選んで。" }, { text: "達成した課題は、忘れずに記録して。", event: "DAILY TRAINING" }, { text: "積み重ねた日数は、あなたが続けた証拠よ。" }]} />

      <Card>
        <AppText variant="subtitle">表示するファイル</AppText>
        <View style={styles.mediaChoices}>
          <View style={styles.mediaChoice}>
            <PrimaryButton title="デフォルト動画" tone={mediaMode === "default" ? "primary" : "secondary"} onPress={() => setMediaMode("default")} />
          </View>
          {trainingImages.length > 0 ? (
            <View style={styles.mediaChoice}>
              <PrimaryButton title={`格納画像 (${trainingImages.length})`} tone={mediaMode === "slides" ? "primary" : "secondary"} onPress={() => setMediaMode("slides")} />
            </View>
          ) : null}
        </View>
        <AppText variant="muted">{trainingImages.length > 0 ? "格納画像を選ぶと、すべての画像を順番に繰り返し表示します。" : "ファイル格納部屋へ画像を追加すると、スライド表示を選択できます。"}</AppText>
      </Card>

      <TrainingVideo key={mediaMode} onComplete={completeTraining} slides={mediaMode === "slides" ? trainingImages : []} />

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

      <Modal visible={trainingResult !== null} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.completeBackdrop}>
          <View style={styles.completeDialog}>
            <AppText style={styles.completeEvent}>TRAINING COMPLETE</AppText>
            <View style={styles.completePortrait}>
              <View style={styles.completeHair} />
              <View style={styles.completeFace} />
            </View>
            <AppText variant="subtitle">ニノ</AppText>
            <AppText style={styles.completeMessage}>お疲れさま。今日の調教はここまでよ。ちゃんと記録しておくわ。</AppText>
            <View style={styles.resultBox}>
              <AppText variant="label">タイトル</AppText>
              <AppText>調教完了記録</AppText>
              <AppText variant="label">実施日</AppText>
              <AppText>{formatDateJa(toDateKey())}</AppText>
              <AppText variant="label">難易度</AppText>
              <AppText>{trainingResult?.difficulty ?? "-"}</AppText>
              <AppText variant="label">秒数</AppText>
              <AppText style={styles.resultSeconds}>{trainingResult?.elapsedSeconds ?? 0}秒</AppText>
              <AppText variant="muted">調教日記へ保存しました。</AppText>
            </View>
            <PrimaryButton title="ホームへ戻る" onPress={() => {
              setTrainingResult(null);
              router.replace("/(tabs)");
            }} />
          </View>
        </View>
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
  mediaChoices: {
    flexDirection: "row",
    gap: 8,
  },
  mediaChoice: {
    flex: 1,
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
  completeBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.88)",
  },
  completeDialog: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#fff",
    padding: 22,
    backgroundColor: "#080808",
  },
  completeEvent: {
    color: lightTheme.danger,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  completePortrait: {
    overflow: "hidden",
    alignItems: "center",
    width: 92,
    height: 92,
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 46,
    backgroundColor: "#1a1a1a",
  },
  completeHair: {
    width: 72,
    height: 58,
    marginTop: 12,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    backgroundColor: "#d96d9d",
  },
  completeFace: {
    width: 54,
    height: 44,
    marginTop: -35,
    borderRadius: 24,
    backgroundColor: "#ead0c2",
  },
  completeMessage: {
    textAlign: "center",
    lineHeight: 24,
  },
  resultBox: {
    width: "100%",
    gap: 5,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#555",
    paddingVertical: 12,
  },
  resultSeconds: {
    color: lightTheme.danger,
    fontSize: 26,
    fontWeight: "900",
  },
});
