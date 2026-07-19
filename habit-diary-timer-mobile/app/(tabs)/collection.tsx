import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Asset } from "expo-asset";
import * as MediaLibrary from "expo-media-library/legacy";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { useAppModal } from "@/components/AppModalProvider";
import { useAppAudio } from "@/audio/AudioProvider";
import {
  achievementMessages,
  findRewardMessage,
  formatConfiguredMessage,
  roomMessages,
} from "@/constants/messages";
import { achievementRepository } from "@/repositories/achievementRepository";
import {
  rewardRepository,
  type RewardRedemption,
} from "@/repositories/rewardRepository";
import {
  contractService,
  type ContractSettings,
} from "@/services/gameRoomService";
import {
  additionalContractRules,
  chastityContractRule,
  requiredContractRuleTexts,
} from "@/utils/contract";
import { secondsToClock } from "@/utils/date";

const rewardVideos = [
  { name: "準備動画", module: require("../../assets/videos/preparation_1.mp4") },
  { name: "調教動画 1", module: require("../../assets/videos/habits_1.mp4") },
  { name: "調教動画 2", module: require("../../assets/videos/habits_2.mp4") },
  { name: "調教動画 3", module: require("../../assets/videos/habits_3.mp4") },
  { name: "調教動画 4", module: require("../../assets/videos/habits_4.mp4") },
  { name: "調教動画 5", module: require("../../assets/videos/habits_5.mp4") },
  { name: "調教動画 6", module: require("../../assets/videos/habits_6.mp4") },
  { name: "お仕置き動画 1", module: require("../../assets/videos/timer_1.mp4") },
  { name: "お仕置き動画 2", module: require("../../assets/videos/timer_2.mp4") },
  { name: "契約成立動画", module: require("../../assets/videos/contract_1.mp4") },
] as const;

function contractDays(signedAt?: string) {
  if (!signedAt) return 0;
  const start = new Date(signedAt);
  if (Number.isNaN(start.getTime())) return 0;
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
}

function formatContractDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function unlockedTitles(contract: ContractSettings | null) {
  const value = achievementRepository.summary();
  const days = contractDays(contract?.signedAt);
  return [
    ...achievementMessages.training.map((achievement) => ({
      name: achievement.name,
      unlocked: value.trainingCount >= achievement.count,
    })),
    ...achievementMessages.punishment.map((achievement) => ({
      name: achievement.name,
      unlocked: value.punishmentMinutes >= achievement.minutes,
    })),
    ...achievementMessages.management.map((achievement) => ({
      name: achievement.name,
      unlocked: value.managementDays >= achievement.days,
    })),
    ...achievementMessages.contract.map((achievement) => ({
      name: achievement.name,
      unlocked: days >= achievement.days,
    })),
  ].filter((title) => title.unlocked);
}

export default function CollectionScreen() {
  const { settings } = useAppAudio();
  const playerName = settings?.playerName.trim() ?? "";
  const [rewards, setRewards] = useState<RewardRedemption[]>([]);
  const [contract, setContract] = useState<ContractSettings | null>(null);

  const load = useCallback(() => {
    setRewards(rewardRepository.acquired());
    contractService.load().then(setContract);
  }, []);
  useFocusEffect(load);

  const videos = rewards.filter((item) => item.reward_key === "video");
  const praises = rewards.filter((item) => item.reward_key === "praise");
  const insults = rewards.filter((item) => item.reward_key === "insult");
  const others = rewards.filter(
    (item) => !["video", "praise", "insult"].includes(item.reward_key),
  );
  const titles = unlockedTitles(contract);
  const achievements = achievementRepository.summary();

  return (
    <Screen>
      <AppText variant="title">コレクション部屋</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/diary-nino.png")}
        roomName="コレクション部屋"
        lines={roomMessages.collection.lines}
        contractLines={roomMessages.collection.contractLines}
      />

      <CollectionSection title="獲得済み動画" empty={videos.length === 0}>
        {videos.map((item) => (
          <CollectionVideo key={item.id} item={item} />
        ))}
      </CollectionSection>

      <CollectionSection title="称賛コメント" empty={praises.length === 0}>
        {praises.map((item) => (
          <RewardText
            key={item.id}
            text={formatRewardText(item, playerName)}
          />
        ))}
      </CollectionSection>

      <CollectionSection title="罵倒コメント" empty={insults.length === 0}>
        {insults.map((item) => (
          <RewardText key={item.id} text={formatRewardText(item, playerName)} />
        ))}
      </CollectionSection>

      {others.length > 0 ? (
        <CollectionSection title="その他のご褒美" empty={false}>
          {others.map((item) => (
            <RewardText key={item.id} text={formatRewardText(item, playerName)} />
          ))}
        </CollectionSection>
      ) : null}

      <CollectionSection title="獲得済み称号" empty={titles.length === 0}>
        {titles.map((title) => (
          <View key={title.name} style={styles.collectionRow}>
            <AppText style={styles.titleText}>🏆 {title.name}</AppText>
          </View>
        ))}
      </CollectionSection>

      <Card style={styles.achievementCard}>
        <AppText variant="subtitle">調教時間の実績</AppText>
        <View style={styles.achievementTimes}>
          <View style={styles.achievementTimeItem}>
            <AppText variant="muted">調教最速</AppText>
            <AppText style={styles.achievementTimeValue}>
              {achievements.bestTrainingSeconds === null
                ? "未記録"
                : secondsToClock(achievements.bestTrainingSeconds)}
            </AppText>
          </View>
          <View style={styles.achievementTimeItem}>
            <AppText variant="muted">調教最長</AppText>
            <AppText style={styles.achievementTimeValue}>
              {achievements.longestTrainingSeconds === null
                ? "未記録"
                : secondsToClock(achievements.longestTrainingSeconds)}
            </AppText>
          </View>
        </View>
      </Card>

      <Card style={styles.contractCard}>
        <AppText variant="subtitle">契約書・契約ルール</AppText>
        {contract?.signedAt ? (
          <>
            <AppText>契約日：{formatContractDate(contract.signedAt)}</AppText>
            <AppText>契約者：{contract.signature ?? "-"}</AppText>
            <AppText>契約日数：{contractDays(contract.signedAt)}日</AppText>
            {requiredContractRuleTexts.map((rule) => (
              <AppText key={rule}>・{rule}</AppText>
            ))}
            {contract.allowChastity ? <AppText>・{chastityContractRule}</AppText> : null}
            <View style={styles.ruleDivider} />
            <AppText variant="label">契約上の追加ルール</AppText>
            {additionalContractRules(contract).map((rule) => (
              <AppText key={rule}>・{rule}</AppText>
            ))}
          </>
        ) : (
          <AppText variant="muted">契約はまだ成立していません。</AppText>
        )}
      </Card>

      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

function CollectionSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Card style={styles.collectionCard}>
      <AppText variant="subtitle">{title}</AppText>
      {empty ? <AppText variant="muted">まだ獲得していません。</AppText> : children}
    </Card>
  );
}

