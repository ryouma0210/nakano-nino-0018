import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
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

const heartLayers = [
  { size: 360, color: "#b000ff" },
  { size: 310, color: "#fff" },
  { size: 260, color: "#c52cff" },
  { size: 210, color: "#fff" },
  { size: 160, color: "#df5cff" },
  { size: 110, color: "#fff" },
  { size: 60, color: "#f08cff" },
] as const;

export default function DefeatScreen() {
  const insets = useSafeAreaInsets();
  const { showNotice } = useAppModal();
  const { settings, playEffect, stopEffect, setSessionAudioActive } =
    useAppAudio();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(0.65)).current;

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

  useEffect(() => {
    function showHeart() {
      heartOpacity.setValue(0);
      heartScale.setValue(0.65);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(heartOpacity, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.delay(900),
          Animated.timing(heartOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(heartScale, {
          toValue: 1.15,
          duration: 1650,
          useNativeDriver: true,
        }),
      ]).start();
    }
    showHeart();
    const timer = setInterval(showHeart, 5000);
    return () => clearInterval(timer);
  }, [heartOpacity, heartScale]);

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
      <ScrollView
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
          characterSource={require("../../assets/characters/defeat-nino.png")}
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
            項目を一つずつ認めて、強制的にチェックしなさい♡
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
          title={completed ? "本日は完全敗北済み♡" : "完全敗北を認めます♡"}
          tone="defeat"
          disabled={!allChecked || completed}
          onPress={complete}
        />
        <PrimaryButton
          title="ホームへ戻る"
          onPress={() => router.replace("/(tabs)")}
        />
      </ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.heartMotion,
          {
            opacity: heartOpacity,
            transform: [{ scale: heartScale }],
          },
        ]}
      >
        {heartLayers.map((layer) => (
          <View key={layer.size} style={styles.heartLayer}>
            <AppText
              style={[
                styles.heart,
                {
                  color: layer.color,
                  fontSize: layer.size,
                  lineHeight: layer.size,
                },
              ]}
            >
              ♡
            </AppText>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ff8fbd" },
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
  heartMotion: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  heartLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  heart: {
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(96,0,128,0.5)",
    textShadowRadius: 8,
  },
});
