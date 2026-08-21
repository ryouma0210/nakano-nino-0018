import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { roomMessages } from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";

const rooms = [
  ["部屋に移動（廊下）", "/(tabs)/rooms"],
  ["二ノ様の控室", "/(tabs)/nino-room"],
  ["館の外へ", "/(tabs)/outside"],
  ["記録・交換メニュー", "/(tabs)/menu?section=record"],
  ["管理・設定メニュー", "/(tabs)/menu?section=management"],
] as const;

export default function HomeScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">ホーム</AppText>
        <View style={styles.rule} />
      </View>
      <RoomConversation
        characterSource={require("../../assets/characters/home-nino.png")}
        roomName="ホーム"
        lines={roomMessages.home.lines}
        contractLines={roomMessages.home.contractLines}
      />
      <View style={styles.rooms}>
        {rooms.map(([title, href]) => (
          <View key={href} style={styles.roomRow}>
            <View style={styles.button}>
              <PrimaryButton
                title={title}
                tone={
                  href.includes("section=record")
                    ? "secondary"
                    : href.includes("section=management")
                      ? "secondary"
                      : href === "/(tabs)/outside"
                        ? "collection"
                      : href === "/(tabs)/nino-room"
                      ? "defeat"
                      : "contract"
                }
                onPress={() => router.push(href)}
              />
            </View>
          </View>
        ))}
      </View>
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
  roomRow: { flexDirection: "row", alignItems: "center" },
  button: { flex: 1 },
});
