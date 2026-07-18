import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { achievementRepository } from "@/repositories/achievementRepository";

export default function RewardsScreen() {
  const value = achievementRepository.summary();
  const points = value.punishmentMinutes + value.managementDays * 10 + (value.bestTrainingSeconds === null ? 0 : 20);
  const rewards = [
    { points: 10, name: "特別コメント解放" },
    { points: 50, name: "ご褒美画像枠解放" },
    { points: 100, name: "スペシャルBGM解放" },
  ];
  return (
    <Screen>
      <AppText variant="title">ご褒美部屋</AppText>
      <RoomConversation characterSource={require("../../assets/characters/home-nino.png")} roomName="ご褒美部屋" lines={[{ text: "頑張った分だけ、ご褒美を用意してあげる。" }, { text: "実績を増やして、全部解放して。" }]} />
      <Card><AppText variant="label">所持ポイント</AppText><AppText variant="title">{points} pt</AppText><AppText variant="muted">お仕置き1分＝1pt、射精管理1日＝10pt、初回調教完了＝20pt</AppText></Card>
      {rewards.map((reward) => <Card key={reward.name}><AppText variant="subtitle">{points >= reward.points ? "🎁 解放済み" : "🔒 未解放"}</AppText><AppText>{reward.name}</AppText><AppText variant="muted">必要：{reward.points} pt</AppText></Card>)}
      <PrimaryButton title="ファイルを鑑賞する" onPress={() => router.push("/(tabs)/files")} />
      <PrimaryButton title="ホームへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)")} />
    </Screen>
  );
}
