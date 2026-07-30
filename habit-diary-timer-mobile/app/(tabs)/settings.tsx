import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RoomConversation } from "@/components/RoomConversation";
import { roomMessages } from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { execute } from "@/database/client";
import { fileStorageService, formatBytes } from "@/services/fileStorageService";
import { notificationService } from "@/services/notificationService";
import { defaultSettings, settingsService } from "@/services/settingsService";
import { useAppAudio } from "@/audio/AudioProvider";
import { contractService, dailyOrderService } from "@/services/gameRoomService";
import { useAppModal } from "@/components/AppModalProvider";
import { toDateTimeKey } from "@/utils/date";

type PartialResetKey =
  | "records"
  | "points"
  | "contract"
  | "settings"
  | "files";

const partialResetItems: {
  key: PartialResetKey;
  label: string;
  description: string;
}[] = [
  { key: "records", label: "調教日記・各部屋の記録", description: "敗北・準備・本日の命令・射精管理・調教・お仕置きの全記録" },
  { key: "points", label: "実績・ポイント・獲得済みご褒美", description: "ポイント残高・交換履歴・コレクションのご褒美" },
  { key: "contract", label: "契約書・契約ルール", description: "署名・契約日・契約後の追加ルール" },
  { key: "settings", label: "サウンド設定", description: "BGM・効果音の設定を初期値へ戻します" },
  { key: "files", label: "格納ファイル", description: "調教用・お仕置き用の画像と動画" },
];

