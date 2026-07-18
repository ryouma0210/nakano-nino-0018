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

export default function TimerScreen() {
  const [minutes, setMinutes] = useState("10");
  const [totalSeconds, setTotalSeconds] = useState(600);
  const [remaining, setRemaining] = useState(600);
  const [running, setRunning] = useState(false);
  const [trackWidth, setTrackWidth] = useState(1);
  const [target, setTarget] = useState<"チンポ" | "金玉">("チンポ");
  const lastBeat = useRef(-1);
  const sessionRecorded = useRef(false);
  const { playEffect } = useAppAudio();

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

  const elapsed = totalSeconds - remaining;
  useEffect(() => {
    if (!running || elapsed === lastBeat.current) return;
    lastBeat.current = elapsed;
    setTarget(Math.random() < 0.5 ? "チンポ" : "金玉");
    playEffect("punishmentHit");
  }, [elapsed, playEffect, running]);

  function start() {
    const duration = Math.max(1, Math.min(999, Number(minutes) || 1)) * 60;
    setTotalSeconds(duration);
    setRemaining(duration);
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
      <AppText variant="title">お仕置き部屋</AppText>
      <RoomConversation characterSource={require("../../assets/characters/punishment-nino.png")} roomName="お仕置き部屋" lines={[{ text: "時間は自分で決めなさい。" }, { text: "黄色が赤へ到達したら、表示された場所へビンタよ。", event: "PUNISHMENT RHYTHM" }]} />
      <Card>
        <TextField label="時間（分）" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" editable={!running} />
        <AppText style={styles.clock}>{secondsToClock(remaining)}</AppText>
        <View style={styles.rhythmFrame}>
          <View style={styles.rhythmHeader}><AppText variant="label">RHYTHM</AppText><AppText style={styles.target}>{target}にビンタ</AppText></View>
          <View onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} style={styles.track}>
            <View style={styles.line} /><View style={styles.hitGlow} /><View style={styles.hitPoint} />
            {Array.from({ length: 5 }, (_, index) => {
              const phase = (elapsed / 5 + index / 5) % 1;
              const left = 26 + (1 - phase) * Math.max(0, trackWidth - 46);
              const opacity = phase > 0.92 ? Math.max(0, (1 - phase) / 0.08) : 1;
              return <View key={index} style={[styles.marker, { left, opacity }]} />;
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
  clock: { color: "#fff", fontSize: 54, fontWeight: "900", textAlign: "center" },
  rhythmFrame: { borderWidth: 1, borderColor: "#777", backgroundColor: "#151515" },
  rhythmHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingTop: 8 },
  target: { color: lightTheme.danger, fontSize: 18, fontWeight: "900" },
  track: { overflow: "hidden", height: 58, justifyContent: "center", marginHorizontal: 8 },
  line: { position: "absolute", right: 10, left: 20, height: 3, backgroundColor: "#ddd" },
  hitGlow: { position: "absolute", left: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,47,47,0.22)" },
  hitPoint: { position: "absolute", left: 16, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#ffb0a5", backgroundColor: "#ed3b35", zIndex: 3 },
  marker: { position: "absolute", width: 20, height: 20, marginLeft: -10, borderRadius: 10, borderWidth: 2, borderColor: "#fff1a3", backgroundColor: "#f1c84b", zIndex: 2 },
});
