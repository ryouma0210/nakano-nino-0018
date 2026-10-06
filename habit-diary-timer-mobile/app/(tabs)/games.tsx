import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";

export default function GamesScreen() {
  return (
    <Screen desktopLayout="single">
      <View style={styles.header}>
        <AppText variant="title">ゲーム部屋</AppText>
        <View style={styles.rule} />
      </View>

      <Card style={styles.gameCard}>
        <PrimaryButton title="すごろく" tone="defeat" onPress={() => router.push("/(tabs)/sugoroku")} />
        <PrimaryButton title="オセロ" tone="defeat" onPress={() => router.push("/(tabs)/othello")} />
      </Card>

      <PrimaryButton title="部屋から出る" tone="secondary" onPress={() => router.replace("/(tabs)/rooms")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 4 },
  rule: { height: 1, backgroundColor: lightTheme.text },
  gameCard: { width: "100%", maxWidth: 680, alignSelf: "center", gap: 16 },
  artwork: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    borderRadius: 4,
    backgroundColor: "#121d2b",
  },
  track: { flexDirection: "row", gap: 8 },
  square: { width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: "#c7ddf7", backgroundColor: "#25394f" },
  goalSquare: { borderColor: "#f2c94c", backgroundColor: "#f2c94c" },
});