export default function SettingsScreen() {
  const { settings, updateAudioSettings } = useAppAudio();
  const { showNotice, showError } = useAppModal();
  const [cacheSize, setCacheSize] = useState(0);
  const [resetConfirmation, setResetConfirmation] = useState(false);
  const [partialResetConfirmation, setPartialResetConfirmation] = useState(false);
  const [partialSelection, setPartialSelection] = useState<PartialResetKey[]>([]);
  const [showResetOptions, setShowResetOptions] = useState(false);
  const loadSize = useCallback(() => {
    fileStorageService.totalSize().then(setCacheSize);
  }, []);
  useEffect(loadSize, [loadSize]);
  useFocusEffect(loadSize);

  function resetAll() {
    setResetConfirmation(true);
  }

  async function executeReset() {
    try {
      execute("DELETE FROM timer_histories");
      execute("DELETE FROM management_daily_tasks");
      execute("DELETE FROM management_cycles");
      execute("DELETE FROM preparation_records");
      execute("DELETE FROM reward_redemptions");
      execute("DELETE FROM tribute_records");
      execute("DELETE FROM tribute_income_records");
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
      showNotice("初期化完了", "すべてのデータを初期化しました。");
    } catch (error) {
      showError("全データ初期化に失敗しました", error);
    }
  }

  function togglePartial(key: PartialResetKey) {
    setPartialSelection((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  async function executePartialReset() {
    try {
      const selected = new Set(partialSelection);
      if (selected.has("records")) {
        execute("DELETE FROM preparation_records");
        execute("DELETE FROM tribute_records");
        execute("DELETE FROM tribute_income_records");
        execute("DELETE FROM timer_histories");
        execute("DELETE FROM habit_records");
        execute("DELETE FROM point_transactions WHERE source_key LIKE 'training:%' OR source_key LIKE 'daily-order:%' OR source_key LIKE 'management-task:%'");
        execute("DELETE FROM journals");
        await dailyOrderService.clearOrders();
        execute("DELETE FROM management_daily_tasks");
        execute("DELETE FROM management_cycles");
      }
      if (selected.has("points")) {
        execute("DELETE FROM reward_redemptions");
        execute("DELETE FROM point_transactions");
      }
      if (selected.has("contract")) await contractService.clear();
      if (selected.has("settings")) {
        await updateAudioSettings({
          backgroundMusicEnabled: defaultSettings.backgroundMusicEnabled,
          soundEnabled: defaultSettings.soundEnabled,
          musicVolume: defaultSettings.musicVolume,
          soundVolume: defaultSettings.soundVolume,
        });
        await notificationService.cancelAll();
      }
      if (selected.has("files")) await fileStorageService.clear();
      if (selected.has("points")) {
        const resetAt = toDateTimeKey();
        execute(
          `INSERT INTO app_settings(setting_key, setting_value, updated_at)
           VALUES('points_reset_at', ?, ?)
           ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
          [resetAt, resetAt],
        );
      }
      execute("DELETE FROM journal_tags WHERE journal_id NOT IN (SELECT id FROM journals)");
      execute("DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM journal_tags)");
      setPartialSelection([]);
      loadSize();
      showNotice("一部初期化完了", "選択したデータを削除しました。");
    } catch (error) {
      showError("一部データ初期化に失敗しました", error);
    }
  }

  return (
    <Screen>
      <AppText variant="title">設定</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/settings-nino.png")}
        roomName="設定"
        lines={roomMessages.settings.lines}
        contractLines={roomMessages.settings.contractLines}
      />
      <Card>
        <AppText variant="subtitle">サウンド</AppText>
        <View style={styles.audioRow}>
          <View style={styles.audioText}>
            <AppText>部屋のBGM</AppText>
            <AppText variant="muted">通常画面の共通BGMを再生します。</AppText>
          </View>
          <Switch
            value={Boolean(settings?.backgroundMusicEnabled)}
            onValueChange={(value) =>
              updateAudioSettings({ backgroundMusicEnabled: value })
            }
          />
        </View>
        <View style={styles.audioRow}>
          <View style={styles.audioText}>
            <AppText>効果音</AppText>
            <AppText variant="muted">
              ボタン・会話・リズム・完了音を再生します。※乳首責め/耳舐めなどの音声はこちらになります。
            </AppText>
          </View>
          <Switch
            value={Boolean(settings?.soundEnabled)}
            onValueChange={(value) =>
              updateAudioSettings({ soundEnabled: value })
            }
          />
        </View>
        <VolumeRow
          label="BGM音量"
          value={settings?.musicVolume ?? 0.35}
          onChange={(value) => updateAudioSettings({ musicVolume: value })}
        />
        <VolumeRow
          label="効果音量"
          value={settings?.soundVolume ?? 0.7}
          onChange={(value) => updateAudioSettings({ soundVolume: value })}
        />
      </Card>
      <Card>
        <AppText variant="label">現在のファイル使用量</AppText>
        <AppText variant="title">{formatBytes(cacheSize)}</AppText>
        <AppText variant="muted">
          ファイル格納部屋に保存されたファイルの合計です。
        </AppText>
        <PrimaryButton
          title="ファイル格納部屋を開く"
          onPress={() => router.push("/(tabs)/files")}
        />
      </Card>
      <PrimaryButton
        title="管理・設定メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu?section=management")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
      <PrimaryButton
        title="スタート画面に移動"
        tone="danger"
        onPress={() => router.replace("/start")}
      />
      <PrimaryButton
        title="初期化する"
        tone="danger"
        onPress={() => setShowResetOptions((current) => !current)}
      />
      {showResetOptions ? (
        <>
          <Card style={styles.partialResetCard}>
            <AppText variant="subtitle" style={styles.partialResetText}>一部データ初期化</AppText>
            <AppText style={styles.partialResetText}>削除する項目にチェックを付けてください。</AppText>
            {partialResetItems.map((item) => {
              const checked = partialSelection.includes(item.key);
              return (
                <Pressable
                  key={item.key}
                  onPress={() => togglePartial(item.key)}
                  style={styles.resetOption}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    <AppText style={styles.checkmark}>{checked ? "✓" : ""}</AppText>
                  </View>
                  <View style={styles.audioText}>
                    <AppText style={styles.partialResetText}>{item.label}</AppText>
                    <AppText style={styles.partialResetDescription}>{item.description}</AppText>
                  </View>
                </Pressable>
              );
            })}
            <PrimaryButton
              title="選択したデータを初期化"
              tone="danger"
              disabled={partialSelection.length === 0}
              onPress={() => setPartialResetConfirmation(true)}
            />
          </Card>
          <PrimaryButton
            title="全データを初期化"
            tone="danger"
            onPress={resetAll}
          />
        </>
      ) : null}
      <ConfirmModal
        visible={partialResetConfirmation}
        title="選択したデータを初期化しますか？"
        message={`${partialSelection.map((key) => `・${partialResetItems.find((item) => item.key === key)?.label}`).join("\n")}\n\nこの操作は元に戻せません。`}
        confirmLabel="削除を実行"
        confirmTone="danger"
        onCancel={() => setPartialResetConfirmation(false)}
        onConfirm={() => {
          setPartialResetConfirmation(false);
          executePartialReset();
        }}
      />
      <ConfirmModal
        visible={resetConfirmation}
        title="全データを初期化しますか？"
        message="次のデータをすべて削除します。\n\n・調教日記と準備・敗北記録\n・本日の命令\n・お仕置きと射精管理の履歴\n・実績・ポイント・獲得済みご褒美\n・契約書と契約ルール\n・名前とサウンド設定\n・格納ファイル\n\nこの操作は元に戻せません。"
        confirmLabel="削除を実行"
        confirmTone="danger"
        onCancel={() => setResetConfirmation(false)}
        onConfirm={() => {
          setResetConfirmation(false);
          executeReset();
        }}
      />
    </Screen>
  );
}

function VolumeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.volumeRow}>
      <AppText style={styles.volumeLabel}>{label}</AppText>
      <PrimaryButton
        title="−"
        tone="secondary"
        onPress={() =>
          onChange(Math.max(0, Number((normalized - 0.1).toFixed(1))))
        }
      />
      <AppText style={styles.volumeValue}>
        {Math.round(normalized * 100)}%
      </AppText>
      <PrimaryButton
        title="＋"
        tone="secondary"
        onPress={() =>
          onChange(Math.min(1, Number((normalized + 0.1).toFixed(1))))
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  partialResetCard: { borderColor: "#ff3b45" },
  partialResetText: { color: "#ff3b45" },
  partialResetDescription: { color: "#d96a70" },
  resetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#8f252c",
    paddingVertical: 10,
  },
  checkbox: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ff3b45",
    backgroundColor: "#000",
  },
  checkboxChecked: { backgroundColor: "#d9202a" },
  checkmark: { color: "#fff", fontWeight: "900" },
  audioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingVertical: 10,
  },
  audioText: { flex: 1, gap: 2 },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingVertical: 10,
  },
  volumeLabel: { flex: 1, fontWeight: "800" },
  volumeValue: { width: 46, textAlign: "center", fontWeight: "900" },
});

