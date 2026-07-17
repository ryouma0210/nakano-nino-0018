import { Alert, BackHandler, Image, Platform, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";

export default function Index() {
  function exitGame() {
    if (Platform.OS === "android") BackHandler.exitApp();
    else Alert.alert("ゲーム終了", "iOSではアプリを閉じる操作は端末側から行ってください。");
  }

  return (
    <Screen>
      <View style={styles.start}>
        <AppText style={styles.title}>PRIVATE ROOM</AppText>
        <Image source={require("../assets/characters/home-nino.png")} style={styles.hero} resizeMode="cover" />
        <View style={styles.menu}>
          <PrimaryButton title="始める" onPress={() => router.replace("/(tabs)")} />
          <PrimaryButton title="ゲーム終了" onPress={exitGame} tone="danger" />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  start: { minHeight: 620, justifyContent: "center", gap: 24 },
  title: { color: lightTheme.text, fontSize: 34, fontWeight: "900", letterSpacing: 5, textAlign: "center" },
  hero: { width: "100%", height: 330, borderWidth: 1, borderColor: "#fff", borderRadius: 4 },
  menu: { gap: 16 },
});
