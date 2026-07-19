import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import {
  formatConfiguredMessage,
  punishmentSessionMessages,
  roomMessages,
  type ConfigurableMessage,
} from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { PunishmentMedia } from "@/components/PunishmentMedia";
import { useAppAudio } from "@/audio/AudioProvider";
import { secondsToClock } from "@/utils/date";
import { lightTheme } from "@/constants/theme";
import { achievementRepository } from "@/repositories/achievementRepository";
import { contractService } from "@/services/gameRoomService";
import {
  fileStorageService,
  type StoredFile,
} from "@/services/fileStorageService";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppModal } from "@/components/AppModalProvider";

const gaugeSpeeds = [
  { label: "ゆっくり", value: 0.5 },
  { label: "一定", value: 1 },
  { label: "速い", value: 3 },
  { label: "急加速", value: 5 },
] as const;

const punishmentComments = punishmentSessionMessages;

const markerCount = 3;

function createRandomMarkerOffsets(
  count: number,
  slotCount = 16,
  minimumGap = 4,
) {
  const slots = Array.from({ length: slotCount }, (_, index) => index);
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [slots[index], slots[swapIndex]] = [slots[swapIndex], slots[index]];
  }
  const selected: number[] = [];
  for (const slot of slots) {
    const hasEnoughSpace = selected.every((current) => {
      const distance = Math.abs(slot - current);
      return Math.min(distance, slotCount - distance) >= minimumGap;
    });
    if (hasEnoughSpace) selected.push(slot);
    if (selected.length === count) break;
  }
  return selected.sort((a, b) => a - b).map((slot) => slot / slotCount);
}

