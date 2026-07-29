import { useState } from "react";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ManagementRoom } from "@/components/ManagementRoom";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { roomMessages } from "@/constants/messages";
import { Screen } from "@/components/Screen";
import {
  managementRepository,
  type ManagementMode,
} from "@/repositories/roomRepository";

function managementModeLabel(mode: ManagementMode) {
  return mode === "release" ? "貞操帯なし" : "貞操帯あり";
}

export default function ManagementScreen() {
  const [mode, setMode] = useState<ManagementMode | null>(null);
  const releaseCycle = managementRepository.active("release");
  const chastityCycle = managementRepository.active("chastity");
  const activeMode: ManagementMode | null = releaseCycle
    ? "release"
    : chastityCycle
      ? "chastity"
      : null;

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
        {activeMode ? (
          <AppText>
            現在：{managementModeLabel(activeMode)}を実施中です。
            もう片方は、この管理が終わるまで選択できません。
          </AppText>
        ) : (
          <AppText variant="muted">
            どちらか一方の管理方法を選択してください。
          </AppText>
        )}
        <PrimaryButton
          title={
            activeMode === "chastity"
              ? "貞操帯なし（実施中は選択不可）"
              : "貞操帯なし"
          }
          disabled={activeMode === "chastity"}
          onPress={() => setMode("release")}
        />
        <PrimaryButton
          title={
            activeMode === "release"
              ? "貞操帯あり（実施中は選択不可）"
              : "貞操帯あり"
          }
          disabled={activeMode === "release"}
          onPress={() => setMode("chastity")}
        />
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
