import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { achievementRepository } from "@/repositories/achievementRepository";

export default function AchievementsScreen() {
  const value = achievementRepository.summary();
  const titles = [
    { name: "調教入門", unlocked: value.bestTrainingSeconds !== null, condition: "調教を1回完了" },
    { name: "お仕置き耐性", unlocked: value.punishmentMinutes >= 30, condition: "お仕置き累計30分" },
    { name: "管理生活", unlocked: value.managementDays >= 7, condition: "射精管理累計7日" },
    { name: "長期管理", unlocked: value.managementDays >= 30, condition: "射精管理累計30日" },
  ];
  return (
    <Screen>
      <AppText variant="title">称号・実績部屋</AppText>
      <RoomConversation characterSource={require("../../assets/characters/diary-nino.png")} roomName="称号・実績部屋" lines={[{ text: "積み重ねた結果を見せてあげる。" }, { text: "未獲得の称号も、条件を満たせば解放よ。" }]} />
      <Card><AppText variant="subtitle">現在の実績</AppText><AppText>お仕置き：{value.punishmentMinutes}分 {value.punishmentSeconds % 60}秒</AppText><AppText>調教最速：{value.bestTrainingSeconds === null ? "未記録" : `${value.bestTrainingSeconds}秒`}</AppText><AppText>射精管理：{value.managementDays}日</AppText></Card>
      {titles.map((title) => <Card key={title.name}><AppText variant="subtitle">{title.unlocked ? "🏆" : "🔒"} {title.name}</AppText><AppText variant="muted">{title.condition}</AppText></Card>)}
      <PrimaryButton title="ホームへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)")} />
    </Screen>
  );
}
