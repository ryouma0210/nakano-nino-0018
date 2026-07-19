import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useAppAudio } from "@/audio/AudioProvider";
import { secondsToClock } from "@/utils/date";
import { lightTheme } from "@/constants/theme";
import { achievementRepository } from "@/repositories/achievementRepository";
import { contractService } from "@/services/gameRoomService";

const gaugeSpeeds = [
  { label: "ゆっくり", value: 0.5 },
  { label: "一定", value: 1 },
  { label: "速い", value: 3 },
  { label: "急加速", value: 5 },
] as const;

export default function TimerScreen() {
  const [minutes, setMinutes] = useState("10");
  const [totalSeconds, setTotalSeconds] = useState(600);
  const [remaining, setRemaining] = useState(600);
  const [running, setRunning] = useState(false);
  const [gaugeElapsed, setGaugeElapsed] = useState(0);
  const [maxMinutes, setMaxMinutes] = useState(30);
  const [trackWidth, setTrackWidth] = useState(1);
  const [target, setTarget] = useState<"チンポ" | "金玉">("チンポ");
  const [speedLabel, setSpeedLabel] = useState("ゆっくり");
  const lastBeat = useRef(-1);
  const sessionRecorded = useRef(false);
  const startedAt = useRef(0);
  const gaugePosition = useRef(0);
  const gaugeSpeed = useRef<number>(gaugeSpeeds[0].value);
  const lastGaugeTick = useRef(0);
  const nextSpeedChangeAt = useRef(0);
  const { playEffect } = useAppAudio();
  useEffect(() => { contractService.load().then((contract) => setMaxMinutes(contract.maxPunishmentMinutes)); }, []);

  useEffect(() => {
    if (!running) return;
    lastGaugeTick.current = Date.now();
    const animation = setInterval(() => {
      const now = Date.now();
      const deltaSeconds = Math.max(0, now - lastGaugeTick.current) / 1000;
      lastGaugeTick.current = now;
      if (now >= nextSpeedChangeAt.current) {
        const next = gaugeSpeeds[Math.floor(Math.random() * gaugeSpeeds.length)];
        gaugeSpeed.current = next.value;
        setSpeedLabel(next.label);
        nextSpeedChangeAt.current = now + 2000 + Math.random() * 4000;
      }
      gaugePosition.current += deltaSeconds * gaugeSpeed.current;
      setGaugeElapsed(gaugePosition.current);
    }, 50);
    return () => clearInterval(animation);
  }, [running]);

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
    if (!running || remaining !== 0 || sessionRecorded.current) return;
    sessionRecorded.current = true;
    achievementRepository.recordPunishment(totalSeconds);
    playEffect("complete");
    setRunning(false);
  }, [playEffect, remaining, running, totalSeconds]);

  const gaugeBeat = Math.floor(gaugeElapsed);
  useEffect(() => {
    if (!running || gaugeBeat === lastBeat.current) return;
    lastBeat.current = gaugeBeat;
    setTarget(Math.random() < 1 ? "金玉" : "チンポ");
    playEffect("punishmentHit");
  }, [gaugeBeat, playEffect, running]);

  function start() {
    const duration = Math.max(1, Math.min(maxMinutes, Number(minutes) || 1)) * 60;
    setTotalSeconds(duration);
    setRemaining(duration);
    setGaugeElapsed(0);
    startedAt.current = Date.now();
    gaugePosition.current = 0;
    gaugeSpeed.current = gaugeSpeeds[0].value;
    lastGaugeTick.current = startedAt.current;
    nextSpeedChangeAt.current = startedAt.current + 30000;
    setSpeedLabel(gaugeSpeeds[0].label);
    lastBeat.current = 0;
    sessionRecorded.current = false;
    setRunning(true);
  }

  function stop() {
    if (!sessionRecorded.current) achievementRepository.recordPunishment(totalSeconds - remaining);
    sessionRecorded.current = true;
    setRunning(false);
  }

  return (
    <Screen>
      <AppText variant="title" style={styles.roomTitle}>お仕置き部屋</AppText>
      <RoomConversation characterSource={require("../../assets/characters/punishment-nino.png")} roomName="お仕置き部屋" 
      lines={[
        { text: "時間は自分で決めなさい。" },
        { text: "黒いスペードがピンクの丸へ到達したら、表示された場所へビンタよ。" }]}
      contractLines={[
          { text: "契約済みの奴隷なら、最低10分以上。お仕置きから逃げずに最後まで受けなさい♡" },
          { text: "貞操帯着用している人は、金玉ビンタのみよ♡" }]} />
      <Card>
        <TextField label={`時間（分）・契約上限 ${maxMinutes}分`} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" editable={!running} />
        <AppText style={styles.clock}>{secondsToClock(remaining)}</AppText>
        <View style={styles.rhythmFrame}>
          <View style={styles.rhythmHeader}>
            <View><AppText variant="label">RHYTHM</AppText><AppText style={styles.speed}>速度：{speedLabel}</AppText></View>
            <AppText style={styles.target}>{target}にビンタ</AppText>
          </View>
          <View onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} style={styles.track}>
            <View style={styles.line} /><View style={styles.hitGlow} /><View style={styles.hitPoint} />
            {Array.from({ length: 5 }, (_, index) => {
              const phase = (gaugeElapsed / 5 + index / 5) % 1;
              const left = 26 + (1 - phase) * Math.max(0, trackWidth - 46);
              const opacity = phase > 0.92 ? Math.max(0, (1 - phase) / 0.08) : 1;
              return <AppText key={index} style={[styles.marker, { left, opacity }]}>♠</AppText>;
            })}
          </View>
        </View>
        {!running ? <PrimaryButton title={remaining === 0 ? "もう一度開始" : "開始"} onPress={start} /> : <PrimaryButton title="終了" tone="danger" onPress={stop} />}
      </Card>
      <PrimaryButton title="ホームへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  roomTitle: { color: lightTheme.danger },
  clock: { color: "#fff", fontSize: 54, lineHeight: 72, fontWeight: "900", textAlign: "center", paddingVertical: 4 },
  rhythmFrame: { borderWidth: 1, borderColor: "#777", backgroundColor: "#151515" },
  rhythmHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingTop: 8 },
  target: { color: lightTheme.danger, fontSize: 18, fontWeight: "900" },
  speed: { color: "#ff9bc7", fontSize: 11, fontWeight: "900" },
  track: { overflow: "hidden", height: 58, justifyContent: "center", marginHorizontal: 8, borderRadius: 4, backgroundColor: "#f3dce5" },
  line: { position: "absolute", right: 10, left: 20, height: 3, backgroundColor: "#d17a9b" },
  hitGlow: { position: "absolute", left: 8, width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,105,180,0.28)" },
  hitPoint: { position: "absolute", left: 15, width: 28, height: 28, borderRadius: 14, borderWidth: 4, borderColor: "#ff69b4", backgroundColor: "#ffd2e6", zIndex: 3 },
  marker: { position: "absolute", top: 7, width: 34, height: 42, marginLeft: -17, color: "#050505", fontSize: 34, lineHeight: 40, fontWeight: "900", textAlign: "center", zIndex: 2 },
});
