import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
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
import {
  fileStorageService,
  type StoredFile,
} from "@/services/fileStorageService";
import { pointRepository } from "@/repositories/rewardRepository";

const trainingJudgements = [
  { limit: 10, comments: [
    "は？10秒も我慢できないなんて早すぎよ。すぐにお仕置き部屋へ行きなさい",
    "え？一桁秒で終わり？記録するのも恥ずかしい速さね。お仕置き確定よ",
    "始まったと思ったらもう終わり？早漏すぎて話にならないわね。反省しながらお仕置きを受けなさい",
  ] },
  { limit: 30, comments: [
    "ずいぶん早かったわね。お仕置き部屋で鍛え直しなさい",
  ] },
  { limit: 100, comments: [
    "その弱さはお仕置き部屋で鍛え直しね♡",
    "合格には程遠いからお仕置きね♡",
    "少しは耐えたけど足りないわ。次はもっと我慢しなさい♡",
  ] },
  { limit: 300, comments: [
    "5分まで届かなかったのね。惜しくてもお仕置きは免除しないわ♡",
    "ここで終わるなんて中途半端よ。お仕置き部屋へ行きなさい♡",
  ] },
  { limit: 600, comments: [
    "よく耐えたけれど基準未満ね。最後にお仕置きを受けてきなさい♡",
  ] },
  { limit: Number.POSITIVE_INFINITY, comments: [
    "最後までよく我慢したわね。今日はお仕置きなしでいいわ♡",
  ] },
] as const;

function trainingJudgement(seconds: number) {
  const group = trainingJudgements.find((item) => seconds < item.limit) ?? trainingJudgements.at(-1)!;
  return group.comments[Math.floor(Math.random() * group.comments.length)];
}

type TrainingCompletion = TrainingResult & { judgement: string };

