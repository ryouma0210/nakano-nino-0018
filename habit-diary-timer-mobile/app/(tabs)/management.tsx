import { useState } from "react";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ManagementRoom } from "@/components/ManagementRoom";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { roomMessages } from "@/constants/messages";
import { Screen } from "@/components/Screen";
import type { ManagementMode } from "@/repositories/roomRepository";

export default function ManagementScreen() {
  const [mode, setMode] = useState<ManagementMode | null>(null);

  if (mode) {
    return (
      <ManagementRoom
        key={mode}
        mode={mode}
        title="射精管理部屋"
        characterSource={
          mode === "release"
            ? require("../../assets/characters/release-nino.png")
            : require("../../assets/characters/chastity-nino.png")
        }
        onChangeMode={() => setMode(null)}
      />
    );
  }

  return (
    <Screen>
      <AppText variant="title">射精管理部屋</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/chastity-nino.png")}
        roomName="射精管理部屋"
        lines={roomMessages.management.lines}
        contractLines={roomMessages.management.contractLines}
      />
      <Card>
        <AppText variant="subtitle">管理方法を選択</AppText>
        <PrimaryButton
          title="貞操帯なし"
          onPress={() => setMode("release")}
        />
        <PrimaryButton
          title="貞操帯あり"
          onPress={() => setMode("chastity")}
        />
      </Card>
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}
