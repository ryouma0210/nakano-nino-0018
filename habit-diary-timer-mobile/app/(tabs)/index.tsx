import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { roomMessages } from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";

const rooms = [
  ["準備部屋", "/(tabs)/preparation"],
  ["本日の命令部屋", "/(tabs)/orders"],
  ["調教部屋", "/(tabs)/habits"],
  ["射精管理部屋", "/(tabs)/management"],
  ["お仕置き部屋", "/(tabs)/timer"],
  ["契約部屋", "/(tabs)/contract"],
  ["記録・管理メニュー", "/(tabs)/menu"],
] as const;

export default function HomeScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <AppText style={styles.kicker}>ROOM SELECT</AppText>
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
                  href === "/(tabs)/timer"
                    ? "danger"
                    : href === "/(tabs)/contract"
                      ? "contract"
                      : href === "/(tabs)/menu"
                        ? "secondary"
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
