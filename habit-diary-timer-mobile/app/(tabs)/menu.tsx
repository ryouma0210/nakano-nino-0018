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

const menuItems = [
  ["週間報告", "/(tabs)/report"],
  ["調教日記", "/(tabs)/records"],
  ["お貢ぎ履歴", "/(tabs)/tribute"],
  ["ファイル格納", "/(tabs)/files"],
  ["ループ音声", "/(tabs)/loop-audio"],
  ["コレクション", "/(tabs)/collection"],
  ["ご褒美", "/(tabs)/rewards"],
  ["マイページ", "/(tabs)/mypage"],
  ["設定", "/(tabs)/settings"],
] as const;

export default function MenuScreen() {
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
        <AppText style={styles.kicker}>RECORD / MANAGEMENT</AppText>
        <AppText variant="title">記録・管理メニュー</AppText>
        <View style={styles.rule} />
      </View>
      <RoomConversation
        characterSource={require("../../assets/characters/settings-nino.png")}
        roomName="管理メニュー"
        lines={roomMessages.menu.lines}
        contractLines={roomMessages.menu.contractLines}
      />
      <View style={styles.items}>
        {menuItems.map(([title, href]) => {
          const locked = title === "ループ音声" && !contractSigned;
          return (
            <PrimaryButton
              key={href}
              title={locked ? "ループ音声　※未開放" : title}
              disabled={locked}
              tone={
                title === "設定"
                  ? "secondary"
                  : title === "ご褒美"
                    ? "defeat"
                  : title === "マイページ"
                    ? "record"
                  : title === "ファイル格納"
                    ? "preparation"
                  : title === "お貢ぎ履歴"
                    ? "tribute"
                  : title === "ループ音声"
                    ? "collection"
                  : title === "週間報告" || title === "調教日記"
                    ? "record"
                    : title === "コレクション"
                      ? "collection"
                      : "primary"
              }
              onPress={() => router.push(href)}
            />
          );
        })}
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
  items: { gap: 12 },
});
