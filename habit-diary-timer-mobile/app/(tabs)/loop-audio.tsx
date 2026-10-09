import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { roomMessages } from "@/constants/messages";
import { useAppAudio } from "@/audio/AudioProvider";
import { loopAudioOptions as loopAudios } from "@/audio/loopAudioLabels";
import { lightTheme } from "@/constants/theme";
import { contractService } from "@/services/gameRoomService";

export default function LoopAudioScreen() {
  const { loopAudioNames, playLoopAudio, stopLoopAudio, settings } = useAppAudio();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      contractService.load().then((contract) => {
        if (active && !contract.signedAt)
          router.replace("/(tabs)/menu?section=management");
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen>
      <PageTitle>ループ音声</PageTitle>
      <RoomConversation
        characterSource={require("../../assets/characters/settings-nino.png")}
        roomName="ループ音声"
        lines={roomMessages.loopAudio.lines}
        contractLines={roomMessages.loopAudio.contractLines}
      />
      <Card>
        <AppText variant="subtitle">再生する音声</AppText>
        <AppText variant="muted">複数の音声を同時に再生できます。</AppText>
        <AppText variant="muted">
          画面を移動しても流れ続けます。停止する場合は「停止」を押してください。
        </AppText>
        <AppText variant="muted">画面下部のプレイヤーから停止タイマーを設定できます。館の外では、右上のクエストの「音声」タブから操作します。</AppText>
        <PrimaryButton
          title="すべて停止"
          tone="danger"
          disabled={loopAudioNames.length === 0}
          onPress={() => stopLoopAudio()}
        />
        {!settings?.soundEnabled ? (
          <AppText style={styles.warning}>
            効果音がOFFです。設定で効果音をONにしてください。
          </AppText>
        ) : null}
        <View style={styles.options}>
          {loopAudios.map((audio) => {
            const selected = loopAudioNames.includes(audio.key);
            return (
              <View key={audio.key} style={styles.option}>
                <View style={styles.optionText}>
                  <AppText style={styles.optionTitle}>{audio.title}</AppText>
                  {selected ? <AppText variant="muted">再生中</AppText> : null}
                </View>
                <PrimaryButton
                  title={selected ? "停止" : "再生"}
                  tone={selected ? "danger" : "primary"}
                  disabled={!selected && !settings?.soundEnabled}
                  onPress={() => {
                    if (selected) {
                      stopLoopAudio(audio.key);
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
        title="管理・設定メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu?section=management")}
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
