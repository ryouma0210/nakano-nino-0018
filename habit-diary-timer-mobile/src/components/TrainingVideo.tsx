import { useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { lightTheme } from "@/constants/theme";
import { secondsToClock } from "@/utils/date";
import { useAppAudio } from "@/audio/AudioProvider";
import type { StoredFile } from "@/services/fileStorageService";

const defaultVideos = [
  require("../../assets/videos/habits_1.mp4"),
  require("../../assets/videos/habits_2.mp4"),
  require("../../assets/videos/habits_3.mp4"),
  require("../../assets/videos/habits_4.mp4"),
  require("../../assets/videos/habits_5.mp4"),
  require("../../assets/videos/habits_6.mp4"),
];

const modes = [
  { key: "easy", label: "イージー", rate: 1 },
  { key: "normal", label: "ノーマル", rate: 3 },
  { key: "hard", label: "ハード", rate: 5 },
] as const;

type TrainingMode = (typeof modes)[number]["key"];

export type TrainingResult = {
  elapsedSeconds: number;
  difficulty: string;
};

export function TrainingVideo({ onComplete, slides = [] }: { onComplete: (result: TrainingResult) => void; slides?: StoredFile[] }) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [gaugeProgress, setGaugeProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [trackWidth, setTrackWidth] = useState(1);
  const [mode, setMode] = useState<TrainingMode>("normal");
  const [slideIndex, setSlideIndex] = useState(0);
  const [defaultVideoIndex, setDefaultVideoIndex] = useState(0);
  const elapsedMilliseconds = useRef(0);
  const lastTick = useRef(0);
  const lastBeat = useRef(-1);
  const { playEffect } = useAppAudio();
  const slideMode = slides.length > 0;
  const player = useVideoPlayer(defaultVideos[0], (instance) => {
    instance.loop = false;
    instance.playbackRate = 1;
  });

  useEventListener(player, "playToEnd", () => {
    if (slideMode) return;
    const nextIndex = (defaultVideoIndex + 1) % defaultVideos.length;
    setDefaultVideoIndex(nextIndex);
    player.replaceAsync(defaultVideos[nextIndex]).then(() => {
      player.playbackRate = 1;
      player.play();
    }).catch(console.error);
  });

  useEffect(() => {
    lastTick.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const activelyPlaying = slideMode ? playing : player.playing;
      if (activelyPlaying) elapsedMilliseconds.current += now - lastTick.current;
      lastTick.current = now;
      const selectedMode = modes.find((item) => item.key === mode) ?? modes[1];
      const elapsed = elapsedMilliseconds.current / 1000;
      const mediaTime = slideMode ? elapsed : player.currentTime || 0;
      const mediaDuration = slideMode ? Math.max(1, slides.length * 3) : player.duration || 0;
      const rhythmTime = elapsed * selectedMode.rate;
      setCurrentTime(mediaDuration > 0 ? mediaTime % mediaDuration : 0);
      setDuration(mediaDuration);
      setGaugeProgress((rhythmTime % 5) / 5);
      if (slideMode) setSlideIndex(Math.floor(mediaTime / 3) % slides.length);
      const beat = Math.floor(rhythmTime);
      if (activelyPlaying && beat !== lastBeat.current) {
        if (lastBeat.current >= 0) playEffect("trainingRhythm");
        lastBeat.current = beat;
      }
      if (!slideMode) setPlaying(player.playing);
    }, 50);
    return () => clearInterval(timer);
  }, [mode, player, playEffect, playing, slideMode, slides.length]);

  function startTraining() {
    elapsedMilliseconds.current = 0;
    lastTick.current = Date.now();
    lastBeat.current = -1;
    setStarted(true);
    if (!slideMode) player.play();
    setPlaying(true);
  }

  function completeTraining() {
    if (!started) return;
    if (!slideMode) player.pause();
    setPlaying(false);
    playEffect("ejaculation");
    const selected = modes.find((item) => item.key === mode) ?? modes[1];
    onComplete({
      elapsedSeconds: Math.max(1, Math.floor(elapsedMilliseconds.current / 1000)),
      difficulty: selected.label,
    });
  }

  const markerCount = 5;

  const media = slideMode ? (
    <Image source={{ uri: slides[slideIndex]?.uri }} style={started ? styles.fullscreenMedia : styles.video} resizeMode="contain" />
  ) : (
    <VideoView player={player} style={started ? styles.fullscreenMedia : styles.video} nativeControls={false} contentFit="contain" />
  );

  const rhythmGauge = (
    <View style={[styles.rhythmFrame, started && styles.fullscreenRhythm]}>
      <View style={styles.rhythmTitle}>
        <AppText style={styles.rhythmTitleText}>RHYTHM</AppText>
        <AppText style={styles.rhythmSubText}>赤いポイントで消滅</AppText>
      </View>
      <View accessibilityLabel="動画に同期したリズムゲージ" onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} style={styles.track}>
        <View style={styles.line} />
        <View style={styles.hitGlow} />
        <View style={styles.hitPoint} />
        {Array.from({ length: markerCount }, (_, index) => {
          const phase = (gaugeProgress + index / markerCount) % 1;
          const travelWidth = Math.max(0, trackWidth - 46);
          const left = 26 + (1 - phase) * travelWidth;
          const opacity = phase > 0.92 ? Math.max(0, (1 - phase) / 0.08) : 1;
          return <View key={index} style={[styles.rhythmMarker, { left, opacity }]} />;
        })}
      </View>
    </View>
  );

  if (started) {
    return (
      <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <View style={styles.fullscreenWrap}>
          <View style={styles.fullscreenMediaFrame}>{media}</View>
          {rhythmGauge}
          <View style={styles.fullscreenCompleteButton}>
            <PrimaryButton title="射精しました" tone="danger" onPress={completeTraining} />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View style={styles.wrap}>
      {media}
      <View style={styles.mediaBadge}><AppText style={styles.mediaBadgeText}>{slideMode ? `SLIDE ${slideIndex + 1}/${slides.length}` : `DEFAULT VIDEO ${defaultVideoIndex + 1}/${defaultVideos.length}`}</AppText></View>
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
                style={[styles.modeButton, selected && styles.modeButtonSelected, started && !selected && styles.modeButtonDisabled]}
              >
                <AppText style={[styles.modeButtonText, selected && styles.modeButtonTextSelected]}>{item.label}</AppText>
                <AppText style={[styles.rateText, selected && styles.modeButtonTextSelected]}>×{item.rate}</AppText>
              </Pressable>
            );
          })}
        </View>
        {!started ? (
          <>
            <AppText variant="muted">難易度を選択してから開始してください。</AppText>
            <PrimaryButton title="調教開始" onPress={startTraining} />
          </>
        ) : (
          <AppText style={styles.startedText}>調教中 / 難易度は変更できません</AppText>
        )}
      </View>
      <View style={styles.waitingTime}><AppText variant="muted">{secondsToClock(currentTime)} / {secondsToClock(duration)}</AppText></View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", borderWidth: 1, borderColor: "#fff", borderRadius: 4, backgroundColor: "#000" },
  video: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  fullscreenWrap: { flex: 1, paddingTop: 28, paddingBottom: 18, backgroundColor: "#000" },
  fullscreenMediaFrame: { flex: 1, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  fullscreenMedia: { width: "100%", height: "100%", backgroundColor: "#000" },
  mediaBadge: { position: "absolute", top: 8, left: 8, borderWidth: 1, borderColor: "#fff", paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "rgba(0,0,0,0.78)" },
  mediaBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  modePanel: { gap: 7, paddingHorizontal: 14, paddingTop: 14 },
  modeLabel: { color: lightTheme.muted, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  modeButtons: { flexDirection: "row", gap: 7 },
  modeButton: { flex: 1, alignItems: "center", borderWidth: 1, borderColor: "#777", paddingHorizontal: 4, paddingVertical: 8, backgroundColor: "#050505" },
  modeButtonSelected: { borderColor: "#fff", backgroundColor: lightTheme.danger },
  modeButtonDisabled: { opacity: 0.38 },
  modeButtonText: { color: lightTheme.muted, fontSize: 12, fontWeight: "900" },
  modeButtonTextSelected: { color: "#fff" },
  rateText: { color: "#777", fontSize: 9, fontWeight: "800" },
  startedText: { color: lightTheme.danger, fontSize: 11, fontWeight: "900", textAlign: "center" },
  rhythmFrame: { marginHorizontal: 14, marginTop: 14, borderWidth: 1, borderColor: "#777", backgroundColor: "#151515" },
  fullscreenRhythm: { marginTop: 8, marginHorizontal: 10 },
  rhythmTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 9, paddingTop: 6 },
  rhythmTitleText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  rhythmSubText: { color: lightTheme.muted, fontSize: 9 },
  track: { overflow: "hidden", height: 44, justifyContent: "center", marginHorizontal: 8 },
  line: { position: "absolute", right: 10, left: 20, height: 3, backgroundColor: "#ddd" },
  hitGlow: { position: "absolute", left: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,47,47,0.22)" },
  hitPoint: { position: "absolute", left: 16, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#ffb0a5", backgroundColor: "#ed3b35", zIndex: 3 },
  rhythmMarker: { position: "absolute", width: 18, height: 18, marginLeft: -9, borderRadius: 9, borderWidth: 2, borderColor: "#fff1a3", backgroundColor: "#f1c84b", zIndex: 2 },
  waitingTime: { alignItems: "flex-end", paddingHorizontal: 14, paddingVertical: 10 },
  fullscreenCompleteButton: { paddingHorizontal: 10, paddingTop: 10 },
});