export default function TimerScreen() {
  const insets = useSafeAreaInsets();
  const [minutes, setMinutes] = useState("1");
  const [totalSeconds, setTotalSeconds] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [running, setRunning] = useState(false);
  const [gaugeElapsed, setGaugeElapsed] = useState(0);
  const [minMinutes, setMinMinutes] = useState(1);
  const [trackWidth, setTrackWidth] = useState(1);
  const [markerOffsets, setMarkerOffsets] = useState(() =>
    createRandomMarkerOffsets(markerCount),
  );
  const [target, setTarget] = useState<"金玉" | "チンポ">("金玉");
  const [speedLabel, setSpeedLabel] = useState("ゆっくり");
  const [punishmentFiles, setPunishmentFiles] = useState<StoredFile[]>([]);
  const [mediaMode, setMediaMode] = useState<"default" | "stored">("default");
  const [punishmentComment, setPunishmentComment] = useState<ConfigurableMessage>(
    punishmentComments[0],
  );
  const previousGaugeProgress = useRef(0);
  const lastCommentSlot = useRef(-1);
  const sessionRecorded = useRef(false);
  const startedAt = useRef(0);
  const gaugePosition = useRef(0);
  const gaugeSpeed = useRef<number>(gaugeSpeeds[0].value);
  const lastGaugeTick = useRef(0);
  const nextSpeedChangeAt = useRef(0);
  const { playEffect, stopEffect, setSessionAudioActive, settings } = useAppAudio();
  const { showNotice } = useAppModal();

  useEffect(
    () => () => {
      stopEffect("trainingStart");
      setSessionAudioActive(false);
    },
    [setSessionAudioActive, stopEffect],
  );
  useEffect(() => {
    contractService.load().then((contract) => {
      const minimum = contract.signedAt ? 30 : 1;
      setMinMinutes(minimum);
      setMinutes(String(minimum));
      setTotalSeconds(minimum * 60);
      setRemaining(minimum * 60);
    });
  }, []);
  useFocusEffect(
    useCallback(() => {
      fileStorageService.list("punishment").then((files) => {
        const mediaFiles = files.filter((file) =>
          /\.(png|jpe?g|webp|gif|mp4)$/i.test(file.name),
        );
        setPunishmentFiles(mediaFiles);
        if (mediaFiles.length === 0) setMediaMode("default");
      });
    }, []),
  );

  useEffect(() => {
    if (!running) return;
    lastGaugeTick.current = Date.now();
    const animation = setInterval(() => {
      const now = Date.now();
      const deltaSeconds = Math.max(0, now - lastGaugeTick.current) / 1000;
      lastGaugeTick.current = now;
      if (now >= nextSpeedChangeAt.current) {
        const next =
          gaugeSpeeds[Math.floor(Math.random() * gaugeSpeeds.length)];
        gaugeSpeed.current = next.value;
        setSpeedLabel(next.label);
        nextSpeedChangeAt.current = now + 2000 + Math.random() * 4000;
      }
      gaugePosition.current += deltaSeconds * gaugeSpeed.current;
      const nextGaugeProgress = (gaugePosition.current / 5) % 1;
      const reachedTarget = markerOffsets.some((offset) => {
        const previousPhase = (previousGaugeProgress.current + offset) % 1;
        const nextPhase = (nextGaugeProgress + offset) % 1;
        return nextPhase < previousPhase;
      });
      if (reachedTarget) {
        playEffect("punishmentHit");
      }
      previousGaugeProgress.current = nextGaugeProgress;
      setGaugeElapsed(gaugePosition.current);
    }, 50);
    return () => clearInterval(animation);
  }, [markerOffsets, playEffect, running]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setRemaining((value) => {
        return Math.max(0, value - 1);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const elapsedSeconds = Math.max(0, totalSeconds - remaining);
    const targetSlot = Math.floor(elapsedSeconds / 30);
    setTarget(targetSlot % 2 === 0 ? "金玉" : "チンポ");
  }, [remaining, running, totalSeconds]);

  useEffect(() => {
    if (!running) return;
    const elapsedSeconds = Math.max(0, totalSeconds - remaining);
    const commentSlot = Math.floor(elapsedSeconds / 10);
    if (commentSlot === lastCommentSlot.current) return;
    lastCommentSlot.current = commentSlot;
    setPunishmentComment((current) => {
      const candidates = punishmentComments.filter(
        (comment) => comment !== current,
      );
      return (
        candidates[Math.floor(Math.random() * candidates.length)] ??
        punishmentComments[0]
      );
    });
  }, [remaining, running, totalSeconds]);

  useEffect(() => {
    if (!running || remaining !== 0 || sessionRecorded.current) return;
    sessionRecorded.current = true;
    achievementRepository.recordPunishment(totalSeconds);
    stopEffect("trainingStart");
    setSessionAudioActive(false);
    playEffect("complete");
    setRunning(false);
  }, [playEffect, remaining, running, setSessionAudioActive, stopEffect, totalSeconds]);

  function start() {
    const enteredMinutes = Number(minutes);
    if (!Number.isFinite(enteredMinutes) || enteredMinutes < minMinutes) {
      showNotice(
        "時間を確認してください",
        `お仕置き時間は${minMinutes}分以上で設定してください。`,
      );
      return;
    }
    const normalizedMinutes = Math.floor(enteredMinutes);
    const duration = normalizedMinutes * 60;
    setMinutes(String(normalizedMinutes));
    setTotalSeconds(duration);
    setRemaining(duration);
    setGaugeElapsed(0);
    startedAt.current = Date.now();
    gaugePosition.current = 0;
    gaugeSpeed.current = gaugeSpeeds[0].value;
    lastGaugeTick.current = startedAt.current;
    nextSpeedChangeAt.current = startedAt.current + 30000;
    setSpeedLabel(gaugeSpeeds[0].label);
    setTarget("金玉");
    previousGaugeProgress.current = 0;
    lastCommentSlot.current = 0;
    setPunishmentComment(
      punishmentComments[Math.floor(Math.random() * punishmentComments.length)],
    );
    setMarkerOffsets(createRandomMarkerOffsets(markerCount));
    sessionRecorded.current = false;
    setSessionAudioActive(true);
    playEffect("trainingStart");
    setRunning(true);
  }

  function stop() {
    if (!sessionRecorded.current)
      achievementRepository.recordPunishment(totalSeconds - remaining);
    sessionRecorded.current = true;
    stopEffect("trainingStart");
    setSessionAudioActive(false);
    setRunning(false);
  }

  return (
    <Screen>
      <AppText variant="title" style={styles.roomTitle}>
        お仕置き部屋
      </AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/punishment-nino.png")}
        roomName="お仕置き部屋"
        lines={roomMessages.punishment.lines}
        contractLines={roomMessages.punishment.contractLines}
      />
      <Card>
        <AppText variant="subtitle">表示するファイル</AppText>
        <View style={styles.mediaChoices}>
          <View style={styles.mediaChoice}>
            <PrimaryButton
              title="デフォルト動画 (2)"
              tone={mediaMode === "default" ? "primary" : "secondary"}
              onPress={() => setMediaMode("default")}
            />
          </View>
          {punishmentFiles.length > 0 ? (
            <View style={styles.mediaChoice}>
              <PrimaryButton
                title={`格納ファイル (${punishmentFiles.length})`}
                tone={mediaMode === "stored" ? "primary" : "secondary"}
                onPress={() => setMediaMode("stored")}
              />
            </View>
          ) : null}
        </View>
      </Card>
      <Card>
        <PunishmentMedia
          key={mediaMode}
          active={false}
          files={punishmentFiles}
          useStored={mediaMode === "stored"}
        />
        <TextField
          label={`時間（分）・最低 ${minMinutes}分`}
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
          editable={!running}
        />
        <PrimaryButton
          title={remaining === 0 ? "もう一度開始" : "お仕置き開始"}
          onPress={start}
        />
      </Card>
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
      <Modal
        visible={running}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View
          style={[
            styles.fullscreenWrap,
            {
              paddingTop: Math.max(12, insets.top),
              paddingBottom: Math.max(12, insets.bottom),
            },
          ]}
        >
          <View style={styles.fullscreenMediaFrame}>
            <PunishmentMedia
              active
              files={punishmentFiles}
              useStored={mediaMode === "stored"}
              fullscreen
            />
          </View>
          <View style={styles.punishmentComment}>
            <AppText style={styles.punishmentCommentName}>ニノ</AppText>
            <AppText style={styles.punishmentCommentText}>
              {formatConfiguredMessage(
                punishmentComment,
                settings?.playerName.trim() ?? "",
              )}
            </AppText>
          </View>
          <View style={styles.rhythmFrame}>
            <View style={styles.rhythmHeader}>
              <View>
                <View style={styles.rhythmTitleGroup}>
                  <AppText variant="label">RHYTHM</AppText>
                  <AppText style={styles.rhythmElapsed}>
                    経過時間 {secondsToClock(Math.max(0, totalSeconds - remaining))}
                  </AppText>
                </View>
                <AppText style={styles.speed}>速度：{speedLabel}</AppText>
              </View>
              <AppText style={styles.target}>{target}にビンタ</AppText>
            </View>
            <View
              onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
            style={styles.track}
          >
            <View style={styles.line} />
            <View style={styles.hitPoint} />
              {Array.from({ length: markerCount }, (_, index) => {
                const phase = (gaugeElapsed / 5 + markerOffsets[index]) % 1;
                const left = 26 + (1 - phase) * Math.max(0, trackWidth - 46);
                const opacity = phase > 0.92 ? Math.max(0, (1 - phase) / 0.08) : 1;
                return (
                  <View key={index} style={[styles.marker, { left, opacity }]}> 
                    <AppText style={styles.markerSpade}>♠</AppText>
                    <AppText style={styles.markerLetter}>Q</AppText>
                  </View>
                );
              })}
            </View>
          </View>
          <PrimaryButton title="ギブアップ" tone="danger" onPress={stop} />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fullscreenWrap: { flex: 1, gap: 8, paddingHorizontal: 10, backgroundColor: "#000" },
  fullscreenMediaFrame: { flex: 1, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  mediaChoices: { flexDirection: "row", gap: 8 },
  mediaChoice: { flex: 1 },
  punishmentComment: {
    marginHorizontal: 2,
    borderWidth: 1,
    borderColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#080808",
  },
  punishmentCommentName: {
    marginBottom: 4,
    color: lightTheme.danger,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  punishmentCommentText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "900",
  },
  roomTitle: { color: lightTheme.danger },
  clock: {
    color: "#fff",
    fontSize: 54,
    lineHeight: 72,
    fontWeight: "900",
    textAlign: "center",
    paddingVertical: 4,
  },
  rhythmFrame: {
    borderWidth: 1,
    borderColor: "#777",
    backgroundColor: "#151515",
  },
  rhythmHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  rhythmTitleGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  rhythmElapsed: { color: lightTheme.muted, fontSize: 9, fontWeight: "800" },
  target: { color: lightTheme.danger, fontSize: 18, fontWeight: "900" },
  speed: { color: "#ff9bc7", fontSize: 11, fontWeight: "900" },
  track: {
    overflow: "hidden",
    height: 58,
    justifyContent: "center",
    marginHorizontal: 8,
    borderRadius: 4,
    backgroundColor: "#f3dce5",
  },
  line: {
    position: "absolute",
    right: 10,
    left: 20,
    height: 3,
    backgroundColor: "#d17a9b",
  },
  hitPoint: {
    position: "absolute",
    left: 15,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 4,
    borderColor: "#ff69b4",
    backgroundColor: "transparent",
    zIndex: 3,
  },
  marker: {
    position: "absolute",
    top: 7,
    width: 34,
    height: 42,
    marginLeft: -17,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  markerSpade: {
    position: "absolute",
    width: 34,
    height: 42,
    color: "#050505",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    textAlign: "center",
    includeFontPadding: false,
  },
  markerLetter: {
    position: "absolute",
    width: 34,
    height: 42,
    color: "#fff",
    fontSize: 11,
    lineHeight: 36,
    fontWeight: "900",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
});
