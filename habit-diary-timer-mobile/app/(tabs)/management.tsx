import { useEffect, useState } from "react";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ManagementRoom } from "@/components/ManagementRoom";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import type { ManagementMode } from "@/repositories/roomRepository";
import {
  contractService,
  type ContractSettings,
} from "@/services/gameRoomService";

export default function ManagementScreen() {
  const [mode, setMode] = useState<ManagementMode | null>(null);
  const [contract, setContract] = useState<ContractSettings | null>(null);
  useEffect(() => {
    contractService.load().then(setContract);
  }, []);

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
        lines={[
          { text: "今日はどちらの管理方法にする？" },
          { text: "選んだ方法に合わせて、指示を変えてあげる。" },
        ]}
        contractLines={[
          { text: "契約した奴隷なんだから、もちろん貞操帯付けて受けるわよね♡",},
        ]}
      />
      <Card>
        <AppText variant="subtitle">管理方法を選択</AppText>
        <PrimaryButton
          title="貞操帯なし"
          disabled={contract?.allowRelease === false}
          onPress={() => setMode("release")}
        />
        <PrimaryButton
          title="貞操帯あり"
          disabled={contract?.allowChastity === false}
          onPress={() => setMode("chastity")}
        />
        {contract && !contract.allowRelease && !contract.allowChastity ? (
          <AppText variant="muted">
            契約部屋で利用する管理方法を許可してください。
          </AppText>
        ) : null}
      </Card>
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}
