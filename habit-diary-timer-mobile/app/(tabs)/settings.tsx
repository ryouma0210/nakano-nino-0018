import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
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
import { useAppAudio } from "@/audio/AudioProvider";
import { dailyOrderService } from "@/services/gameRoomService";

export default function SettingsScreen() {
  const { settings, updateAudioSettings } = useAppAudio();
  const [cacheSize, setCacheSize] = useState(0);
  const loadSize = useCallback(() => {
    fileStorageService.totalSize().then(setCacheSize);
  }, []);
  useEffect(loadSize, [loadSize]);
  useFocusEffect(loadSize);

  function resetAll() {
    Alert.alert("全データを初期化しますか？", "次のデータをすべて削除します。\n\n・調教日記と準備記録\n・お仕置きと射精管理の履歴\n・実績\n・設定\n・格納ファイル\n\nこの操作は元に戻せません。", [
      { text: "キャンセル", style: "cancel" },
      { text: "削除を実行", style: "destructive", onPress: async () => {
        execute("DELETE FROM timer_histories");
        execute("DELETE FROM management_daily_tasks");
        execute("DELETE FROM management_cycles");
        execute("DELETE FROM preparation_records");
        execute("DELETE FROM reward_redemptions");
        execute("DELETE FROM point_transactions");
        execute("DELETE FROM journal_tags");
        execute("DELETE FROM tags");
        execute("DELETE FROM journals");
        execute("DELETE FROM habit_records");
        execute("DELETE FROM habit_schedules");
        execute("DELETE FROM habits");
        execute("DELETE FROM timer_presets");
        execute("DELETE FROM app_settings");
        await settingsService.reset();
        await dailyOrderService.clearAll();
        await notificationService.cancelAll();
        await fileStorageService.clear();
        loadSize();
        Alert.alert("初期化完了", "すべてのデータを初期化しました。");
      } },
    ]);
  }

  return (
    <Screen>
      <AppText variant="title">設定</AppText>
      <RoomConversation characterSource={require("../../assets/characters/settings-nino.png")} roomName="設定" lines={[{ text: "保存量の確認や初期化は、ここで行えるわ。" }, { text: "初期化したデータは戻せないから、よく確認して。" }]} />
      <Card>
        <AppText variant="subtitle">サウンド</AppText>
        <View style={styles.audioRow}>
          <View style={styles.audioText}><AppText>部屋のBGM</AppText><AppText variant="muted">画面ごとのBGMを再生します。</AppText></View>
          <Switch value={Boolean(settings?.backgroundMusicEnabled)} onValueChange={(value) => updateAudioSettings({ backgroundMusicEnabled: value })} />
        </View>
        <View style={styles.audioRow}>
          <View style={styles.audioText}><AppText>効果音</AppText><AppText variant="muted">ボタン・会話・リズム・完了音を再生します。</AppText></View>
          <Switch value={Boolean(settings?.soundEnabled)} onValueChange={(value) => updateAudioSettings({ soundEnabled: value })} />
        </View>
        <VolumeRow label="BGM音量" value={settings?.musicVolume ?? 0.35} onChange={(value) => updateAudioSettings({ musicVolume: value })} />
        <VolumeRow label="効果音量" value={settings?.soundVolume ?? 0.7} onChange={(value) => updateAudioSettings({ soundVolume: value })} />
      </Card>
      <Card>
        <AppText variant="label">現在のファイル使用量</AppText>
        <AppText variant="title">{formatBytes(cacheSize)}</AppText>
        <AppText variant="muted">ファイル格納部屋に保存されたファイルの合計です。</AppText>
        <PrimaryButton title="ファイル格納部屋を開く" onPress={() => router.push("/(tabs)/files")} />
      </Card>
      <PrimaryButton title="ホームへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)")} />
      <PrimaryButton title="スタート画面に移動" tone="danger" onPress={() => router.replace("/start")} />
      <PrimaryButton title="全データを初期化" tone="danger" onPress={resetAll} />
    </Screen>
  );
}

function VolumeRow({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.volumeRow}>
      <AppText style={styles.volumeLabel}>{label}</AppText>
      <PrimaryButton title="−" tone="secondary" onPress={() => onChange(Math.max(0, Number((normalized - 0.1).toFixed(1))))} />
      <AppText style={styles.volumeValue}>{Math.round(normalized * 100)}%</AppText>
      <PrimaryButton title="＋" tone="secondary" onPress={() => onChange(Math.min(1, Number((normalized + 0.1).toFixed(1))))} />
    </View>
  );
}

const styles = StyleSheet.create({
  audioRow: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: "#444", paddingVertical: 10 },
  audioText: { flex: 1, gap: 2 },
  volumeRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: "#444", paddingVertical: 10 },
  volumeLabel: { flex: 1, fontWeight: "800" },
  volumeValue: { width: 46, textAlign: "center", fontWeight: "900" },
});
