import { useCallback, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { rewardCatalog, rewardRepository, type RandomRewardKey, type RewardRedemption } from "@/repositories/rewardRepository";
import { fileStorageService, type StoredFile } from "@/services/fileStorageService";

export default function RewardsScreen() {
  const [balance, setBalance] = useState(() => rewardRepository.balance());
  const [acquired, setAcquired] = useState<RewardRedemption[]>(() => rewardRepository.acquired());
  const [videos, setVideos] = useState<StoredFile[]>([]);
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const reload = useCallback(() => {
    setBalance(rewardRepository.balance());
    setAcquired(rewardRepository.acquired());
    fileStorageService.list().then((files) => setVideos(files.filter((file) => /\.(mp4|mov|m4v|webm)$/i.test(file.name))));
  }, []);
  useFocusEffect(reload);

  function exchangeRandom(key: RandomRewardKey) {
    const reward = rewardCatalog[key];
    setConfirmation({
      title: "ご褒美を交換しますか？",
      message: `${reward.name}\n\n${reward.cost}ptを消費します。交換後の内容は獲得済み一覧からいつでも確認できます。`,
      onConfirm: () => {
        const content = rewardRepository.redeemRandom(key);
        if (!content) {
          Alert.alert("交換できません", rewardRepository.remaining(key).length === 0 ? "このご褒美は全種類獲得済みです。" : "ポイントが足りません。");
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
        if (!content) return Alert.alert("ポイント不足", "所持ポイントが足りません。");
        reload();
        Alert.alert("秘密のご褒美♡", content);
      },
    });
  }

  function exchangeVideo(file: StoredFile) {
    const reward = rewardCatalog.video;
    setConfirmation({
      title: "この動画と交換しますか？",
      message: `${file.name}\n\n${reward.cost}ptを消費します。交換後に端末の共有・保存画面を開きます。`,
      onConfirm: async () => {
        if (!rewardRepository.redeemVideo(file.name, file.uri)) return Alert.alert("ポイント不足", "所持ポイントが足りません。");
        reload();
        Alert.alert("動画を獲得しました♡", "端末の共有・保存画面を開きます。");
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { dialogTitle: "ご褒美動画を保存" });
      },
    });
  }

  async function exportVideo(item: RewardRedemption) {
    if (!item.file_uri) return;
    try {
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(item.file_uri, { dialogTitle: "ご褒美動画を保存" });
    } catch {
      Alert.alert("動画を開けません", "ファイル格納から元の動画が削除されています。");
    }
  }

  return (
    <Screen>
      <AppText variant="title">ご褒美</AppText>
      <RoomConversation characterSource={require("../../assets/characters/home-nino.png")} roomName="ご褒美" lines={[{ text: "命令を達成した分だけポイントをあげる。" }, { text: "貯めたポイントで、好きなご褒美を選びなさい♡" }]} />
      <Card>
        <AppText variant="label">所持ポイント</AppText>
        <AppText variant="title">{balance.available} pt</AppText>
        <View style={styles.summaryRow}><AppText variant="muted">累計獲得 {balance.earned}pt</AppText><AppText variant="muted">累計消費 {balance.spent}pt</AppText></View>
        {balance.stgBonus > 0 ? <AppText style={styles.stg}>STGテストポイント：99,999pt</AppText> : null}
        <AppText variant="muted">本日の命令完了＝1pt／本日初回の調教完了＝5pt／射精管理の本日の命令完了＝10pt</AppText>
      </Card>

      {(["insult", "praise", "brutal"] as const).map((key) => {
        const reward = rewardCatalog[key];
        const remaining = rewardRepository.remaining(key).length;
        if (remaining === 0) return null;
        return (
          <Card key={key}>
            <AppText variant="subtitle">{reward.name}</AppText>
            <AppText variant="muted">消費：{reward.cost}pt／未獲得：{remaining}種類</AppText>
            <PrimaryButton title={balance.available >= reward.cost ? `${reward.cost}ptでランダム交換` : `あと${reward.cost - balance.available}pt`} disabled={balance.available < reward.cost} onPress={() => exchangeRandom(key)} />
          </Card>
        );
      })}

      <Card>
        <AppText variant="subtitle">{rewardCatalog.video.name}</AppText>
        <AppText variant="muted">消費：500pt／格納動画を1つ選んで端末へ書き出します。</AppText>
        {videos.length === 0 ? <AppText variant="muted">ファイル格納に動画がありません。</AppText> : videos.map((file) => (
          <View key={file.uri} style={styles.videoRow}>
            <AppText style={styles.grow}>{file.name}</AppText>
            <PrimaryButton title="交換" disabled={balance.available < 500} onPress={() => exchangeVideo(file)} />
          </View>
        ))}
      </Card>

      <Card>
        <AppText variant="subtitle">{rewardCatalog.secret.name}</AppText>
        <AppText variant="muted">消費：10,000pt／ポイントがあれば何度でも交換できます。</AppText>
        <PrimaryButton title={balance.available >= 10000 ? "10000ptで交換" : `あと${10000 - balance.available}pt`} disabled={balance.available < 10000} onPress={exchangeSecret} />
      </Card>

      {acquired.length > 0 ? (
        <Card>
          <AppText variant="subtitle">獲得済みのご褒美</AppText>
          {acquired.map((item) => (
            <View key={item.id} style={styles.acquiredRow}>
              <View style={styles.grow}>
                <AppText variant="label">{item.reward_name}</AppText>
                <AppText>{item.reward_content}</AppText>
                <AppText variant="muted">使用：{item.points_spent}pt</AppText>
              </View>
              {item.file_uri ? <PrimaryButton title="保存" tone="secondary" onPress={() => exportVideo(item)} /> : null}
            </View>
          ))}
        </Card>
      ) : null}
      <PrimaryButton title="ホームへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)")} />
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
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  stg: { color: "#ff4b55", fontWeight: "900" },
  videoRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "#444", paddingVertical: 10 },
  acquiredRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "#444", paddingVertical: 12 },
  grow: { flex: 1 },
});
