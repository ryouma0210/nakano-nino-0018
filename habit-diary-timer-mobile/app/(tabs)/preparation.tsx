import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import {
  formatConfiguredMessage,
  preparationChecklistMessages,
  preparationLoopMessages,
  roomMessages,
} from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { preparationRepository } from "@/repositories/roomRepository";
import { formatDateJa, toDateKey } from "@/utils/date";
import { lightTheme } from "@/constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { useAppModal } from "@/components/AppModalProvider";

const items = preparationChecklistMessages;

const preparationComments = preparationLoopMessages;

export default function PreparationScreen() {
  const insets = useSafeAreaInsets();
  const { showError } = useAppModal();
  const { settings, playEffect, stopEffect, setSessionAudioActive } = useAppAudio();
  const playerName = settings?.playerName.trim() ?? "";
  const preparationPlayer = useVideoPlayer(
    require("../../assets/videos/preparation_1.mp4"),
    (player) => {
      player.loop = true;
      player.muted = true;
      player.volume = 0;
      player.play();
    },
  );
  const saved = preparationRepository.find();
  const savedChecks: string[] = saved ? JSON.parse(saved.checks_json) : [];
  const [checked, setChecked] = useState(() => new Set(savedChecks));
  const [completed, setCompleted] = useState(Boolean(saved));
  const [fullscreen, setFullscreen] = useState(false);
  const [commentIndex, setCommentIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      preparationPlayer.play();
      const enabled = Boolean(settings?.soundEnabled);
      setSessionAudioActive(enabled);
      if (enabled) playEffect("preparationLoop");
      return () => {
        // useVideoPlayer が画面破棄時にプレイヤーを自動解放する。
        // ここで pause() すると、解放処理との順序次第で
        // ERR_USING_RELEASED_SHARED_OBJECT が発生するため呼び出さない。
        stopEffect("preparationLoop");
        setSessionAudioActive(false);
      };
    }, [playEffect, preparationPlayer, setSessionAudioActive, settings?.soundEnabled, stopEffect]),
  );

  useFocusEffect(useCallback(() => {
    const current = preparationRepository.find();
    const currentChecks: string[] = current ? JSON.parse(current.checks_json) : [];
    setChecked(new Set(currentChecks));
    setCompleted(Boolean(current));
  }, []));
  const requiredComplete = items
    .filter((item) => item.required)
    .every((item) => checked.has(item.text));

  useEventListener(preparationPlayer, "playToEnd", () => {
    setCommentIndex((current) => {
      const offset =
        Math.floor(Math.random() * (preparationComments.length - 1)) + 1;
      return (current + offset) % preparationComments.length;
    });
  });

  useEffect(() => {
    preparationPlayer.play();
    const timer = setTimeout(() => {
      try {
        preparationPlayer.play();
      } catch (error) {
        console.warn("準備動画の再生を再試行できませんでした。", error);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [fullscreen, preparationPlayer]);

  function toggle(text: string) {
    if (completed) return;
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  }

  function complete() {
    try {
      preparationRepository.save(Array.from(checked));
      setCompleted(true);
      preparationPlayer.replay();
    } catch (error) {
      showError("準備部屋の保存に失敗しました", error);
    }
  }

  return (
    <Screen>
      <AppText variant="title">準備部屋</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/preparation-nino.png")}
        roomName="準備部屋"
        lines={roomMessages.preparation.lines}
        contractLines={roomMessages.preparation.contractLines}
      />
      <Card>
        <AppText variant="subtitle">発情してない人向け</AppText>
        {!fullscreen ? (
          <View style={styles.videoPreview}>
            <VideoView
              player={preparationPlayer}
              style={styles.video}
              nativeControls={false}
              contentFit="contain"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="動画を拡大表示"
              onPress={() => {
                preparationPlayer.play();
                setFullscreen(true);
              }}
              style={styles.videoTapArea}
            />
          </View>
        ) : (
          <View style={styles.videoPlaceholder}>
            <AppText variant="muted">動画を拡大表示中</AppText>
          </View>
        )}
        <AppText style={styles.breath}>
          {formatConfiguredMessage(preparationComments[commentIndex], playerName)}
        </AppText>
      </Card>
      <Card>
        <AppText variant="subtitle">{formatDateJa(toDateKey())}</AppText>
        {items.map((item) => (
          <Pressable
            key={item.text}
            onPress={() => toggle(item.text)}
            style={styles.checkRow}
          >
            <AppText
              style={[styles.check, checked.has(item.text) && styles.checked]}
            >
              {checked.has(item.text) ? "✅" : "□"}
            </AppText>
            <View style={styles.grow}>
              <AppText>{item.text}</AppText>
              {!item.required ? <AppText variant="muted">任意</AppText> : null}
            </View>
          </Pressable>
        ))}
      </Card>
      {completed ? (
        <Card>
          <AppText style={styles.closing}>
            「本日も調教よろしくお願いいたします♡」
          </AppText>
          <AppText variant="muted">調教日記へ保存しました。</AppText>
        </Card>
      ) : (
        <PrimaryButton
          title={"準備完了♡本日も調教\nよろしくお願いいたします♡"}
          disabled={!requiredComplete}
          onPress={complete}
        />
      )}
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
          <PreparationFullscreenVideo />
          <AppText
            style={[
              styles.fullscreenBreath,
              { bottom: Math.max(78, insets.bottom + 78) },
            ]}
          >
            {formatConfiguredMessage(preparationComments[commentIndex], playerName)}
          </AppText>
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

function PreparationFullscreenVideo() {
  const player = useVideoPlayer(
    require("../../assets/videos/preparation_1.mp4"),
    (instance) => {
      instance.loop = true;
      instance.muted = true;
      instance.volume = 0;
      instance.play();
    },
  );

  useEffect(() => {
    player.play();
    const timer = setTimeout(() => {
      try {
        player.play();
      } catch (error) {
        console.warn("準備拡大動画の再生を再試行できませんでした。", error);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [player]);

  return (
    <VideoView
      player={player}
      style={styles.fullscreenVideo}
      nativeControls={false}
      contentFit="contain"
    />
  );
}

const styles = StyleSheet.create({
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingVertical: 12,
  },
  check: { width: 28, color: lightTheme.muted, fontSize: 20, lineHeight: 30 },
  checked: { color: "#fff" },
  grow: { flex: 1, gap: 2 },
  closing: {
    textAlign: "center",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 28,
  },
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#000",
  },
  videoPreview: { position: "relative" },
  videoTapArea: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  videoPlaceholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#000",
  },
  breath: {
    color: "#fff",
    fontSize: 24,
    lineHeight: 34,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 2,
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
  fullscreenBreath: {
    position: "absolute",
    right: 10,
    left: 10,
    zIndex: 20,
    color: "#fff",
    fontSize: 28,
    lineHeight: 40,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 2,
  },
  fullscreenClose: {
    position: "absolute",
    right: 10,
    left: 10,
    zIndex: 20,
  },
});
