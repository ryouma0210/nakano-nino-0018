import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { roomMessages } from "@/constants/messages";
import { useAppModal } from "@/components/AppModalProvider";
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
    source: require("../../assets/characters/orders-nino.png"),
  },
  {
    key: "black-suit",
    name: "黒スーツ",
    unlock: "50ptで交換",
    source: require("../../assets/characters/settings-nino.png"),
  },
  {
    key: "maid",
    name: "メイド服",
    unlock: "50ptで交換",
    source: require("../../assets/characters/files-nino.png"),
  },
  {
    key: "nurse",
    name: "ナース服",
    unlock: "50ptで交換",
    source: require("../../assets/characters/diary-nino.png"),
  },
  {
    key: "bunny",
    name: "バニーガール",
    unlock: "50ptで交換",
    source: require("../../assets/characters/chastity-nino.png"),
  },
  {
    key: "queen",
    name: "女王様衣装",
    unlock: "50ptで交換",
    source: require("../../assets/characters/punishment-nino.png"),
  },
  {
    key: "rubber",
    name: "ラバースーツ",
    unlock: "50ptで交換",
    source: require("../../assets/characters/training-nino-v3.png"),
  },
  {
    key: "pink-bondage",
    name: "ピンクボンデージ",
    unlock: "50ptで交換",
    source: require("../../assets/characters/defeat-nino.png"),
  },
  {
    key: "black-dress",
    name: "黒ドレス",
    unlock: "50ptで交換",
    source: require("../../assets/characters/release-nino.png"),
  },
] as const;

export default function NinoRoomScreen() {
  const { showNotice } = useAppModal();
  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [redeemedOutfits, setRedeemedOutfits] = useState<Set<string>>(new Set());
  const float = useRef(new Animated.Value(0)).current;

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
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });
  const scale = float.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.015],
  });
  const selectedOutfit =
    outfits.find((item) => item.key === profile?.ninoOutfit) ?? outfits[0];

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

  return (
    <Screen>
      <AppText variant="title">二ノ様の控室</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/settings-nino.png")}
        roomName="二ノ様の控室"
        lines={roomMessages.ninoRoom.lines}
        contractLines={roomMessages.ninoRoom.contractLines}
      />
      <Card style={styles.previewCard}>
        <AppText variant="subtitle">疑似Live2Dプレビュー</AppText>
        <AppText variant="muted">
          まずは画像差し替えと軽いアニメーションで、二ノ様を動いているように見せます。
        </AppText>
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
        </View>
      </Card>
      <Card style={styles.outfitCard}>
        <AppText variant="subtitle">着せ替え</AppText>
        <AppText variant="muted">
          専用衣装画像を追加したら、この一覧の画像を差し替えて使えます。
        </AppText>
        <View style={styles.outfitGrid}>
          {outfits.map((outfit) => {
            const unlocked = outfit.key === "default" || redeemedOutfits.has(outfit.key);
            const active = selectedOutfit.key === outfit.key;
            return (
              <Pressable
                key={outfit.key}
                onPress={() => selectOutfit(outfit.key)}
                style={[
                  styles.outfitButton,
                  active && styles.outfitButtonActive,
                  !unlocked && styles.outfitButtonLocked,
                ]}
              >
                <AppText style={styles.outfitName}>
                  {active ? "✓ " : ""}
                  {outfit.name}
                </AppText>
                <AppText style={styles.outfitUnlock}>
                  {unlocked ? outfit.unlock : `未交換：${outfit.unlock}`}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Card>
        <AppText variant="subtitle">今後追加予定</AppText>
        <AppText>・専用衣装画像への差し替え</AppText>
        <AppText>・表情差分の切り替え</AppText>
        <AppText>・タップ時のリアクション</AppText>
        <AppText>・会話中の軽い口パク風アニメーション</AppText>
      </Card>
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewCard: { borderColor: "#b875ff" },
  outfitCard: { borderColor: "#b875ff" },
  stage: {
    height: 420,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#050005",
  },
  nino: {
    width: "100%",
    height: "100%",
  },
  outfitGrid: { gap: 8 },
  outfitButton: {
    gap: 4,
    borderWidth: 1,
    borderColor: "#777",
    borderRadius: 4,
    padding: 10,
    backgroundColor: "#050505",
  },
  outfitButtonActive: {
    borderColor: "#fff",
    backgroundColor: "#7b2cbf",
  },
  outfitButtonLocked: {
    opacity: 0.45,
  },
  outfitName: { color: "#fff", fontWeight: "900" },
  outfitUnlock: { color: "#aaa", fontSize: 11 },
});
