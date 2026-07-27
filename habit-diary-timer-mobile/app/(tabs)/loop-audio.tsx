import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { roomMessages } from "@/constants/messages";
import { useAppAudio, type LoopAudioName } from "@/audio/AudioProvider";
import { lightTheme } from "@/constants/theme";
import { contractService } from "@/services/gameRoomService";

const loopAudios: { key: LoopAudioName; title: string; description: string }[] = [
  {
    key: "earLick",
    title: "耳舐め音声",
    description: "耳舐め音声をループ再生します。",
  },
  {
    key: "nippleScratch",
    title: "乳首カリカリの音声",
    description: "乳首カリカリ音声をループ再生します。",
  },
];

export default function LoopAudioScreen() {
  const { loopAudioName, playLoopAudio, stopLoopAudio, settings } = useAppAudio();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      contractService.load().then((contract) => {
        if (active && !contract.signedAt) router.replace("/(tabs)/menu");
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen>
      <AppText variant="title">ループ音声</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/settings-nino.png")}
        roomName="ループ音声"
        lines={roomMessages.loopAudio.lines}
        contractLines={roomMessages.loopAudio.contractLines}
      />
      <Card>
        <AppText variant="subtitle">再生する音声</AppText>
        <AppText variant="muted">
          画面を移動しても流れ続けます。停止する場合は「停止」を押してください。
        </AppText>
        {!settings?.soundEnabled ? (
          <AppText style={styles.warning}>
            効果音がOFFです。設定で効果音をONにしてください。
          </AppText>
        ) : null}
        <View style={styles.options}>
          {loopAudios.map((audio) => {
            const selected = loopAudioName === audio.key;
            return (
              <View key={audio.key} style={styles.option}>
                <View style={styles.optionText}>
                  <AppText style={styles.optionTitle}>{audio.title}</AppText>
                  <AppText variant="muted">{selected ? "再生中" : audio.description}</AppText>
                </View>
                <PrimaryButton
                  title={selected ? "停止" : "再生"}
                  tone={selected ? "danger" : "primary"}
                  disabled={!settings?.soundEnabled}
                  onPress={() => {
                    if (selected) {
                      stopLoopAudio();
                      return;
                    }
                    playLoopAudio(audio.key);
                  }}
                />
              </View>
            );
          })}
        </View>
      </Card>
      <PrimaryButton
        title="記録・管理メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { gap: 12 },
  option: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingTop: 12,
  },
  optionText: { gap: 3 },
  optionTitle: { color: "#fff", fontWeight: "900" },
  warning: { color: lightTheme.danger, fontWeight: "900" },
});
