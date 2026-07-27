import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { useAppAudio } from "@/audio/AudioProvider";
import { useAppModal } from "@/components/AppModalProvider";
import { roomMessages } from "@/constants/messages";
import { journalRepository } from "@/repositories/journalRepository";
import { toDateKey } from "@/utils/date";

export default function BrainwashScreen() {
  const { showNotice } = useAppModal();
  const { settings, playEffect, stopEffect, setSessionAudioActive } = useAppAudio();

  useFocusEffect(
    useCallback(() => {
      const audioEnabled = Boolean(settings?.soundEnabled);
      setSessionAudioActive(audioEnabled);
      if (audioEnabled) playEffect("trainingStart");
      return () => {
        stopEffect("trainingStart");
        setSessionAudioActive(false);
      };
    }, [playEffect, setSessionAudioActive, settings?.soundEnabled, stopEffect]),
  );

  function complete() {
    journalRepository.upsertSystemRecord(
      {
        recordDate: toDateKey(),
        title: "洗脳部屋記録",
        body: "洗脳完了しました。",
        recordType: "diary",
        tags: "洗脳部屋,調教記録",
      },
      `洗脳部屋${toDateKey()}`,
    );
    showNotice("洗脳完了", "洗脳完了しました。");
  }

  return (
    <Screen>
      <AppText variant="title" style={styles.title}>洗脳部屋</AppText>
      <RoomConversation
        characterVideoSource={require("../../assets/videos/sennou.mp4")}
        roomName="洗脳部屋"
        lines={roomMessages.brainwash.lines}
        contractLines={roomMessages.brainwash.contractLines}
      />
      <Card style={styles.card}>
        <AppText variant="subtitle">洗脳再生</AppText>
        <AppText variant="muted">
          耳舐め音声を流しながら、映像を見続けなさい。
        </AppText>
        <BrainwashVideo />
        {!settings?.soundEnabled ? (
          <AppText style={styles.warning}>
            効果音がOFFです。設定で効果音をONにしてください。
          </AppText>
        ) : null}
        <PrimaryButton title="洗脳完了しました。" onPress={complete} />
      </Card>
      <PrimaryButton
        title="廊下に戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/rooms")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

function BrainwashVideo() {
  const player = useVideoPlayer(require("../../assets/videos/sennou.mp4"), (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.volume = 0;
    instance.play();
  });

  return (
    <View style={styles.videoFrame}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        style={styles.video}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#c000ff" },
  card: { borderColor: "#c000ff" },
  videoFrame: {
    overflow: "hidden",
    height: 260,
    borderWidth: 1,
    borderColor: "#c000ff",
    borderRadius: 4,
    backgroundColor: "#000",
  },
  video: { width: "100%", height: "100%" },
  warning: { color: "#ff4b55", fontWeight: "900" },
});
