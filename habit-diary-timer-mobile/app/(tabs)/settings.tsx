import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";
import { execute } from "@/database/client";
import { initializeDatabase } from "@/database/schema";
import { exportService } from "@/services/exportService";
import { notificationService } from "@/services/notificationService";
import { settingsService } from "@/services/settingsService";
import type { AppSettings } from "@/types/models";

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setSettings(await settingsService.load());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function update(partial: Partial<AppSettings>) {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    await settingsService.save(next);
  }

  async function exportData() {
    setBusy(true);
    try {
      await exportService.exportJson();
    } finally {
      setBusy(false);
    }
  }

  async function importData(mode: "append" | "replace") {
    setBusy(true);
    try {
      const result = await exportService.importJson(mode);
      if (result.imported) Alert.alert("取込完了", "データを取り込みました。");
    } finally {
      setBusy(false);
    }
  }

  function confirmReset() {
    Alert.alert("初期化確認", "端末内のアプリデータを初期化しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "初期化",
        style: "destructive",
        onPress: () => {
          execute("DELETE FROM timer_histories");
          execute("DELETE FROM journals");
          execute("DELETE FROM habit_records");
          execute("DELETE FROM habits");
          execute("DELETE FROM timer_presets");
          execute("DELETE FROM app_settings");
          initializeDatabase();
          settingsService.reset().then(load);
        },
      },
    ]);
  }

  return (
    <Screen>
      <AppText variant="title">準備の部屋</AppText>

      <Card>
        <AppText variant="subtitle">通知</AppText>
        <View style={styles.settingRow}>
          <View style={styles.grow}>
            <AppText style={styles.settingTitle}>ローカル通知</AppText>
            <AppText variant="muted">習慣とタイマー完了の通知に使います。</AppText>
          </View>
          <Switch value={Boolean(settings?.notificationsEnabled)} onValueChange={(value) => update({ notificationsEnabled: value })} />
        </View>
        <PrimaryButton title="通知権限を確認" onPress={() => notificationService.requestPermission()} />
      </Card>

      <Card>
        <AppText variant="subtitle">画面</AppText>
        <View style={styles.settingRow}>
          <View style={styles.grow}>
            <AppText style={styles.settingTitle}>ダークモード</AppText>
            <AppText variant="muted">配色設定を保存します。</AppText>
          </View>
          <Switch value={Boolean(settings?.darkMode)} onValueChange={(value) => update({ darkMode: value })} />
        </View>
      </Card>

      <Card>
        <AppText variant="subtitle">データ</AppText>
        <PrimaryButton title="JSONエクスポート" onPress={exportData} disabled={busy} />
        <View style={styles.actions}>
          <PrimaryButton title="追加取込" onPress={() => importData("append")} disabled={busy} tone="secondary" />
          <PrimaryButton title="置換取込" onPress={() => importData("replace")} disabled={busy} tone="secondary" />
        </View>
        <PrimaryButton title="データ初期化" onPress={confirmReset} tone="danger" />
      </Card>

      <Card>
        <AppText variant="subtitle">アプリ情報</AppText>
        <InfoRow label="保存先" value="端末内 SQLite / AsyncStorage" />
        <InfoRow label="通信" value="なし。オフラインで動作します。" />
        <InfoRow label="バージョン" value="0.1.0" />
      </Card>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Pressable style={styles.infoRow}>
      <AppText variant="label">{label}</AppText>
      <AppText style={styles.infoValue}>{value}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  grow: {
    flex: 1,
  },
  settingTitle: {
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: lightTheme.border,
    gap: 12,
    paddingVertical: 10,
  },
  infoValue: {
    flex: 1,
    textAlign: "right",
  },
});
