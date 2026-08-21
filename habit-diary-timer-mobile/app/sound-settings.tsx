import { Pressable, StyleSheet, Switch, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { useAppAudio } from "@/audio/AudioProvider";

export default function SoundSettingsScreen() {
  const { settings, updateAudioSettings } = useAppAudio();

  return (
    <Screen>
      <AppText variant="title">サウンド設定</AppText>
      <Card>
        <View style={styles.audioRow}>
          <View style={styles.audioText}>
            <AppText>BGM</AppText>
            <AppText variant="muted">通常画面のBGMを再生します。</AppText>
          </View>
          <Switch
            value={Boolean(settings?.backgroundMusicEnabled)}
            onValueChange={(value) => updateAudioSettings({ backgroundMusicEnabled: value })}
          />
        </View>
        <View style={styles.audioRow}>
          <View style={styles.audioText}>
            <AppText>効果音・専用音声</AppText>
            <AppText variant="muted">
              ボタン、会話、調教中などの音声を再生します。
            </AppText>
          </View>
          <Switch
            value={Boolean(settings?.soundEnabled)}
            onValueChange={(value) => updateAudioSettings({ soundEnabled: value })}
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
        <AppText variant="subtitle">言語設定</AppText>
        <AppText variant="muted">アプリ内の文字表示を変更します。</AppText>
        <View style={styles.languageButtons}>
          {([
            { key: "ja", label: "日本語（デフォルト）" },
            { key: "en", label: "English" },
            { key: "ko", label: "한국어" },
          ] as const).map((item) => {
            const selected = (settings?.language ?? "ja") === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => updateAudioSettings({ language: item.key })}
                style={[styles.languageButton, selected && styles.languageButtonSelected]}
              >
                <AppText style={[styles.languageButtonText, selected && styles.languageButtonTextSelected]}>
                  {item.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>
      <PrimaryButton title="スタート画面へ戻る" onPress={() => router.back()} />
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
        onPress={() => onChange(Math.max(0, Number((normalized - 0.1).toFixed(1))))}
      />
      <AppText style={styles.volumeValue}>{Math.round(normalized * 100)}%</AppText>
      <PrimaryButton
        title="＋"
        tone="secondary"
        onPress={() => onChange(Math.min(1, Number((normalized + 0.1).toFixed(1))))}
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
  languageButtons: { gap: 7 },
  languageButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#777",
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  languageButtonSelected: {
    borderColor: "#e84d9b",
    backgroundColor: "#3b1728",
  },
  languageButtonText: {
    color: "#111",
    fontWeight: "800",
    textAlign: "center",
  },
  languageButtonTextSelected: { color: "#fff" },
});
