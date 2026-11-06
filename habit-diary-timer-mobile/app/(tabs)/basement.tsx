import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { RoomConversation } from "@/components/RoomConversation";
import { roomMessages } from "@/constants/messages";
import { useDesktopLayout } from "@/hooks/useDesktopLayout";

export default function BasementScreen() {
  const { isDesktop } = useDesktopLayout();
  return <Screen>
    <View style={styles.header}>
      <AppText variant="title">地下</AppText>
      <View style={styles.rule} />
    </View>
    <RoomConversation roomName="地下" lines={roomMessages.basement.lines}
      characterSource={require("../../assets/backgrounds/rooms-basement.png")}
      characterFit={isDesktop ? "cover" : "contain"} testID="basement-background" />
    <PrimaryButton title="監禁部屋" tone="punishment" testID="basement-timer-room"
      onPress={() => router.push("/(tabs)/timer-room")} />
    <PrimaryButton title="地上へ戻る" tone="secondary" testID="basement-back"
      onPress={() => router.replace("/(tabs)/rooms")} />
  </Screen>;
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 12 },
  rule: { height: 1, backgroundColor: "#fff" },
});
