import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { lightTheme } from "@/constants/theme";
import {
  formatConfiguredMessage,
  trainingStageMessages,
  type ConfigurableMessage,
} from "@/constants/messages";
import { secondsToClock } from "@/utils/date";
import { useAppAudio } from "@/audio/AudioProvider";
import type { StoredFile } from "@/services/fileStorageService";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const defaultVideos = [
  require("../../assets/videos/habits_1.mp4"),
  require("../../assets/videos/habits_2.mp4"),
  require("../../assets/videos/habits_3.mp4"),
  require("../../assets/videos/habits_4.mp4"),
  require("../../assets/videos/habits_5.mp4"),
  require("../../assets/videos/habits_6.mp4"),
];

function selectRandomVideoIndex(excludeIndex?: number) {
  const candidates = defaultVideos
    .map((_, index) => index)
    .filter((index) => index !== excludeIndex);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
}

function isStoredVideo(file?: StoredFile) {
  return Boolean(file && /\.mp4$/i.test(file.name));
}

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
  const offsets = selected.sort((a, b) => a - b).map((slot) => slot / slotCount);
  const firstOffset = offsets[0] ?? 0;
  return offsets.map((offset) => offset - firstOffset);
}

const modes = [
  { key: "easy", label: "イージー", rate: 1 },
  { key: "normal", label: "ノーマル", rate: 3 },
  { key: "hard", label: "ハード", rate: 5 },
] as const;

const warmupComments = trainingStageMessages.warmup;
const trainingComments = trainingStageMessages.training;
const intensiveComments = trainingStageMessages.intensive;
const finishingComments = trainingStageMessages.finishing;

const warmupDurationSeconds = 30;
const intensiveStartSeconds = 300;
const finishingStartSeconds = 600;

type TrainingMode = (typeof modes)[number]["key"];

export type TrainingResult = {
  elapsedSeconds: number;
  difficulty: string;
};

