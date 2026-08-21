import { useCallback, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { roomMessages } from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { TrainingVideo, type TrainingResult } from "@/components/TrainingVideo";
import { lightTheme } from "@/constants/theme";
import { journalRepository } from "@/repositories/journalRepository";
import { formatDateJa, toDateKey } from "@/utils/date";
import {
  fileStorageService,
  type StoredFile,
} from "@/services/fileStorageService";
import { pointRepository } from "@/repositories/rewardRepository";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { useAppModal } from "@/components/AppModalProvider";

const trainingJudgementGroups = [
  { comments: [
    "は？10秒も我慢できないなんて早すぎよ。すぐにお仕置き部屋へ行きなさい",
    "え？一桁秒で終わり？記録するのも恥ずかしい速さね。お仕置き確定よ",
    "始まったと思ったらもう終わり？早漏すぎて話にならないわね。反省しながらお仕置きを受けなさい",
  ] },
  { comments: [
    "ずいぶん早かったわね。お仕置き部屋で鍛え直しなさい",
  ] },
  { comments: [
    "その弱さはお仕置き部屋で鍛え直しね♡",
    "合格には程遠いからお仕置きね♡",
    "少しは耐えたけど足りないわ。次はもっと我慢しなさい♡",
  ] },
  { comments: [
    "目標時間まで届かなかったのね。惜しくてもお仕置きは免除しないわ♡",
    "ここで終わるなんて中途半端よ。お仕置き部屋へ行きなさい♡",
  ] },
  { comments: [
    "よく耐えたけれど基準未満ね。最後にお仕置きを受けてきなさい♡",
  ] },
  { comments: [
    "最後までよく我慢したわね。今日はお仕置きなしでいいわ♡",
  ] },
] as const;

function trainingJudgement(seconds: number, targetSeconds: number) {
  const limits = [10, 30, targetSeconds / 6, targetSeconds / 2, targetSeconds, Number.POSITIVE_INFINITY];
  const index = limits.findIndex((limit) => seconds < limit);
  const group = trainingJudgementGroups[index < 0 ? trainingJudgementGroups.length - 1 : index];
  return group.comments[Math.floor(Math.random() * group.comments.length)];
}

type TrainingCompletion = TrainingResult & { judgement: string };

export default function HabitsScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useAppAudio();
  const { showError } = useAppModal();
  const playerName = settings?.playerName.trim() ?? "";
  const [trainingResult, setTrainingResult] = useState<TrainingCompletion | null>(
    null,
  );
  const [trainingFiles, setTrainingFiles] = useState<StoredFile[]>([]);
  const [mediaMode, setMediaMode] = useState<"default" | "stored">("default");

  useFocusEffect(
    useCallback(() => {
      fileStorageService.list("training").then((files) => {
        const supportedFiles = files.filter((file) =>
          /\.(mp4|png|jpe?g|webp|gif)$/i.test(file.name),
        );
        setTrainingFiles(supportedFiles);
        if (supportedFiles.length === 0) setMediaMode("default");
      });
    }, []),
  );

  function completeTraining(result: TrainingResult) {
    try {
      const recordDate = toDateKey();
      const judgement = trainingJudgement(result.elapsedSeconds, result.targetSeconds);
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
    } catch (error) {
      showError("調教記録の保存に失敗しました", error);
    }
  }

  const resultJudgement = trainingResult?.judgement ?? "";
  const namedResultJudgement = playerName
    ? `${playerName}。${resultJudgement}`
    : resultJudgement;

  return (
    <Screen>
      <AppText variant="title">調教部屋</AppText>

      <RoomConversation
        characterSource={require("../../assets/characters/training-nino-v3.png")}
        roomName="調教部屋"
        lines={roomMessages.training.lines}
        contractLines={roomMessages.training.contractLines}
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
          {trainingFiles.length > 0 ? (
            <View style={styles.mediaChoice}>
              <PrimaryButton
                title={`格納ファイル (${trainingFiles.length})`}
                tone={mediaMode === "stored" ? "primary" : "secondary"}
                onPress={() => setMediaMode("stored")}
              />
            </View>
          ) : null}
        </View>
        <AppText variant="muted">
          {"【デフォルト動画】または【格納ファイル】どちらか選択してください。"}
        </AppText>
      </Card>

      <TrainingVideo
        key={mediaMode}
        onComplete={completeTraining}
        slides={mediaMode === "stored" ? trainingFiles : []}
      />

      <PrimaryButton
        title="廊下に戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/rooms")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />

      <Modal
        visible={trainingResult !== null}
        animationType="fade"
        transparent
        statusBarTranslucent
      >
        <ScrollView
          style={styles.completeScroll}
          contentContainerStyle={[
            styles.completeBackdrop,
            {
              paddingTop: Math.max(24, insets.top + 12),
              paddingBottom: Math.max(24, insets.bottom + 12),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.completeDialog}>
            <AppText style={styles.completeEvent}>TRAINING COMPLETE</AppText>
            <View style={styles.completePortrait}>
              <View style={styles.completeHair} />
              <View style={styles.completeFace} />
            </View>
            <AppText variant="subtitle">ニノ</AppText>
            <AppText style={styles.completeMessage}>
              {namedResultJudgement}
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
              <AppText>{namedResultJudgement}</AppText>
              <AppText variant="muted">調教日記へ保存しました。</AppText>
            </View>
            {trainingResult && trainingResult.elapsedSeconds < trainingResult.targetSeconds ? (
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
              title="廊下に戻る"
              tone="secondary"
              onPress={() => {
                setTrainingResult(null);
                router.replace("/(tabs)/rooms");
              }}
            />
            <PrimaryButton
              title="ホームへ戻る"
              tone="secondary"
              onPress={() => {
                setTrainingResult(null);
                router.replace("/(tabs)");
              }}
            />
          </View>
        </ScrollView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mediaChoices: {
    flexDirection: "row",
    gap: 8,
  },
  mediaChoice: {
    flex: 1,
  },
  completeBackdrop: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0,0,0,0.88)",
  },
  completeScroll: {
    flex: 1,
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
