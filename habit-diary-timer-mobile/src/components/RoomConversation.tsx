import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { lightTheme } from "@/constants/theme";
import { useAppAudio } from "@/audio/AudioProvider";
import { contractService } from "@/services/gameRoomService";

export type ConversationLine = {
  text: string;
};

type Props = {
  roomName: string;
  lines?: ConversationLine[];
  contractLines?: ConversationLine[];
  characterSource?: ImageSourcePropType;
};

const defaultLines: ConversationLine[] = [
  { text: "来たのね。ここで何をするか、まず決めましょう。" },
  { text: "準備ができたら、下のメニューから選んで。" },
  { text: "焦らなくていいわ。記録を一つずつ残していきましょう。" },
];

export function RoomConversation({
  roomName,
  lines = defaultLines,
  contractLines = [],
  characterSource,
}: Props) {
  const { playEffect } = useAppAudio();
  const [index, setIndex] = useState(0);
  const [contractSigned, setContractSigned] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      contractService.load().then((contract) => {
        if (active) setContractSigned(Boolean(contract.signedAt));
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const visibleLines = contractSigned ? [...lines, ...contractLines] : lines;
  const safeIndex = Math.min(index, visibleLines.length - 1);
  const current = visibleLines[safeIndex];
  const isLast = safeIndex === visibleLines.length - 1;

  function next() {
    playEffect("dialogue");
    setIndex((value) => (value >= visibleLines.length - 1 ? 0 : value + 1));
  }

  return (
    <Pressable
      onPress={next}
      style={({ pressed }) => [styles.panel, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="会話を進める"
    >
      <View style={styles.roomBar}>
        <AppText style={styles.roomLabel}>{roomName}</AppText>
        <AppText style={styles.counter}>
          {safeIndex + 1} / {visibleLines.length}
        </AppText>
      </View>

      <View style={styles.stage}>
        {characterSource ? (
          <Image
            source={characterSource}
            style={styles.characterImage}
            resizeMode="contain"
          />
        ) : (
          <>
            <View style={styles.chainLeft} />
            <View style={styles.chainRight} />
            <View style={styles.character}>
              <View style={styles.hair} />
              <View style={styles.face}>
                <View style={styles.eyes}>
                  <View style={styles.eye} />
                  <View style={styles.eye} />
                </View>
                <View style={styles.mouth} />
              </View>
              <View style={styles.neckBand} />
              <View style={styles.body} />
            </View>
          </>
        )}
      </View>

      <View style={styles.dialogue}>
        <View style={styles.namePlate}>
          <AppText style={styles.name}>ニノ</AppText>
        </View>
        <AppText style={styles.message}>{current.text}</AppText>
        <AppText style={styles.next}>
          {isLast ? "タップでもう一度  ↻" : "タップして次へ  ▶"}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 4,
    backgroundColor: "#000",
  },
  pressed: { opacity: 0.9 },
  roomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#fff",
  },
  roomLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  counter: { color: lightTheme.muted, fontSize: 12 },
  stage: {
    height: 390,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0c0c0c",
  },
  characterImage: { width: "100%", height: "100%" },
  chainLeft: {
    position: "absolute",
    left: 34,
    top: -20,
    width: 8,
    height: 150,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: "#444",
    transform: [{ rotate: "12deg" }],
  },
  chainRight: {
    position: "absolute",
    right: 34,
    top: -20,
    width: 8,
    height: 150,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: "#444",
    transform: [{ rotate: "-12deg" }],
  },
  character: { alignItems: "center", width: 130 },
  hair: {
    width: 88,
    height: 72,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: "#d96d9d",
  },
  face: {
    width: 68,
    height: 58,
    marginTop: -45,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: "#ead0c2",
  },
  eyes: { flexDirection: "row", gap: 18 },
  eye: { width: 7, height: 10, borderRadius: 4, backgroundColor: "#1b1118" },
  mouth: {
    width: 18,
    height: 7,
    marginTop: 9,
    borderBottomWidth: 2,
    borderBottomColor: "#1b1118",
    borderRadius: 8,
  },
  neckBand: {
    zIndex: 2,
    width: 48,
    height: 8,
    marginTop: -2,
    backgroundColor: lightTheme.danger,
  },
  body: {
    width: 104,
    height: 76,
    marginTop: -2,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    backgroundColor: "#1d1d1d",
    borderWidth: 1,
    borderColor: "#555",
  },
  dialogue: {
    minHeight: 126,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#fff",
    backgroundColor: "#050505",
  },
  namePlate: {
    alignSelf: "flex-start",
    marginBottom: 9,
    borderLeftWidth: 3,
    borderLeftColor: lightTheme.danger,
    paddingLeft: 8,
  },
  name: { fontWeight: "900" },
  message: { minHeight: 44, fontSize: 16, lineHeight: 24 },
  next: {
    marginTop: 8,
    color: lightTheme.muted,
    fontSize: 11,
    textAlign: "right",
  },
});
