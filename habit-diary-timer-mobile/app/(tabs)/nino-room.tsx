import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudioPlayer } from "expo-audio";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppModal } from "@/components/AppModalProvider";
import { roomMessages } from "@/constants/messages";
import { rewardRepository } from "@/repositories/rewardRepository";
import { profileService, type ProfileSettings } from "@/services/profileService";

const outfits = [
  {
    key: "default",
    name: "通常衣装",
    unlock: "初期衣装",
    source: require("../../assets/characters/home-nino.png"),
  },
  {
    key: "school",
    name: "制服",
    unlock: "50ptで交換",
    source: require("../../assets/characters/nino-outfit-school.png"),
  },
  {
    key: "black-suit",
    name: "黒スーツ",
    unlock: "50ptで交換",
    source: require("../../assets/characters/nino-outfit-black-suit.png"),
  },
  {
    key: "maid",
    name: "メイド服",
    unlock: "50ptで交換",
    source: require("../../assets/characters/nino-outfit-maid.png"),
  },
  {
    key: "nurse",
    name: "ナース服",
    unlock: "50ptで交換",
    source: require("../../assets/characters/nino-outfit-nurse.png"),
  },
  {
    key: "bunny",
    name: "バニー",
    unlock: "50ptで交換",
    source: require("../../assets/characters/nino-outfit-bunny.png"),
  },
  {
    key: "queen",
    name: "女王様",
    unlock: "50ptで交換",
    source: require("../../assets/characters/nino-outfit-queen.png"),
  },
  {
    key: "rubber",
    name: "ラバー",
    unlock: "50ptで交換",
    source: require("../../assets/characters/nino-outfit-rubber.png"),
  },
  {
    key: "pink-bondage",
    name: "ピンク",
    unlock: "50ptで交換",
    source: require("../../assets/characters/nino-outfit-pink-gothic.png"),
  },
  {
    key: "black-dress",
    name: "黒ドレス",
    unlock: "50ptで交換",
    source: require("../../assets/characters/nino-outfit-black-dress.png"),
  },
] as const;

const voiceStyles = [
  {
    key: "queen",
    name: "冷たい女王様",
    description: "低めで落ち着いた、命令口調。",
    sample: "跪きなさい。私の命令を聞く準備はできているの？",
    module: require("../../assets/audio/voice-samples/voice_queen.wav"),
  },
  {
    key: "sweet",
    name: "甘い支配者",
    description: "優しい声だけど逃がさない。",
    sample: "よくできたわね。ご褒美が欲しいなら、もっと頑張りなさい♡",
    module: require("../../assets/audio/voice-samples/voice_sweet.wav"),
  },
  {
    key: "insult",
    name: "罵倒強め",
    description: "煽りと嘲笑が強め。",
    sample: "ほんと情けないわね。そんなに弱いところ、見せたかったの？",
    module: require("../../assets/audio/voice-samples/voice_insult.wav"),
  },
  {
    key: "whisper",
    name: "耳元囁き",
    description: "近距離で囁く感じ。",
    sample: "ちゃんと聞こえてる？耳元で命令されるの、好きなんでしょ。",
    module: require("../../assets/audio/voice-samples/voice_whisper.wav"),
  },
  {
    key: "manager",
    name: "淡々管理者",
    description: "冷静に記録と命令を告げる。",
    sample: "本日の命令を確認します。完了するまで、勝手な行動は禁止です。",
    module: require("../../assets/audio/voice-samples/voice_manager.wav"),
  },
  {
    key: "playful",
    name: "小悪魔からかい",
    description: "明るく煽る。",
    sample: "ふふ、また来たの？今日も私に構ってほしいんだ。",
    module: require("../../assets/audio/voice-samples/voice_playful.wav"),
  },
] as const;

type Panel = "outfits" | "voice" | null;

