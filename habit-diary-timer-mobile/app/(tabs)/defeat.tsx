import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { useAppModal } from "@/components/AppModalProvider";
import { defeatChecklistMessages, roomMessages } from "@/constants/messages";
import { useAppAudio } from "@/audio/AudioProvider";
import { contractService } from "@/services/gameRoomService";
import { defeatRepository } from "@/repositories/roomRepository";
import { formatDateJa, toDateKey } from "@/utils/date";

export default function DefeatScreen() {
  const insets = useSafeAreaInsets();
  const { showNotice } = useAppModal();
  const { settings, playEffect, stopEffect, setSessionAudioActive } =
    useAppAudio();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      contractService.load().then((contract) => {
        if (!active) return;
        if (!contract.signedAt) {
          router.replace("/(tabs)");
          return;
        }
        const saved = defeatRepository.find();
        if (active) {
          setChecked(new Set(saved ?? []));
          setCompleted(Boolean(saved));
        }
      });
      const audioEnabled = Boolean(settings?.soundEnabled);
      setSessionAudioActive(audioEnabled);
      if (audioEnabled) playEffect("defeatLoop");
      return () => {
        active = false;
        stopEffect("defeatLoop");
        setSessionAudioActive(false);
      };
    }, [playEffect, setSessionAudioActive, settings?.soundEnabled, stopEffect]),
  );

  function forceCheck(text: string) {
    if (completed) return;
    setChecked((current) => {
      if (current.has(text)) return current;
      const next = new Set(current).add(text);
      return next;
    });
  }

  function complete() {
    defeatRepository.save(Array.from(checked));
    setCompleted(true);
    showNotice(
      "敗北確定♡",
      "全項目を受け入れたわね♡ 今日の完全敗北を調教日記へ記録したわ♡",
    );
  }

  const allChecked = defeatChecklistMessages.every((item) => checked.has(item));

  return (
    <View style={styles.root}>
      <DefeatLoopVideo
        source={require("../../assets/videos/sennou.mp4")}
        style={styles.sennouVideo}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(12, insets.top),
            paddingBottom: Math.max(120, insets.bottom + 40),
          },
        ]}
      >
        <AppText variant="title" style={styles.whiteText}>
          敗北部屋
        </AppText>
        <RoomConversation
          characterVideoSource={require("../../assets/videos/defeat_01.mp4")}
          roomName="敗北部屋"
          lines={roomMessages.defeat.lines}
          contractLines={roomMessages.defeat.contractLines}
        />
        <Card style={styles.pinkCard}>
          <AppText variant="subtitle" style={styles.whiteText}>
            完全敗北の誓約
          </AppText>
          <AppText style={styles.dateText}>{formatDateJa(toDateKey())}</AppText>
          <AppText style={styles.whiteText}>
            項目を一つずつ、チンピクしながらチェックしなさい♡{"\n"}
            一度付けたチェックは外せないわよ♡
          </AppText>
          {defeatChecklistMessages.map((item) => (
            <Pressable
              key={item}
              onPress={() => forceCheck(item)}
              style={styles.checkRow}
            >
              <AppText style={styles.check}>
                {checked.has(item) ? "✅" : "□"}
              </AppText>
              <AppText
                style={[
                  styles.checkText,
                  checked.has(item) && styles.checkedText,
                ]}
              >
                {item}
              </AppText>
            </Pressable>
          ))}
        </Card>
        <PrimaryButton
          title={completed ? "完全敗北済み♡" : "完全敗北を認めます♡"}
          tone="defeat"
          disabled={!allChecked || completed}
          onPress={complete}
        />
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
      </ScrollView>
      <DefeatLoopVideo
        source={require("../../assets/videos/hartmaku.mp4")}
        style={styles.heartVideo}
      />
    </View>
  );
}

function DefeatLoopVideo({
  source,
  style,
}: {
  source: number;
  style: object;
}) {
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.volume = 0;
    instance.play();
  });

  return (
    <VideoView
      pointerEvents="none"
      player={player}
      nativeControls={false}
      contentFit="cover"
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ff8fbd", overflow: "hidden" },
  scroll: { zIndex: 2 },
  content: { gap: 14, paddingHorizontal: 16 },
  whiteText: { color: "#fff" },
  dateText: { color: "#fff", fontWeight: "900" },
  pinkCard: { borderColor: "#fff", backgroundColor: "#e94f93" },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.55)",
    paddingVertical: 13,
  },
  check: { width: 30, color: "#fff", fontSize: 20, lineHeight: 30 },
  checkText: { flex: 1, color: "#fff", fontWeight: "800" },
  checkedText: { color: "#fff", textDecorationLine: "underline" },
  sennouVideo: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
    opacity: 0.18,
  },
  heartVideo: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 5,
    opacity: 0.5,
  },
});
