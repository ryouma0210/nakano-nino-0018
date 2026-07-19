import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";
import { roomMessages } from "@/constants/messages";

const menuItems = [
  ["週間報告", "/(tabs)/report"],
  ["調教日記", "/(tabs)/records"],
  ["ファイル格納", "/(tabs)/files"],
  ["コレクション", "/(tabs)/collection"],
  ["ご褒美", "/(tabs)/rewards"],
  ["設定", "/(tabs)/settings"],
] as const;

export default function MenuScreen() {
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
        {menuItems.map(([title, href]) => (
          <PrimaryButton
            key={href}
            title={title}
            tone={
              title === "設定"
                ? "secondary"
                : title === "週間報告" || title === "調教日記" || title === "ファイル格納"
                  ? "record"
                  : title === "コレクション" || title === "ご褒美"
                    ? "reward"
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
  items: { gap: 12 },
});
