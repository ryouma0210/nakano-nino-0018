import { useCallback, useEffect, useState } from "react";
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
  const { showNotice, showError } = useAppModal();
  const { settings, playEffect, stopEffect, setSessionAudioActive } = useAppAudio();
  const [fullscreen, setFullscreen] = useState(false);
  const [completed, setCompleted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setCompleted(hasCompletedToday());
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
    if (completed) return;
    try {
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
      if (!hasCompletedToday()) {
        throw new Error("洗脳部屋の保存結果を取得できませんでした。");
      }
      setCompleted(true);
      showNotice("洗脳完了", "洗脳完了しました。");
    } catch (error) {
      showError("洗脳部屋の保存に失敗しました", error);
    }
  }

  return (
    <Screen style={styles.screen}>
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
        <PrimaryButton
          title={completed ? "ご主人様の命令は絶対服従♡" : "洗脳完了しました。"}
          tone="defeat"
          disabled={completed}
          onPress={complete}
        />
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
          <View
            style={[
              styles.fullscreenClose,
              { bottom: Math.max(12, insets.bottom + 12) },
            ]}
          >
            <PrimaryButton
              title="閉じる"
              tone="secondary"
              onPress={() => setFullscreen(false)}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function hasCompletedToday() {
  return Boolean(
    journalRepository
      .list("洗脳部屋")
      .some(
        (journal) =>
          journal.record_date === toDateKey() &&
          journal.tags?.includes(`洗脳部屋${toDateKey()}`),
      ),
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

  useEffect(() => {
    if (fullscreen) return;
    player.play();
    setTimeout(() => {
      try {
        player.play();
      } catch (error) {
        console.warn("洗脳動画の再生を再試行できませんでした。", error);
      }
    }, 180);
  }, [fullscreen, player]);

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

  useEffect(() => {
    player.play();
    setTimeout(() => {
      try {
        player.play();
      } catch (error) {
        console.warn("洗脳拡大動画の再生を再試行できませんでした。", error);
      }
    }, 180);
  }, [player]);

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
  screen: { backgroundColor: "#ff8fbd" },
  title: { color: "#fff" },
  card: { borderColor: "#fff", backgroundColor: "#e94f93" },
  videoPreview: {
    position: "relative",
    overflow: "hidden",
    height: 260,
    borderWidth: 1,
    borderColor: "#fff",
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
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    backgroundColor: "#000",
  },
  fullscreenVideo: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
    alignSelf: "center",
    backgroundColor: "#000",
  },
  fullscreenClose: {
    position: "absolute",
    right: 10,
    left: 10,
    zIndex: 20,
  },
  warning: { color: "#ff4b55", fontWeight: "900" },
});