function RewardText({ text }: { text: string }) {
  return (
    <View style={styles.collectionRow}>
      <AppText>{text}</AppText>
    </View>
  );
}

function formatRewardText(item: RewardRedemption, playerName: string) {
  const text = item.reward_content ?? "";
  const message = findRewardMessage(item.reward_key, text);
  return message ? formatConfiguredMessage(message, playerName) : text;
}

function CollectionVideo({ item }: { item: RewardRedemption }) {
  const insets = useSafeAreaInsets();
  const { showNotice } = useAppModal();
  const [visible, setVisible] = useState(false);
  const bundled = rewardVideos.find((video) => video.name === item.reward_content);
  const player = useVideoPlayer(bundled?.module ?? null, (instance) => {
    instance.loop = true;
  });

  useEffect(() => {
    if (visible) player.play();
    else player.pause();
  }, [player, visible]);

  async function save() {
    try {
      if (!bundled) throw new Error("同梱動画が見つかりません。");
      const permission = await MediaLibrary.requestPermissionsAsync(true, ["video"]);
      if (!permission.granted) {
        showNotice(
          "保存権限が必要です",
          "動画を保存するには、写真と動画への保存を許可してください。",
        );
        return;
      }
      const asset = Asset.fromModule(bundled.module);
      await asset.downloadAsync();
      await MediaLibrary.saveToLibraryAsync(asset.localUri ?? asset.uri);
      showNotice("保存完了", "動画を端末のギャラリーへ保存しました。");
    } catch (error) {
      showNotice(
        "動画を保存できません",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return (
    <View style={styles.collectionRow}>
      <AppText style={styles.videoName}>{item.reward_content}</AppText>
      <View style={styles.videoActions}>
        <PrimaryButton
          title="再生"
          disabled={!bundled}
          onPress={() => setVisible(true)}
        />
        <PrimaryButton
          title="保存"
          tone="secondary"
          disabled={!bundled}
          onPress={save}
        />
      </View>
      <Modal
        visible={visible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setVisible(false)}
      >
        <View
          style={[
            styles.videoModal,
            {
              paddingTop: Math.max(12, insets.top),
              paddingBottom: Math.max(12, insets.bottom),
            },
          ]}
        >
          <VideoView
            player={player}
            style={styles.video}
            nativeControls
            contentFit="contain"
          />
          <PrimaryButton
            title="閉じる"
            tone="secondary"
            onPress={() => setVisible(false)}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  collectionCard: { borderColor: "#f2c94c" },
  contractCard: { borderColor: "#b875ff" },
  achievementCard: { borderColor: "#f2c94c" },
  achievementTimes: { flexDirection: "row", gap: 10 },
  achievementTimeItem: {
    flex: 1,
    gap: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: "#555",
  },
  achievementTimeValue: { color: "#f2c94c", fontSize: 22, lineHeight: 30, fontWeight: "900" },
  collectionRow: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingVertical: 10,
  },
  titleText: { color: "#f2c94c", fontWeight: "900" },
  videoName: { fontWeight: "900" },
  videoActions: { flexDirection: "row", gap: 8 },
  ruleDivider: { height: 1, backgroundColor: "#555" },
  videoModal: {
    flex: 1,
    gap: 10,
    paddingHorizontal: 10,
    backgroundColor: "#000",
  },
  video: { flex: 1, width: "100%", backgroundColor: "#000" },
});
