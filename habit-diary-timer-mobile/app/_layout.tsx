import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initializeDatabase } from "@/database/schema";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/AppText";
import { AudioProvider } from "@/audio/AudioProvider";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      initializeDatabase();
      setReady(true);
    } catch (err) {
      console.error(err);
      setError("データ保存の初期化に失敗しました。アプリを再起動してください。");
    }
  }, []);

  if (error) {
    return (
      <SafeAreaProvider>
        <Screen>
          <AppText variant="title">起動エラー</AppText>
          <AppText>{error}</AppText>
        </Screen>
      </SafeAreaProvider>
    );
  }

  if (!ready) {
    return (
      <SafeAreaProvider>
        <Screen>
          <AppText>読み込み中...</AppText>
        </Screen>
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AudioProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </AudioProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