export function TrainingVideo({
  onComplete,
  slides = [],
}: {
  onComplete: (result: TrainingResult) => void;
  slides?: StoredFile[];
}) {
  const insets = useSafeAreaInsets();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = useState(0);
  const [gaugeElapsed, setGaugeElapsed] = useState(0);
  const [gaugeStarted, setGaugeStarted] = useState(false);
  const [gaugeProgress, setGaugeProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [trackWidth, setTrackWidth] = useState(1);
  const [markerOffsets, setMarkerOffsets] = useState(() => createRandomMarkerOffsets(markerCount));
  const [mode, setMode] = useState<TrainingMode>("normal");
  const [slideIndex, setSlideIndex] = useState(() =>
    slides.length > 0 ? Math.floor(Math.random() * slides.length) : 0,
  );
  const [defaultVideoIndex, setDefaultVideoIndex] = useState(0);
  const [trainingComment, setTrainingComment] = useState<ConfigurableMessage>(warmupComments[0]);
  const elapsedMilliseconds = useRef(0);
  const lastTick = useRef(0);
  const previousGaugeProgress = useRef(0);
  const lastCommentSlot = useRef(-1);
  const videoLoopCount = useRef(0);
  const { playEffect, stopEffect, setSessionAudioActive, settings } = useAppAudio();
  const storedMode = slides.length > 0;
  const currentStoredFile = slides[slideIndex % Math.max(1, slides.length)];
  const showingStoredVideo = storedMode && isStoredVideo(currentStoredFile);
  const player = useVideoPlayer(defaultVideos[0], (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.volume = 0;
    instance.playbackRate = 1;
  });

  useEffect(
    () => () => {
      stopEffect("trainingStart");
      setSessionAudioActive(false);
    },
    [setSessionAudioActive, stopEffect],
  );

  const showRandomComment = useCallback((elapsedSeconds = elapsedMilliseconds.current / 1000) => {
    if (
      elapsedSeconds >= intensiveStartSeconds &&
      elapsedSeconds < finishingStartSeconds
    ) {
      const sequenceIndex = Math.floor(
        (elapsedSeconds - intensiveStartSeconds) / 10,
      ) % intensiveComments.length;
      setTrainingComment(intensiveComments[sequenceIndex]);
      return;
    }

    const comments = elapsedSeconds < warmupDurationSeconds
      ? warmupComments
      : elapsedSeconds < intensiveStartSeconds
        ? trainingComments
        : finishingComments;
    setTrainingComment((current) => {
      const candidates = comments.filter((comment) => comment !== current);
      return candidates[Math.floor(Math.random() * candidates.length)] ?? comments[0];
    });
  }, []);

  useEventListener(player, "playToEnd", () => {
    if (!started) return;
    if (storedMode) {
      videoLoopCount.current = 0;
      setSlideIndex((index) => (index + 1) % slides.length);
      showRandomComment();
      return;
    }
    if (videoLoopCount.current < 2) {
      videoLoopCount.current += 1;
      player.replay();
      return;
    }
    videoLoopCount.current = 0;
    const nextIndex = selectRandomVideoIndex(defaultVideoIndex);
    setDefaultVideoIndex(nextIndex);
    showRandomComment();
    player
      .replaceAsync(defaultVideos[nextIndex])
      .then(() => {
        player.muted = true;
        player.volume = 0;
        player.playbackRate = 1;
        player.play();
      })
      .catch(console.error);
  });

  useEffect(() => {
    if (!storedMode || !showingStoredVideo || !currentStoredFile) return;
    player
      .replaceAsync({ uri: currentStoredFile.uri })
      .then(() => {
        player.muted = true;
        player.volume = 0;
        player.playbackRate = 1;
        if (started) player.play();
        else {
          player.currentTime = 0.1;
          player.pause();
        }
      })
      .catch(console.error);
  }, [currentStoredFile, player, showingStoredVideo, started, storedMode]);

  useEffect(() => {
    if (!started || !storedMode || showingStoredVideo || slides.length === 0) return;
    const timer = setInterval(() => {
      setSlideIndex((index) => (index + 1) % slides.length);
      showRandomComment();
    }, 10000);
    return () => clearInterval(timer);
  }, [showRandomComment, showingStoredVideo, slides.length, started, storedMode]);

  useEffect(() => {
    lastTick.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const activelyPlaying = storedMode
        ? showingStoredVideo
          ? player.playing
          : playing
        : player.playing;
      if (activelyPlaying)
        elapsedMilliseconds.current += now - lastTick.current;
      lastTick.current = now;
      const selectedMode = modes.find((item) => item.key === mode) ?? modes[1];
      const elapsed = elapsedMilliseconds.current / 1000;
      setSessionElapsedSeconds(Math.floor(elapsed));
      const mediaTime = storedMode ? elapsed : player.currentTime || 0;
      const mediaDuration = storedMode
        ? Math.max(1, slides.length * 10)
        : player.duration || 0;
      const rhythmTime = Math.max(0, elapsed - 3) * selectedMode.rate;
      const nextGaugeProgress = (rhythmTime % 5) / 5;
      setGaugeStarted(elapsed >= 3);
      setGaugeElapsed(rhythmTime);
      const commentSlot = Math.floor(elapsed / 10);
      if (activelyPlaying && commentSlot !== lastCommentSlot.current) {
        lastCommentSlot.current = commentSlot;
        showRandomComment(elapsed);
      }
      setCurrentTime(mediaDuration > 0 ? mediaTime % mediaDuration : 0);
      setDuration(mediaDuration);
      if (activelyPlaying && elapsed >= 3) {
        const reachedTarget = markerOffsets.some((offset) => {
          if (rhythmTime < offset * 5) return false;
          const previousPhase = (previousGaugeProgress.current - offset + 1) % 1;
          const nextPhase = (nextGaugeProgress - offset + 1) % 1;
          return nextPhase < previousPhase;
        });
        if (reachedTarget) playEffect("trainingRhythm");
      }
      previousGaugeProgress.current = nextGaugeProgress;
      setGaugeProgress(nextGaugeProgress);
      if (!storedMode) setPlaying(player.playing);
    }, 50);
    return () => clearInterval(timer);
  }, [markerOffsets, mode, player, playEffect, playing, showRandomComment, showingStoredVideo, slides.length, storedMode]);

  function startTraining() {
    elapsedMilliseconds.current = 0;
    setSessionElapsedSeconds(0);
    setGaugeElapsed(0);
    setGaugeStarted(false);
    setGaugeProgress(0);
    lastTick.current = Date.now();
    previousGaugeProgress.current = 0;
    setMarkerOffsets(createRandomMarkerOffsets(markerCount));
    lastCommentSlot.current = 0;
    videoLoopCount.current = 0;
    showRandomComment(0);
    setSessionAudioActive(true);
    playEffect("trainingStart");
    setStarted(true);
    if (!storedMode) {
      const firstVideoIndex = selectRandomVideoIndex();
      setDefaultVideoIndex(firstVideoIndex);
      player
        .replaceAsync(defaultVideos[firstVideoIndex])
        .then(() => {
          player.muted = true;
          player.volume = 0;
          player.playbackRate = 1;
          player.play();
        })
        .catch(console.error);
    } else if (showingStoredVideo && currentStoredFile) {
      player
        .replaceAsync({ uri: currentStoredFile.uri })
        .then(() => {
          player.muted = true;
          player.volume = 0;
          player.playbackRate = 1;
          player.play();
        })
        .catch(console.error);
    }
    setPlaying(true);
  }

  function completeTraining() {
    if (!started) return;
    if (!storedMode || showingStoredVideo) player.pause();
    setPlaying(false);
    setStarted(false);
    stopEffect("trainingStart");
    setSessionAudioActive(false);
    playEffect("ejaculation");
    const selected = modes.find((item) => item.key === mode) ?? modes[1];
    onComplete({
      elapsedSeconds: Math.max(
        1,
        Math.floor(elapsedMilliseconds.current / 1000),
      ),
      difficulty: selected.label,
    });
  }

  const media = storedMode && !showingStoredVideo ? (
    <Image
      source={{ uri: slides[slideIndex]?.uri }}
      style={started ? styles.fullscreenMedia : styles.video}
      resizeMode="contain"
    />
  ) : (
    <VideoView
      player={player}
      style={started ? styles.fullscreenMedia : styles.video}
      nativeControls={false}
      contentFit="contain"
    />
  );

  const rhythmGauge = (
    <View style={[styles.rhythmFrame, started && styles.fullscreenRhythm]}>
      <View style={styles.rhythmTitle}>
        <View style={styles.rhythmTitleGroup}>
          <AppText style={styles.rhythmTitleText}>RHYTHM</AppText>
          <AppText style={styles.rhythmElapsedText}>
            経過時間 {secondsToClock(sessionElapsedSeconds)}
          </AppText>
        </View>
        <AppText style={styles.rhythmSubText}>ピンクのポイントで消滅</AppText>
      </View>
      <View
        accessibilityLabel="動画に同期したリズムゲージ"
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        style={styles.track}
      >
        <View style={styles.line} />
        <View style={styles.hitPoint} />
        {Array.from({ length: markerCount }, (_, index) => {
          const offset = markerOffsets[index];
          if (started && !gaugeStarted) return null;
          if (started && gaugeElapsed < offset * 5) return null;
          const phase = (gaugeProgress - offset + 1) % 1;
          const travelWidth = Math.max(0, trackWidth - 56);
          const left = 26 + (1 - phase) * travelWidth;
          const opacity = phase > 0.92 ? Math.max(0, (1 - phase) / 0.08) : 1;
          return (
            <View
              key={index}
              style={[styles.rhythmMarker, { left, opacity }]}
            >
              <AppText style={styles.rhythmMarkerHeart}>♥</AppText>
              <AppText style={styles.rhythmMarkerText}>シコ</AppText>
            </View>
          );
        })}
      </View>
    </View>
  );

  if (started) {
    return (
      <Modal
        visible
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
          <View style={styles.fullscreenMediaFrame}>{media}</View>
          <View style={styles.trainingComment}>
            <AppText style={styles.trainingCommentName}>ニノ</AppText>
            <AppText style={styles.trainingCommentText}>
              {formatConfiguredMessage(
                trainingComment,
                settings?.playerName.trim() ?? "",
              )}
            </AppText>
          </View>
          {rhythmGauge}
          <View style={styles.fullscreenCompleteButton}>
            <PrimaryButton
              title="射精しました"
              tone="danger"
              onPress={completeTraining}
            />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View style={styles.wrap}>
      {media}
      <View style={styles.mediaBadge}>
        <AppText style={styles.mediaBadgeText}>
          {storedMode
            ? `格納ファイル ${slideIndex + 1}/${slides.length}`
            : `DEFAULT VIDEO ${defaultVideoIndex + 1}/${defaultVideos.length}`}
        </AppText>
      </View>
      <View style={styles.modePanel}>
        <AppText style={styles.modeLabel}>MODE / GAUGE SPEED</AppText>
        <View style={styles.modeButtons}>
          {modes.map((item) => {
            const selected = item.key === mode;
            return (
              <Pressable
                key={item.key}
                disabled={started}
                onPress={() => setMode(item.key)}
                style={[
                  styles.modeButton,
                  selected && styles.modeButtonSelected,
                  started && !selected && styles.modeButtonDisabled,
                ]}
              >
                <AppText
                  style={[
                    styles.modeButtonText,
                    selected && styles.modeButtonTextSelected,
                  ]}
                >
                  {item.label}
                </AppText>
                <AppText
                  style={[
                    styles.rateText,
                    selected && styles.modeButtonTextSelected,
                  ]}
                >
                  ×{item.rate}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {!started ? (
          <>
            <AppText variant="muted">
              難易度を選択してから開始してください。
            </AppText>
            <PrimaryButton title="調教開始" onPress={startTraining} />
          </>
        ) : (
          <AppText style={styles.startedText}>
            調教中 / 難易度は変更できません
          </AppText>
        )}
      </View>
      <View style={styles.waitingTime}>
        <AppText variant="muted">
          {secondsToClock(currentTime)} / {secondsToClock(duration)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 4,
    backgroundColor: "#000",
  },
  video: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  fullscreenWrap: { flex: 1, backgroundColor: "#000" },
  fullscreenMediaFrame: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  fullscreenMedia: { width: "100%", height: "100%", backgroundColor: "#000" },
  trainingComment: {
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#080808",
  },
  trainingCommentName: {
    marginBottom: 4,
    color: lightTheme.danger,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  trainingCommentText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 23,
  },
  mediaBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    borderWidth: 1,
    borderColor: "#fff",
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  mediaBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  modePanel: { gap: 7, paddingHorizontal: 14, paddingTop: 14 },
  modeLabel: {
    color: lightTheme.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  modeButtons: { flexDirection: "row", gap: 7 },
  modeButton: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#777",
    paddingHorizontal: 4,
    paddingVertical: 8,
    backgroundColor: "#050505",
  },
  modeButtonSelected: {
    borderColor: "#fff",
    backgroundColor: lightTheme.danger,
  },
  modeButtonDisabled: { opacity: 0.38 },
  modeButtonText: { color: lightTheme.muted, fontSize: 12, fontWeight: "900" },
  modeButtonTextSelected: { color: "#fff" },
  rateText: { color: "#777", fontSize: 9, fontWeight: "800" },
  startedText: {
    color: lightTheme.danger,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  rhythmFrame: {
    marginHorizontal: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#777",
    backgroundColor: "#151515",
  },
  fullscreenRhythm: { marginTop: 8, marginHorizontal: 10 },
  rhythmTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 9,
    paddingTop: 6,
  },
  rhythmTitleText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  rhythmTitleGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  rhythmElapsedText: { color: lightTheme.muted, fontSize: 8, fontWeight: "800" },
  rhythmSubText: { color: lightTheme.muted, fontSize: 9 },
  track: {
    overflow: "hidden",
    height: 58,
    justifyContent: "center",
    marginHorizontal: 8,
  },
  line: {
    position: "absolute",
    right: 10,
    left: 20,
    height: 3,
    backgroundColor: "#ddd",
  },
  hitPoint: {
    position: "absolute",
    left: 16,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ff69b4",
    backgroundColor: "transparent",
    zIndex: 3,
  },
  rhythmMarker: {
    position: "absolute",
    width: 44,
    height: 50,
    marginLeft: -22,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  rhythmMarkerHeart: {
    position: "absolute",
    color: "#ff69b4",
    fontSize: 40,
    lineHeight: 50,
    fontWeight: "900",
    includeFontPadding: false,
    textAlign: "center",
  },
  rhythmMarkerText: {
    position: "absolute",
    width: 44,
    height: 50,
    color: "#fff",
    fontSize: 7,
    lineHeight: 50,
    fontWeight: "900",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    textShadowColor: "#a60050",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  waitingTime: {
    alignItems: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fullscreenCompleteButton: { paddingHorizontal: 10, paddingTop: 10 },
});
