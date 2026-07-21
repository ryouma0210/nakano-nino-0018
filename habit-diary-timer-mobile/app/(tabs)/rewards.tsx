import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Asset } from "expo-asset";
import * as MediaLibrary from "expo-media-library/legacy";
import * as FileSystem from "expo-file-system/legacy";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import {
  rewardCatalog,
  rewardRepository,
  pointRepository,
  type RandomRewardKey,
  type RewardRedemption,
} from "@/repositories/rewardRepository";
import { useAppModal } from "@/components/AppModalProvider";
import { useAppAudio } from "@/audio/AudioProvider";
import {
  findRewardMessage,
  formatConfiguredMessage,
  roomMessages,
} from "@/constants/messages";

const rewardVideos = [
  {
    name: "準備動画",
    fileName: "nino-preparation.mp4",
    module: require("../../assets/videos/preparation_1.mp4"),
  },
  { name: "調教動画 1", fileName: "nino-training-01.mp4", module: require("../../assets/videos/habits_1.mp4") },
  { name: "調教動画 2", fileName: "nino-training-02.mp4", module: require("../../assets/videos/habits_2.mp4") },
  { name: "調教動画 3", fileName: "nino-training-03.mp4", module: require("../../assets/videos/habits_3.mp4") },
  { name: "調教動画 4", fileName: "nino-training-04.mp4", module: require("../../assets/videos/habits_4.mp4") },
  { name: "調教動画 5", fileName: "nino-training-05.mp4", module: require("../../assets/videos/habits_5.mp4") },
  { name: "調教動画 6", fileName: "nino-training-06.mp4", module: require("../../assets/videos/habits_6.mp4") },
  { name: "お仕置き動画 1", fileName: "nino-punishment-01.mp4", module: require("../../assets/videos/timer_1.mp4") },
  { name: "お仕置き動画 2", fileName: "nino-punishment-02.mp4", module: require("../../assets/videos/timer_2.mp4") },
  {
    name: "契約成立動画",
    fileName: "nino-contract.mp4",
    module: require("../../assets/videos/contract_1.mp4"),
  },
] as const;

