import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";

const rooms = [
  ["準備部屋", "/(tabs)/preparation"],
  ["調教部屋", "/(tabs)/habits"],
  ["お仕置き部屋", "/(tabs)/timer"],
  ["射精管理用部屋（貞操帯なし）", "/(tabs)/release"],
  ["射精管理用部屋（貞操帯あり）", "/(tabs)/chastity"],
  ["調教日記部屋", "/(tabs)/records"],
  ["ファイル格納部屋", "/(tabs)/files"],
  ["設定", "/(tabs)/settings"],
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
        lines={[
          { text: "おかえりなさい。今日はどの部屋へ行く？" },
          { text: "準備ができたら、行き先を選んで。", event: "ROOM SELECT" },
          { text: "あなたの記録は、私がここで見守っているわ。" },
        ]}
      />
      <View style={styles.rooms}>
        {rooms.map(([title, href], index) => (
          <View key={href} style={styles.roomRow}>
            <AppText style={styles.number}>{String(index + 1).padStart(2, "0")}</AppText>
            <View style={styles.button}>
              <PrimaryButton title={title} onPress={() => router.push(href)} />
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 12 },
  kicker: { color: lightTheme.danger, fontSize: 12, fontWeight: "900", letterSpacing: 3 },
  rule: { height: 1, backgroundColor: "#fff" },
  rooms: { gap: 12 },
  roomRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  number: { width: 28, color: lightTheme.muted, fontWeight: "900" },
  button: { flex: 1 },
});
