import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";

const rightBackground = require("../../../../assets/characters/outside-pixels/outside-map-right.png");
const returnArrow = require("../../../../assets/characters/outside-pixels/outside-return-arrow-v2.png");

export function RightArea({ onReturn }: { onReturn: () => void }) {
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <Image source={rightBackground} style={styles.background} contentFit="cover" />
    <Image pointerEvents="none" source={returnArrow} style={styles.returnArrow} contentFit="contain" />
    <Pressable accessibilityRole="button" accessibilityLabel="十字路へ戻る" style={styles.exit} onPress={onReturn} />
  </View>;
}

const styles = StyleSheet.create({
  background: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  returnArrow: { position: "absolute", left: 0, top: "43%", zIndex: 3, width: "24%", height: "14%", opacity: 0.72, transform: [{ rotate: "180deg" }] },
  exit: { position: "absolute", top: "40%", left: 0, width: "20%", height: "22%", zIndex: 4 },
});
