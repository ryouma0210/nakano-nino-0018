import { useEffect, useState } from "react";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import {
  findDailyOrderMessage,
  formatConfiguredMessage,
  roomMessages,
} from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { dailyOrderService, type DailyOrder } from "@/services/gameRoomService";
import { formatDateJa, toDateKey } from "@/utils/date";
import { useAppAudio } from "@/audio/AudioProvider";
import { useAppModal } from "@/components/AppModalProvider";

export default function OrdersScreen() {
  const { settings } = useAppAudio();
  const { showError } = useAppModal();
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
        lines={roomMessages.orders.lines}
        contractLines={roomMessages.orders.contractLines}
      />
      <Card>
        <AppText variant="label">{formatDateJa(toDateKey())}</AppText>
        {order ? (
          <>
            <AppText variant="subtitle">本日の命令</AppText>
            <AppText>
              {findDailyOrderMessage(order.text)
                ? formatConfiguredMessage(
                    findDailyOrderMessage(order.text)!,
                    playerName,
                  )
                : order.text}
            </AppText>
            <PrimaryButton
              title={order.completed ? "完了済み" : "命令完了"}
              disabled={order.completed}
              onPress={() =>
                dailyOrderService
                  .complete(order)
                  .then(setOrder)
                  .catch((error) => showError("本日の命令の保存に失敗しました", error))
              }
            />
          </>
        ) : (
          <PrimaryButton
            title="本日の命令を抽選"
            onPress={() =>
              dailyOrderService
                .draw()
                .then(setOrder)
                .catch((error) => showError("本日の命令の抽選に失敗しました", error))
            }
          />
        )}
      </Card>
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
    </Screen>
  );
}
