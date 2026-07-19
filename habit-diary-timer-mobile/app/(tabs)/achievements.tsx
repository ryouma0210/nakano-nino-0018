import { useEffect, useState } from "react";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { achievementRepository } from "@/repositories/achievementRepository";
import { contractService } from "@/services/gameRoomService";

function contractDays(signedAt: string | null) {
  if (!signedAt) return 0;
  const signedDate = new Date(signedAt);
  if (Number.isNaN(signedDate.getTime())) return 0;
  signedDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today.getTime() - signedDate.getTime()) / 86400000) + 1);
}

export default function AchievementsScreen() {
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const value = achievementRepository.summary();
  const signedDays = contractDays(signedAt);

  useEffect(() => {
    let active = true;
    contractService.load().then((contract) => {
      if (active) setSignedAt(contract.signedAt ?? null);
    });
    return () => { active = false; };
  }, []);

  const titles = [
    {
      name: "調教入門",
      unlocked: value.bestTrainingSeconds !== null,
      condition: "調教を1回完了",
    },
    {
      name: "お仕置き耐性",
      unlocked: value.punishmentMinutes >= 30,
      condition: "お仕置き累計30分",
    },
    {
      name: "管理生活",
      unlocked: value.managementDays >= 7,
      condition: "射精管理累計7日",
    },
    {
      name: "長期管理",
      unlocked: value.managementDays >= 30,
      condition: "射精管理累計30日",
    },
  ];
  const contractTitles = [
    {
      name: "二ノ様との契約",
      unlocked: signedDays >= 1,
      condition: "契約部屋で契約を成立",
    },
    {
      name: "服従の一週間",
      unlocked: signedDays >= 7,
      condition: "契約成立から7日経過",
    },
    {
      name: "従順な奴隷",
      unlocked: signedDays >= 30,
      condition: "契約成立から30日経過",
    },
    {
      name: "優秀な奴隷",
      unlocked: signedDays >= 100,
      condition: "契約成立から100日経過",
    },
    {
      name: "永遠の契約者",
      unlocked: signedDays >= 365,
      condition: "契約成立から365日経過",
    },
  ];
  return (
    <Screen>
      <AppText variant="title">称号・実績部屋</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/diary-nino.png")}
        roomName="称号・実績部屋"
        lines={[
          { text: "積み重ねた結果を見せてあげる。" },
          { text: "未獲得の称号も、条件を満たせば解放よ。" },
        ]}
        contractLines={[
          { text: "契約後の実績は、あなたがどれだけ従順な奴隷かを示す証拠よ♡" },
        ]}
      />
      <Card>
        <AppText variant="subtitle">現在の実績</AppText>
        <AppText>
          お仕置き：{value.punishmentMinutes}分 {value.punishmentSeconds % 60}秒
        </AppText>
        <AppText>
          調教最速：
          {value.bestTrainingSeconds === null
            ? "未記録"
            : `${value.bestTrainingSeconds}秒`}
        </AppText>
        <AppText>射精管理：{value.managementDays}日</AppText>
      </Card>
      {titles.map((title) => (
        <Card key={title.name}>
          <AppText variant="subtitle">
            {title.unlocked ? "🏆" : "🔒"} {title.name}
          </AppText>
          <AppText variant="muted">{title.condition}</AppText>
        </Card>
      ))}
      <AppText variant="subtitle">契約後の実績</AppText>
      <Card>
        <AppText>
          契約状態：{signedAt ? `契約 ${signedDays}日目` : "未契約"}
        </AppText>
        <AppText variant="muted">契約成立後、経過日数に応じて解放されます。</AppText>
      </Card>
      {contractTitles.map((title) => (
        <Card key={title.name}>
          <AppText variant="subtitle">
            {title.unlocked ? "🏆" : "🔒"} {title.name}
          </AppText>
          <AppText variant="muted">{title.condition}</AppText>
        </Card>
      ))}
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}