export default function NinoRoomScreen() {
  const insets = useSafeAreaInsets();
  const { showNotice } = useAppModal();
  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [redeemedOutfits, setRedeemedOutfits] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel>("outfits");
  const [lineIndex, setLineIndex] = useState(0);
  const float = useRef(new Animated.Value(0)).current;

  const lines = useMemo(
    () => [
      ...(roomMessages.ninoRoom.lines ?? []),
      ...(roomMessages.ninoRoom.contractLines ?? []),
      { text: "横のボタンで衣装やボイス候補を選べるわ。今日はどんな私がいいの？" },
    ],
    [],
  );

  const load = useCallback(() => {
    profileService.load().then(setProfile);
    setRedeemedOutfits(
      new Set(
        rewardRepository
          .acquired()
          .filter((item) => item.reward_key === "outfit" && item.file_uri)
          .map((item) => item.file_uri!),
      ),
    );
  }, []);
  useFocusEffect(load);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const selectedOutfit =
    outfits.find((item) => item.key === profile?.ninoOutfit) ?? outfits[0];
  const selectedVoice =
    voiceStyles.find((item) => item.key === profile?.ninoVoiceStyle) ?? voiceStyles[0];
  const currentLine = lines[lineIndex % lines.length];

  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [4, -10],
  });
  const scale = float.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.018],
  });

  async function selectOutfit(key: string) {
    const outfit = outfits.find((item) => item.key === key);
    if (!outfit) {
      showNotice("選択できません", "この衣装は選択できません。");
      return;
    }
    const unlocked = key === "default" || redeemedOutfits.has(key);
    if (!unlocked) {
      const redeemed = rewardRepository.redeemOutfit(key, outfit.name);
      if (!redeemed) {
        showNotice("ポイントが足りません", `${outfit.name}は50ptで交換できます。`);
        return;
      }
      setRedeemedOutfits((current) => new Set([...current, key]));
      showNotice("交換しました", `${outfit.name}を50ptで交換しました。`);
    }
    const next = { ...(profile ?? await profileService.load()), ninoOutfit: key };
    setProfile(next);
    await profileService.save(next);
    if (unlocked) showNotice("保存しました", `${outfit.name}に着せ替えました。`);
  }

  async function selectVoiceStyle(key: string) {
    const voice = voiceStyles.find((item) => item.key === key);
    if (!voice) return;
    const next = { ...(profile ?? await profileService.load()), ninoVoiceStyle: key };
    setProfile(next);
    await profileService.save(next);
    showNotice("保存しました", `ボイス候補を「${voice.name}」にしました。`);
  }

  return (
    <View style={[styles.root, { paddingTop: Math.max(10, insets.top), paddingBottom: Math.max(10, insets.bottom) }]}>
      <View style={styles.skyGlow} />
      <View style={styles.roomGlow} />
      <View style={styles.topBar}>
        <View style={styles.pointPill}>
          <AppText style={styles.pointIcon}>♥</AppText>
          <AppText style={styles.pointText}>控室</AppText>
        </View>
        <View style={styles.infoPill}>
          <AppText style={styles.infoText}>{selectedOutfit.name}</AppText>
        </View>
      </View>

      <View style={styles.stage}>
        <Animated.Image
          source={selectedOutfit.source}
          resizeMode="contain"
          style={[
            styles.nino,
            {
              transform: [{ translateY }, { scale }],
            },
          ]}
        />
        <View style={styles.sideButtons}>
          <CircleButton title="衣装" active={panel === "outfits"} onPress={() => setPanel(panel === "outfits" ? null : "outfits")} />
          <CircleButton title="声" active={panel === "voice"} onPress={() => setPanel(panel === "voice" ? null : "voice")} />
          <CircleButton title="戻る" onPress={() => router.replace("/(tabs)")} />
        </View>
      </View>

      <Pressable
        style={styles.dialogue}
        onPress={() => setLineIndex((current) => current + 1)}
      >
        <View style={styles.nameTag}>
          <AppText style={styles.nameText}>二ノ</AppText>
        </View>
        <AppText style={styles.dialogueText}>{currentLine.text}</AppText>
        <AppText style={styles.nextText}>タップして次へ ▶</AppText>
      </Pressable>

      <View style={styles.commandRow}>
        <Pressable style={styles.chatInput} onPress={() => setLineIndex((current) => current + 1)}>
          <AppText style={styles.chatInputText}>お話ししよう</AppText>
        </Pressable>
        <Pressable style={styles.chatButton} onPress={() => setLineIndex((current) => current + 1)}>
          <AppText style={styles.chatButtonText}>💬</AppText>
        </Pressable>
      </View>

      {panel ? (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <AppText style={styles.panelTitle}>
              {panel === "outfits" ? "着せ替え" : "ボイス候補"}
            </AppText>
            <Pressable onPress={() => setPanel(null)} style={styles.closeButton}>
              <AppText style={styles.closeText}>×</AppText>
            </Pressable>
          </View>
          {panel === "outfits" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.outfitList}>
              {outfits.map((outfit) => {
                const unlocked = outfit.key === "default" || redeemedOutfits.has(outfit.key);
                const active = selectedOutfit.key === outfit.key;
                return (
                  <Pressable
                    key={outfit.key}
                    onPress={() => selectOutfit(outfit.key)}
                    style={[
                      styles.outfitButton,
                      active && styles.optionActive,
                      !unlocked && styles.optionLocked,
                    ]}
                  >
                    <Animated.Image source={outfit.source} resizeMode="cover" style={styles.outfitThumb} />
                    <AppText style={styles.optionName}>{outfit.name}</AppText>
                    <AppText style={styles.optionMeta}>{unlocked ? outfit.unlock : "未交換 50pt"}</AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.voiceList}>
              {voiceStyles.map((voice) => (
                <VoiceStyleOption
                  key={voice.key}
                  voice={voice}
                  active={selectedVoice.key === voice.key}
                  onSelect={() => selectVoiceStyle(voice.key)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

function CircleButton({
  title,
  active,
  onPress,
}: {
  title: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.circleButton, active && styles.circleButtonActive]}>
      <AppText style={styles.circleButtonText}>{title}</AppText>
    </Pressable>
  );
}

function VoiceStyleOption({
  voice,
  active,
  onSelect,
}: {
  voice: (typeof voiceStyles)[number];
  active: boolean;
  onSelect: () => void;
}) {
  const player = useAudioPlayer(voice.module);

  function preview() {
    player.seekTo(0).then(() => player.play()).catch(console.error);
  }

  return (
    <View style={[styles.voiceButton, active && styles.optionActive]}>
      <Pressable onPress={onSelect} style={styles.voiceTextArea}>
        <AppText style={styles.optionName}>{active ? "✓ " : ""}{voice.name}</AppText>
        <AppText style={styles.voiceDescription}>{voice.description}</AppText>
        <AppText style={styles.voiceSample}>「{voice.sample}」</AppText>
      </Pressable>
      <PrimaryButton title="試聴" onPress={preview} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    paddingHorizontal: 14,
    backgroundColor: "#07121a",
  },
  skyGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
    backgroundColor: "#244464",
  },
  roomGlow: {
    position: "absolute",
    left: -60,
    right: -60,
    bottom: -40,
    height: "54%",
    borderTopLeftRadius: 240,
    borderTopRightRadius: 240,
    backgroundColor: "#f2a13b",
    opacity: 0.5,
  },
  topBar: {
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pointPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  pointIcon: { color: "#ff5ca8", fontWeight: "900" },
  pointText: { color: "#333", fontWeight: "900", fontSize: 12 },
  infoPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  infoText: { color: "#333", fontWeight: "900", fontSize: 12 },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  nino: {
    width: "108%",
    height: "100%",
  },
  sideButtons: {
    position: "absolute",
    right: 2,
    top: 54,
    gap: 10,
    zIndex: 4,
  },
  circleButton: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  circleButtonActive: {
    backgroundColor: "#ff7ab8",
  },
  circleButtonText: {
    color: "#246",
    fontSize: 12,
    fontWeight: "900",
  },
  dialogue: {
    zIndex: 5,
    minHeight: 112,
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  nameTag: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: "#ff7ab8",
  },
  nameText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  dialogueText: {
    color: "#2b2230",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "800",
  },
  nextText: {
    alignSelf: "flex-end",
    color: "#7f7785",
    fontSize: 11,
    fontWeight: "800",
  },
  commandRow: {
    zIndex: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  chatInputText: { color: "#9b9b9b", fontSize: 12, fontWeight: "800" },
  chatButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 999,
    backgroundColor: "#7db7ff",
  },
  chatButtonText: { fontSize: 18 },
  panel: {
    zIndex: 8,
    maxHeight: 178,
    gap: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.74)",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  closeText: { color: "#111", fontSize: 18, fontWeight: "900" },
  outfitList: { gap: 8 },
  outfitButton: {
    width: 92,
    gap: 4,
    borderWidth: 1,
    borderColor: "#777",
    borderRadius: 8,
    padding: 6,
    backgroundColor: "#050505",
  },
  outfitThumb: {
    width: "100%",
    height: 72,
    borderRadius: 5,
    backgroundColor: "#111",
  },
  optionActive: {
    borderColor: "#fff",
    backgroundColor: "#7b2cbf",
  },
  optionLocked: {
    opacity: 0.55,
  },
  optionName: { color: "#fff", fontSize: 12, fontWeight: "900" },
  optionMeta: { color: "#ddd", fontSize: 10 },
  voiceList: { gap: 8 },
  voiceButton: {
    width: 210,
    gap: 6,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#050505",
  },
  voiceTextArea: { gap: 4 },
  voiceDescription: { color: "#ddd", fontSize: 11, lineHeight: 16 },
  voiceSample: { color: "#fff", fontSize: 11, lineHeight: 16 },
});