export default function HabitsScreen() {
  const [habits, setHabits] = useState<HabitWithToday[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<HabitWithToday | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<HabitWithToday | null>(
    null,
  );
  const [trainingResult, setTrainingResult] = useState<TrainingCompletion | null>(
    null,
  );
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
  useFocusEffect(
    useCallback(() => {
      fileStorageService.list("training").then((files) => {
        const images = files.filter((file) =>
          /\.(png|jpe?g|webp|gif)$/i.test(file.name),
        );
        setTrainingImages(images);
        if (images.length === 0) setMediaMode("default");
      });
    }, []),
  );

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
    setPendingDelete(habit);
  }

  function completeTraining(result: TrainingResult) {
    const recordDate = toDateKey();
    const judgement = trainingJudgement(result.elapsedSeconds);
    journalRepository.create({
      recordDate,
      title: "調教完了記録",
      body: `タイトル: 調教完了記録\n実施日: ${recordDate}\n難易度: ${result.difficulty}\n秒数: ${result.elapsedSeconds}秒\n判定: ${judgement}`,
      recordType: "diary",
      tags: `調教,完了,射精記録,${result.difficulty}`,
      durationSeconds: result.elapsedSeconds,
    });
    pointRepository.award(`training:${recordDate}`, 5, "本日初回の調教を完了");
    setTrainingResult({ ...result, judgement });
  }

  const resultJudgement = trainingResult?.judgement ?? "";

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">調教部屋</AppText>
        <PrimaryButton title="登録" onPress={openCreate} />
      </View>

      <RoomConversation
        characterSource={require("../../assets/characters/training-nino-v3.png")}
        roomName="調教部屋"
        lines={[
          { text: "今日の課題を確認するわ。続けるものを選んで。" },
          { text: "達成した課題は、忘れずに記録して。" },
          { text: "積み重ねた日数は、あなたが続けた証拠よ。" },
        ]}
        contractLines={[
          { text: "私の奴隷になった以上、許可するまで勝手に逝っちゃダメよ♡" },
        ]}
      />

      <Card>
        <AppText variant="subtitle">表示するファイル</AppText>
        <View style={styles.mediaChoices}>
          <View style={styles.mediaChoice}>
            <PrimaryButton
              title="デフォルト動画 (6)"
              tone={mediaMode === "default" ? "primary" : "secondary"}
              onPress={() => setMediaMode("default")}
            />
          </View>
          {trainingImages.length > 0 ? (
            <View style={styles.mediaChoice}>
              <PrimaryButton
                title={`格納画像 (${trainingImages.length})`}
                tone={mediaMode === "slides" ? "primary" : "secondary"}
                onPress={() => setMediaMode("slides")}
              />
            </View>
          ) : null}
        </View>
        <AppText variant="muted">
          {"【デフォルト動画】または【格納した画像】どちらか選択してください。"}
        </AppText>
      </Card>

      <TrainingVideo
        key={mediaMode}
        onComplete={completeTraining}
        slides={mediaMode === "slides" ? trainingImages : []}
      />

      {habits.map((habit) => {
        const streak = habitRepository.streak(habit.id);
        return (
          <Pressable key={habit.id} onPress={() => setSelectedHabit(habit)}>
            <Card>
              <View style={styles.habitHeader}>
                <View style={[styles.icon, { backgroundColor: habit.color }]}>
                  <AppText style={styles.iconText}>
                    {habit.icon?.slice(0, 1).toUpperCase() || "H"}
                  </AppText>
                </View>
                <View style={styles.grow}>
                  <AppText variant="subtitle">{habit.name}</AppText>
                  <AppText variant="muted">
                    {habit.category || "未分類"} / {habit.frequency_type}
                  </AppText>
                </View>
                <AppText
                  style={
                    habit.today_status === "completed"
                      ? styles.done
                      : styles.todo
                  }
                >
                  {habit.today_status === "completed" ? "達成" : "未達成"}
                </AppText>
              </View>
              <View style={styles.stats}>
                <AppText variant="muted">連続 {streak.current}日</AppText>
                <AppText variant="muted">最長 {streak.longest}日</AppText>
                <AppText variant="muted">
                  通算 {habit.total_completed}回
                </AppText>
              </View>
            </Card>
          </Pressable>
        );
      })}

      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />

      <Modal
        visible={formVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <Screen>
          <AppText variant="title">習慣登録</AppText>
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <TextField
                label="習慣名"
                value={field.value}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="description"
            render={({ field }) => (
              <TextField
                label="説明"
                value={field.value}
                onChangeText={field.onChange}
                multiline
              />
            )}
          />
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <TextField
                label="カテゴリ"
                value={field.value}
                onChangeText={field.onChange}
              />
            )}
          />
          <Controller
            control={form.control}
            name="targetCount"
            render={({ field }) => (
              <TextField
                label="1日の目標回数"
                value={String(field.value)}
                onChangeText={field.onChange}
                keyboardType="number-pad"
              />
            )}
          />
          <View style={styles.actions}>
            <PrimaryButton
              title="キャンセル"
              onPress={() => setFormVisible(false)}
              tone="secondary"
            />
            <PrimaryButton title="保存" onPress={form.handleSubmit(save)} />
          </View>
        </Screen>
      </Modal>

      <Modal
        visible={Boolean(selectedHabit)}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <Screen>
          {selectedHabit ? (
            <>
              <AppText variant="title">{selectedHabit.name}</AppText>
              <Card>
                <AppText variant="subtitle">習慣情報</AppText>
                <AppText>
                  {selectedHabit.description || "説明はありません。"}
                </AppText>
                <AppText variant="muted">
                  カテゴリ: {selectedHabit.category || "-"}
                </AppText>
                <AppText variant="muted">
                  今日: {selectedHabit.today_status || "未記録"}
                </AppText>
              </Card>
              <Card>
                <AppText variant="subtitle">簡単なグラフ</AppText>
                <View style={styles.graphTrack}>
                  <View
                    style={[
                      styles.graphBar,
                      {
                        width: `${Math.min(100, selectedHabit.total_completed * 5)}%`,
                      },
                    ]}
                  />
                </View>
                <AppText variant="muted">
                  通算達成回数を簡易表示しています。
                </AppText>
              </Card>
              <PrimaryButton
                title="達成にする"
                onPress={() => {
                  habitRepository.upsertRecord(
                    selectedHabit.id,
                    "completed",
                    selectedHabit.target_count,
                  );
                  setSelectedHabit(null);
                  load();
                }}
              />
              <PrimaryButton
                title="削除"
                tone="danger"
                onPress={() => removeHabit(selectedHabit)}
              />
              <PrimaryButton
                title="閉じる"
                tone="secondary"
                onPress={() => setSelectedHabit(null)}
              />
            </>
          ) : null}
        </Screen>
      </Modal>

      <Modal
        visible={trainingResult !== null}
        animationType="fade"
        transparent
        statusBarTranslucent
      >
        <View style={styles.completeBackdrop}>
          <View style={styles.completeDialog}>
            <AppText style={styles.completeEvent}>TRAINING COMPLETE</AppText>
            <View style={styles.completePortrait}>
              <View style={styles.completeHair} />
              <View style={styles.completeFace} />
            </View>
            <AppText variant="subtitle">ニノ</AppText>
            <AppText style={styles.completeMessage}>
              {resultJudgement}
            </AppText>
            <View style={styles.resultBox}>
              <AppText variant="label">タイトル</AppText>
              <AppText>調教完了記録</AppText>
              <AppText variant="label">実施日</AppText>
              <AppText>{formatDateJa(toDateKey())}</AppText>
              <AppText variant="label">難易度</AppText>
              <AppText>{trainingResult?.difficulty ?? "-"}</AppText>
              <AppText variant="label">秒数</AppText>
              <AppText style={styles.resultSeconds}>
                {trainingResult?.elapsedSeconds ?? 0}秒
              </AppText>
              <AppText variant="label">判定メッセージ</AppText>
              <AppText>{resultJudgement}</AppText>
              <AppText variant="muted">調教日記へ保存しました。</AppText>
            </View>
            {(trainingResult?.elapsedSeconds ?? 600) < 600 ? (
              <PrimaryButton
                title="お仕置き部屋へ"
                tone="danger"
                onPress={() => {
                  setTrainingResult(null);
                  router.replace("/(tabs)/timer");
                }}
              />
            ) : null}
            <PrimaryButton
              title="ホームへ戻る"
              tone="secondary"
              onPress={() => {
                setTrainingResult(null);
                router.replace("/(tabs)");
              }}
            />
          </View>
        </View>
      </Modal>
      <ConfirmModal
        visible={pendingDelete !== null}
        title="習慣を削除しますか？"
        message={`${pendingDelete?.name ?? ""}\n\n関連する記録も削除されます。この操作は元に戻せません。`}
        confirmLabel="削除する"
        confirmTone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const habit = pendingDelete;
          setPendingDelete(null);
          if (!habit) return;
          habitRepository.remove(habit.id);
          setSelectedHabit(null);
          load();
        }}
      />
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
    lineHeight: 38,
    fontWeight: "900",
  },
});
