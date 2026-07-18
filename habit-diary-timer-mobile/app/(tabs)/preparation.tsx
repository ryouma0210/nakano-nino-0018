import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { preparationRepository } from "@/repositories/roomRepository";
import { formatDateJa, toDateKey } from "@/utils/date";
import { lightTheme } from "@/constants/theme";

const items = [
  { text: "全裸の状態であること。", required: true },
  { text: "土下座の状態であること。", required: true },
  { text: "お貢ぎ用意したこと。", required: true },
  { text: "発情状態であること。", required: true },
  { text: "3日間以上オナ禁したこと。", required: false },
  { text: "首輪（犬用でも可）を装着していること。", required: false },
  { text: "貞操帯を装着していること。", required: false },
];

export default function PreparationScreen() {
  const preparationPlayer = useVideoPlayer(require("../../assets/videos/preparation_1.mp4"), (player) => {
    player.loop = true;
    player.play();
  });
  const saved = preparationRepository.find();
  const savedChecks: string[] = saved ? JSON.parse(saved.checks_json) : [];
  const [checked, setChecked] = useState(() => new Set(savedChecks));
  const [completed, setCompleted] = useState(Boolean(saved));
  const requiredComplete = items.filter((item) => item.required).every((item) => checked.has(item.text));

  function toggle(text: string) {
    if (completed) return;
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(text)) next.delete(text); else next.add(text);
      return next;
    });
  }

  function complete() {
    preparationRepository.save(Array.from(checked));
    setCompleted(true);
  }

  return (
    <Screen>
      <AppText variant="title">準備部屋</AppText>
      <RoomConversation characterSource={require("../../assets/characters/preparation-nino.png")} roomName="準備部屋" lines={[{ text: "今日の準備を一つずつ確認して。" }, { text: "必須項目を全部済ませたら、最後の挨拶よ。", event: "PREPARATION" }]} />
      <Card>
        <AppText variant="subtitle">発情してない人向け</AppText>
        <VideoView player={preparationPlayer} style={styles.video} nativeControls={false} contentFit="contain" />
        <AppText style={styles.breath}>ふぅ～～～～～～～♡</AppText>
      </Card>
      <Card>
        <AppText variant="subtitle">{formatDateJa(toDateKey())}</AppText>
        {items.map((item) => (
          <Pressable key={item.text} onPress={() => toggle(item.text)} style={styles.checkRow}>
            <AppText style={[styles.check, checked.has(item.text) && styles.checked]}>{checked.has(item.text) ? "✅" : "□"}</AppText>
            <View style={styles.grow}>
              <AppText>{item.text}</AppText>
              {!item.required ? <AppText variant="muted">任意</AppText> : null}
            </View>
          </Pressable>
        ))}
      </Card>
      {completed ? (
        <Card><AppText style={styles.closing}>「本日も調教よろしくお願いいたします。」</AppText><AppText variant="muted">調教日記へ保存しました。</AppText></Card>
      ) : (
        <PrimaryButton title="本日の準備を完了" disabled={!requiredComplete} onPress={complete} />
      )}
      <PrimaryButton title="ホームへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "#444", paddingVertical: 12 },
  check: { width: 28, color: lightTheme.muted, fontSize: 20 },
  checked: { color: "#fff" },
  grow: { flex: 1, gap: 2 },
  closing: { textAlign: "center", fontSize: 17, fontWeight: "900", lineHeight: 28 },
  video: { width: "100%", aspectRatio: 16 / 9, borderWidth: 1, borderColor: "#fff", backgroundColor: "#000" },
  breath: { color: "#fff", fontSize: 24, fontWeight: "900", textAlign: "center", letterSpacing: 2 },
});
