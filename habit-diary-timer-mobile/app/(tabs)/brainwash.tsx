import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  const { showNotice } = useAppModal();
  const { settings, playEffect, stopEffect, setSessionAudioActive } = useAppAudio();
  const [fullscreen, setFullscreen] = useState(false);

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
        <BrainwashVideo fullscreen={fullscreen} onOpen={() => setFullscreen(true)} />
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
      <Modal
        visible={fullscreen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreen(false)}
      >
        <View
          style={[
            styles.fullscreen,
            {
              paddingTop: Math.max(12, insets.top),
              paddingBottom: Math.max(12, insets.bottom),
            },
          ]}
        >
          <BrainwashFullscreenVideo />
          <PrimaryButton
            title="閉じる"
            tone="secondary"
            onPress={() => setFullscreen(false)}
          />
        </View>
      </Modal>
    </Screen>
  );
}

function BrainwashVideo({
  fullscreen,
  onOpen,
}: {
  fullscreen: boolean;
  onOpen: () => void;
}) {
  const player = useVideoPlayer(require("../../assets/videos/brainwash_01.mp4"), (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.volume = 0;
    instance.play();
  });

  return (
    <View style={styles.videoPreview}>
      {!fullscreen ? (
        <>
          <VideoView
            player={player}
            nativeControls={false}
            contentFit="cover"
            style={styles.video}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="洗脳動画を拡大表示"
            onPress={onOpen}
            style={styles.videoTapArea}
          />
        </>
      ) : (
        <View style={styles.videoPlaceholder}>
          <AppText variant="muted">動画を拡大表示中</AppText>
        </View>
      )}
    </View>
  );
}

function BrainwashFullscreenVideo() {
  const player = useVideoPlayer(require("../../assets/videos/brainwash_01.mp4"), (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.volume = 0;
    instance.play();
  });

  return (
    <VideoView
      player={player}
      nativeControls={false}
      contentFit="contain"
      style={styles.fullscreenVideo}
    />
  );
}

const styles = StyleSheet.create({
  title: { color: "#c000ff" },
  card: { borderColor: "#c000ff" },
  videoPreview: {
    position: "relative",
    overflow: "hidden",
    height: 260,
    borderWidth: 1,
    borderColor: "#c000ff",
    borderRadius: 4,
    backgroundColor: "#000",
  },
  video: { width: "100%", height: "100%" },
  videoTapArea: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  videoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  fullscreen: {
    flex: 1,
    gap: 10,
    paddingHorizontal: 10,
    backgroundColor: "#000",
  },
  fullscreenVideo: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000",
  },
  warning: { color: "#ff4b55", fontWeight: "900" },
});
