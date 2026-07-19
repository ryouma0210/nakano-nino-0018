import { useCallback, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Asset } from "expo-asset";
import * as MediaLibrary from "expo-media-library/legacy";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import {
  rewardCatalog,
  rewardRepository,
  type RandomRewardKey,
  type RewardRedemption,
} from "@/repositories/rewardRepository";

const rewardVideos = [
  {
    name: "準備動画",
    module: require("../../assets/videos/preparation_1.mp4"),
  },
  { name: "調教動画 1", module: require("../../assets/videos/habits_1.mp4") },
  { name: "調教動画 2", module: require("../../assets/videos/habits_2.mp4") },
  { name: "調教動画 3", module: require("../../assets/videos/habits_3.mp4") },
  { name: "調教動画 4", module: require("../../assets/videos/habits_4.mp4") },
  { name: "調教動画 5", module: require("../../assets/videos/habits_5.mp4") },
  { name: "調教動画 6", module: require("../../assets/videos/habits_6.mp4") },
  { name: "お仕置き動画 1", module: require("../../assets/videos/timer_1.mp4") },
  { name: "お仕置き動画 2", module: require("../../assets/videos/timer_2.mp4") },
  {
    name: "契約成立動画",
    module: require("../../assets/videos/contract_1.mp4"),
  },
] as const;

async function bundledVideoUri(module: number) {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

async function saveVideoToLibrary(uri: string) {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ["video"]);
  if (!permission.granted) {
    Alert.alert(
      "保存権限が必要です",
      "動画を直接保存するには、写真と動画への保存を許可してください。",
    );
    return false;
  }
  await MediaLibrary.saveToLibraryAsync(uri);
  return true;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function RewardsScreen() {
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
  const acquiredVideoNames = new Set(
    acquired
      .filter((item) => item.reward_key === "video")
      .map((item) => item.reward_content)
      .filter((name): name is string => Boolean(name)),
  );
  const availableRewardVideos = rewardVideos.filter(
    (video) => !acquiredVideoNames.has(video.name),
  );

  function exchangeRandom(key: RandomRewardKey) {
    const reward = rewardCatalog[key];
    setConfirmation({
      title: "ご褒美を交換しますか？",
      message: `${reward.name}\n\n${reward.cost}ptを消費します。交換後の内容は獲得済み一覧からいつでも確認できます。`,
      onConfirm: () => {
        const content = rewardRepository.redeemRandom(key);
        if (!content) {
          Alert.alert(
            "交換できません",
            rewardRepository.remaining(key).length === 0
              ? "このご褒美は全種類獲得済みです。"
              : "ポイントが足りません。",
          );
          return;
        }
        reload();
        Alert.alert("ご褒美獲得♡", content);
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
          return Alert.alert("ポイント不足", "所持ポイントが足りません。");
        reload();
        Alert.alert("秘密のご褒美♡", content);
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
            return Alert.alert("ポイント不足", "所持ポイントが足りません。");
          reload();
          if (await saveVideoToLibrary(uri)) {
            Alert.alert("動画を獲得しました♡", "端末のギャラリーへ保存しました。");
          }
        } catch (error) {
          Alert.alert(
            "動画を準備できません",
            `動画の読み込みまたは保存に失敗しました。\n\n${getErrorMessage(error)}`,
          );
        }
      },
    });
  }

  async function exportVideo(item: RewardRedemption) {
    try {
      const bundled = rewardVideos.find(
        (video) => video.name === item.reward_content,
      );
      const uri = bundled
        ? await bundledVideoUri(bundled.module)
        : item.file_uri;
      if (!uri) throw new Error("Video not found");
      if (await saveVideoToLibrary(uri)) {
        Alert.alert("保存完了", "動画を端末のギャラリーへ保存しました。");
      }
    } catch (error) {
      Alert.alert(
        "動画を保存できません",
        `同梱動画の読み込みまたは端末への保存に失敗しました。\n\n${getErrorMessage(error)}`,
      );
    }
  }

  return (
    <Screen>
      <AppText variant="title">ご褒美</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/home-nino.png")}
        roomName="ご褒美"
        lines={[
          { text: "命令を達成した分だけポイントをあげる。" },
          { text: "貯めたポイントで、好きなご褒美を選びなさい♡" },
        ]}
        contractLines={[
          { text: "契約した奴隷にも、ご主人様からのご褒美は必要よね♡" },
        ]}
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

      {(["insult", "praise", "brutal"] as const).map((key) => {
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

      {acquired.length > 0 ? (
        <Card style={styles.acquiredCard}>
          <AppText variant="subtitle">獲得済みのご褒美</AppText>
          {acquired.map((item) => (
            <View key={item.id} style={styles.acquiredRow}>
              <View style={styles.grow}>
                <AppText style={styles.acquiredContent}>
                  {item.reward_content}
                </AppText>
                <AppText style={styles.acquiredMeta}>
                  {item.reward_name} / 使用：{item.points_spent}pt
                </AppText>
              </View>
              {item.reward_key === "video" ? (
                <PrimaryButton
                  title="保存"
                  tone="secondary"
                  onPress={() => exportVideo(item)}
                />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}
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
  acquiredCard: { borderWidth: 2, borderColor: "#ffd54a" },
  acquiredRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingVertical: 12,
  },
  acquiredContent: { fontSize: 16, lineHeight: 24, fontWeight: "800" },
  acquiredMeta: { color: "#888", fontSize: 11, lineHeight: 17 },
  grow: { flex: 1 },
});
