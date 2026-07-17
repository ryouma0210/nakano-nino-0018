import { useCallback, useEffect, useState } from "react";
import { Alert, BackHandler, Platform } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { execute } from "@/database/client";
import { fileStorageService, formatBytes } from "@/services/fileStorageService";
import { notificationService } from "@/services/notificationService";
import { settingsService } from "@/services/settingsService";

export default function SettingsScreen() {
  const [cacheSize, setCacheSize] = useState(0);
  const loadSize = useCallback(() => { fileStorageService.totalSize().then(setCacheSize); }, []);
  useEffect(loadSize, [loadSize]);
  useFocusEffect(loadSize);

  function resetAll() {
    Alert.alert("初期化確認", "すべての履歴、設定、格納ファイルを削除します。元に戻せません。", [
      { text: "キャンセル", style: "cancel" },
      { text: "全て削除", style: "destructive", onPress: async () => {
        execute("DELETE FROM timer_histories");
        execute("DELETE FROM journal_tags");
        execute("DELETE FROM tags");
        execute("DELETE FROM journals");
        execute("DELETE FROM habit_records");
        execute("DELETE FROM habit_schedules");
        execute("DELETE FROM habits");
        execute("DELETE FROM timer_presets");
        execute("DELETE FROM app_settings");
        await settingsService.reset();
        await notificationService.cancelAll();
        await fileStorageService.clear();
        loadSize();
        Alert.alert("初期化完了", "すべてのデータを初期化しました。");
      } },
    ]);
  }

  function exitGame() {
    if (Platform.OS === "android") BackHandler.exitApp();
    else Alert.alert("ゲーム終了", "iOSではアプリを閉じる操作は端末側から行ってください。");
  }

  return (
    <Screen>
      <AppText variant="title">設定</AppText>
      <RoomConversation roomName="設定" lines={[{ text: "保存量の確認や初期化は、ここで行えるわ。" }, { text: "初期化したデータは戻せないから、よく確認して。", event: "SYSTEM MENU" }]} />
      <Card><AppText variant="label">現在のファイル使用量</AppText><AppText variant="title">{formatBytes(cacheSize)}</AppText><AppText variant="muted">ファイル格納部屋に保存されたファイルの合計です。</AppText></Card>
      <PrimaryButton title="ファイル格納部屋を開く" onPress={() => router.push("/(tabs)/files")} />
      <PrimaryButton title="全データを初期化" tone="danger" onPress={resetAll} />
      <PrimaryButton title="ホームへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)")} />
      <PrimaryButton title="ゲーム終了" tone="danger" onPress={exitGame} />
    </Screen>
  );
}