async function bundledVideoUri(module: number) {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

async function saveVideoToLibrary(uri: string, fileName: string) {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ["video"]);
  if (!permission.granted) return false;
  const namedUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.deleteAsync(namedUri, { idempotent: true });
  await FileSystem.copyAsync({ from: uri, to: namedUri });
  await MediaLibrary.saveToLibraryAsync(namedUri);
  return true;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function RewardsScreen() {
  const { showNotice } = useAppModal();
  const { settings } = useAppAudio();
  const playerName = settings?.playerName.trim() ?? "";
  const [balance, setBalance] = useState(() => rewardRepository.balance());
  const [acquired, setAcquired] = useState<RewardRedemption[]>(() =>
    rewardRepository.acquired(),
  );
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const reload = useCallback(() => {
    setBalance(rewardRepository.balance());
    setAcquired(rewardRepository.acquired());
  }, []);
  useFocusEffect(reload);
  useEffect(() => pointRepository.subscribe(reload), [reload]);
  const acquiredVideoNames = new Set(
    acquired
      .filter((item) => item.reward_key === "video")
      .map((item) => item.reward_content)
      .filter((name): name is string => Boolean(name)),
  );
  const availableRewardVideos = rewardVideos.filter(
    (video) => !acquiredVideoNames.has(video.name),
  );
  const voiceAcquired = acquired.some((item) => item.reward_key === "voice");

  function exchangeRandom(key: RandomRewardKey) {
    const reward = rewardCatalog[key];
    setConfirmation({
      title: "ご褒美を交換しますか？",
      message: `${reward.name}\n\n${reward.cost}ptを消費します。交換後の内容は獲得済み一覧からいつでも確認できます。`,
      onConfirm: () => {
        const content = rewardRepository.redeemRandom(key);
        if (!content) {
          showNotice(
            "交換できません",
            rewardRepository.remaining(key).length === 0
              ? "このご褒美は全種類獲得済みです。"
              : "ポイントが足りません。",
          );
          return;
        }
        reload();
        showNotice(
          "ご褒美獲得♡",
          findRewardMessage(key, content)
            ? formatConfiguredMessage(findRewardMessage(key, content)!, playerName)
            : content,
        );
      },
    });
  }

  function exchangeSecret() {
    const reward = rewardCatalog.secret;
    setConfirmation({
      title: "秘密のご褒美を交換しますか？",
      message: `${reward.cost}ptを消費します。\n\nポイントがあれば何度でも交換できます。`,
      onConfirm: () => {
        const content = rewardRepository.redeemSecret();
        if (!content)
          return showNotice("ポイント不足", "所持ポイントが足りません。");
        reload();
        showNotice("秘密のご褒美♡", content);
      },
    });
  }

  function exchangeVoice() {
    const reward = rewardCatalog.voice;
    setConfirmation({
      title: "好きボイス3秒と交換しますか？",
      message: `${reward.cost}ptを消費します。\n\n交換後はコレクション部屋からいつでも再生できます。映像は表示されません。`,
      onConfirm: () => {
        if (!rewardRepository.redeemVoice()) {
          return showNotice(
            "交換できません",
            rewardRepository.hasRedeemed("voice")
              ? "このボイスは交換済みです。"
              : "所持ポイントが足りません。",
          );
        }
        reload();
        showNotice("ボイス獲得♡", "好きボイス3秒を獲得しました。コレクション部屋で再生できます。");
      },
    });
  }

  function exchangeVideo(video: (typeof rewardVideos)[number]) {
    const reward = rewardCatalog.video;
    setConfirmation({
      title: "この動画と交換しますか？",
      message: `${video.name}\n\n${reward.cost}ptを消費します。交換後、動画を端末のギャラリーへ直接保存します。`,
      onConfirm: async () => {
        try {
          const uri = await bundledVideoUri(video.module);
          if (!rewardRepository.redeemVideo(video.name))
            return showNotice("ポイント不足", "所持ポイントが足りません。");
          reload();
          if (await saveVideoToLibrary(uri, video.fileName)) {
            showNotice("動画を獲得しました♡", "端末のギャラリーへ保存しました。");
          } else {
            showNotice(
              "保存権限が必要です",
              "動画を直接保存するには、写真と動画への保存を許可してください。",
            );
          }
        } catch (error) {
          showNotice(
            "動画を準備できません",
            `動画の読み込みまたは保存に失敗しました。\n\n${getErrorMessage(error)}`,
          );
        }
      },
    });
  }

  return (
    <Screen>
      <AppText variant="title">ご褒美</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/home-nino.png")}
        roomName="ご褒美"
        lines={roomMessages.rewards.lines}
        contractLines={roomMessages.rewards.contractLines}
      />
      <Card>
        <AppText variant="label">所持ポイント</AppText>
        <AppText variant="title">{balance.available} pt</AppText>
        <View style={styles.summaryRow}>
          <AppText variant="muted">累計獲得 {balance.earned}pt</AppText>
          <AppText variant="muted">累計消費 {balance.spent}pt</AppText>
        </View>
        {balance.stgBonus > 0 ? (
          <AppText style={styles.stg}>STGテストポイント：99,999pt</AppText>
        ) : null}
        <AppText variant="muted">
          本日の命令完了＝1pt／本日初回の調教完了＝5pt／射精管理の本日の命令完了＝10pt
        </AppText>
      </Card>

      {(["insult", "praise"] as const).map((key) => {
        const reward = rewardCatalog[key];
        const remaining = rewardRepository.remaining(key).length;
        if (remaining === 0) return null;
        return (
          <Card key={key}>
            <AppText variant="subtitle">{reward.name}</AppText>
            <AppText variant="muted">
              消費：{reward.cost}pt／未獲得：{remaining}種類
            </AppText>
            <PrimaryButton
              title={
                balance.available >= reward.cost
                  ? `${reward.cost}ptでランダム交換`
                  : `あと${reward.cost - balance.available}pt`
              }
              disabled={balance.available < reward.cost}
              onPress={() => exchangeRandom(key)}
            />
          </Card>
        );
      })}

      {availableRewardVideos.length > 0 ? (
        <Card>
          <AppText variant="subtitle">{rewardCatalog.video.name}</AppText>
          <AppText variant="muted">
            消費：500pt／アプリに同梱された動画を1つ選んで端末へ書き出します。
          </AppText>
          {availableRewardVideos.map((video) => (
            <View key={video.name} style={styles.videoRow}>
              <AppText style={styles.grow}>{video.name}</AppText>
              <PrimaryButton
                title="交換"
                disabled={balance.available < 500}
                onPress={() => exchangeVideo(video)}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {rewardRepository.remaining("brutal").length > 0 ? (
        <Card>
          <AppText variant="subtitle">{rewardCatalog.brutal.name}</AppText>
          <AppText variant="muted">
            消費：{rewardCatalog.brutal.cost}pt／未獲得：
            {rewardRepository.remaining("brutal").length}種類
          </AppText>
          <PrimaryButton
            title={
              balance.available >= rewardCatalog.brutal.cost
                ? `${rewardCatalog.brutal.cost}ptでランダム交換`
                : `あと${rewardCatalog.brutal.cost - balance.available}pt`
            }
            disabled={balance.available < rewardCatalog.brutal.cost}
            onPress={() => exchangeRandom("brutal")}
          />
        </Card>
      ) : null}

      {!voiceAcquired ? (
        <Card>
          <AppText variant="subtitle">{rewardCatalog.voice.name}</AppText>
          <AppText variant="muted">
            消費：5,000pt／映像なしのボイスご褒美です。
          </AppText>
          <PrimaryButton
            title={
              balance.available >= rewardCatalog.voice.cost
                ? "5000ptで交換"
                : `あと${rewardCatalog.voice.cost - balance.available}pt`
            }
            disabled={balance.available < rewardCatalog.voice.cost}
            onPress={exchangeVoice}
          />
        </Card>
      ) : null}

      <Card>
        <AppText variant="subtitle">{rewardCatalog.secret.name}</AppText>
        <AppText variant="muted">
          消費：10,000pt／ポイントがあれば何度でも交換できます。
        </AppText>
        <PrimaryButton
          title={
            balance.available >= 10000
              ? "10000ptで交換"
              : `あと${10000 - balance.available}pt`
          }
          disabled={balance.available < 10000}
          onPress={exchangeSecret}
        />
      </Card>

      <PrimaryButton
        title="記録・管理メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
      <ConfirmModal
        visible={confirmation !== null}
        title={confirmation?.title ?? "確認"}
        message={confirmation?.message ?? ""}
        confirmLabel="交換する"
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const action = confirmation?.onConfirm;
          setConfirmation(null);
          action?.();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  stg: { color: "#ff4b55", fontWeight: "900" },
  videoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingVertical: 10,
  },
  grow: { flex: 1 },
});
