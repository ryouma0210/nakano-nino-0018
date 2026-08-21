import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";
import { roomMessages } from "@/constants/messages";
import { contractService } from "@/services/gameRoomService";

const roomItems = [
  ["敗北部屋", "/(tabs)/defeat"],
  ["洗脳部屋", "/(tabs)/brainwash"],
  ["準備部屋", "/(tabs)/preparation"],
  ["本日の命令部屋", "/(tabs)/orders"],
  ["調教部屋", "/(tabs)/habits"],
  ["射精管理部屋", "/(tabs)/management"],
  ["お仕置き部屋", "/(tabs)/timer"],
  ["契約部屋", "/(tabs)/contract"],
] as const;

export default function RoomsScreen() {
  const [contractSigned, setContractSigned] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      contractService.load().then((contract) => {
        if (active) setContractSigned(Boolean(contract.signedAt));
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">部屋</AppText>
        <View style={styles.rule} />
      </View>
      <RoomConversation
        characterSource={require("../../assets/backgrounds/rooms-corridor.png")}
        characterFit="cover"
        roomName="廊下"
        lines={roomMessages.rooms.lines}
        contractLines={roomMessages.rooms.contractLines}
      />
      <View style={styles.rooms}>
        {roomItems.map(([title, href]) => (
          <PrimaryButton
            key={href}
            title={href === "/(tabs)/defeat" && !contractSigned ? "敗北部屋　※未開放" : title}
            disabled={href === "/(tabs)/defeat" && !contractSigned}
            tone={
              href === "/(tabs)/defeat"
                ? "defeatRoom"
                : href === "/(tabs)/brainwash"
                  ? "defeat"
                : href === "/(tabs)/timer"
                  ? "punishment"
                : href === "/(tabs)/contract"
                  ? "contract"
                : href === "/(tabs)/preparation"
                  ? "preparation"
                : href === "/(tabs)/orders"
                  ? "order"
                : href === "/(tabs)/habits"
                  ? "training"
                : href === "/(tabs)/management"
                  ? "management"
                  : "primary"
            }
            onPress={() => router.push(href)}
          />
        ))}
      </View>
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 12 },
  kicker: {
    color: lightTheme.danger,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
  },
  rule: { height: 1, backgroundColor: "#fff" },
  rooms: { gap: 12 },
});
