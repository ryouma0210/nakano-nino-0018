import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RoomConversation } from "@/components/RoomConversation";
import { roomMessages } from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { execute } from "@/database/client";
import { fileStorageService, formatBytes } from "@/services/fileStorageService";
import { notificationService } from "@/services/notificationService";
import { settingsService } from "@/services/settingsService";
import { useAppAudio } from "@/audio/AudioProvider";
import { dailyOrderService } from "@/services/gameRoomService";
import { useAppModal } from "@/components/AppModalProvider";

export default function SettingsScreen() {
  const { settings, updateAudioSettings } = useAppAudio();
  const { showNotice } = useAppModal();
  const [playerName, setPlayerName] = useState("");
  const [cacheSize, setCacheSize] = useState(0);
  const [resetConfirmation, setResetConfirmation] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const loadSize = useCallback(() => {
    fileStorageService.totalSize().then(setCacheSize);
  }, []);
  useEffect(loadSize, [loadSize]);
  useEffect(() => {
    if (settings) setPlayerName(settings.playerName);
  }, [settings]);
  useFocusEffect(loadSize);

  function resetAll() {
    setResetConfirmation(true);
  }

  async function executeReset() {
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
    showNotice("初期化完了", "すべてのデータを初期化しました。");
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
        <AppText variant="subtitle">呼ばれたい名前</AppText>
        <AppText variant="muted">
          設定した名前を、各部屋の会話や調教中のコメントで呼びます。
        </AppText>
        <TextField
          label="名前"
          value={playerName}
          onChangeText={setPlayerName}
          placeholder="名前を入力"
          maxLength={20}
          autoCorrect={false}
        />
        <PrimaryButton
          title="名前を保存"
          onPress={async () => {
            const normalized = playerName.trim();
            setPlayerName(normalized);
            await updateAudioSettings({ playerName: normalized });
            setSavedMessage(
              normalized
                ? `これから「${normalized}」と呼びます。`
                : "名前の呼びかけを解除しました。",
            );
          }}
        />
      </Card>
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
              ボタン・会話・リズム・完了音を再生します。
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
        title="全データを初期化"
        tone="danger"
        onPress={resetAll}
      />
      <ConfirmModal
        visible={savedMessage !== null}
        title="保存しました"
        message={savedMessage ?? ""}
        confirmLabel="閉じる"
        showCancel={false}
        onCancel={() => setSavedMessage(null)}
        onConfirm={() => setSavedMessage(null)}
      />
      <ConfirmModal
        visible={resetConfirmation}
        title="全データを初期化しますか？"
        message="次のデータをすべて削除します。\n\n・調教日記と準備記録\n・お仕置きと射精管理の履歴\n・実績とポイント\n・設定\n・格納ファイル\n\nこの操作は元に戻せません。"
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
