import { useEffect, useState } from "react";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { dailyOrderService, type DailyOrder } from "@/services/gameRoomService";
import { formatDateJa, toDateKey } from "@/utils/date";
import { useAppAudio } from "@/audio/AudioProvider";

export default function OrdersScreen() {
  const { settings } = useAppAudio();
  const playerName = settings?.playerName.trim() ?? "";
  const [order, setOrder] = useState<DailyOrder | null>(null);
  useEffect(() => {
    dailyOrderService.load().then(setOrder);
  }, []);
  return (
    <Screen>
      <AppText variant="title">本日の命令部屋</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/orders-nino.png")}
        roomName="本日の命令部屋"
        lines={[
          { text: "今日の命令は一度だけ抽選できるわ。" },
          { text: "決まったら、最後まで実行して。" },
        ]}
        contractLines={[
          { text: "契約したんだから、どんな命令でも絶対服従でしょ。返事は『はい、二ノ様』でしょ♡"},
        ]}
      />
      <Card>
        <AppText variant="label">{formatDateJa(toDateKey())}</AppText>
        {order ? (
          <>
            <AppText variant="subtitle">本日の命令</AppText>
            <AppText>
              {playerName ? `${playerName}、${order.text}` : order.text}
            </AppText>
            <PrimaryButton
              title={order.completed ? "完了済み" : "命令完了"}
              disabled={order.completed}
              onPress={() => dailyOrderService.complete(order).then(setOrder)}
            />
          </>
        ) : (
          <PrimaryButton
            title="本日の命令を抽選"
            onPress={() => dailyOrderService.draw().then(setOrder)}
          />
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
