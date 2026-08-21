import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";

const leftBackground = require("../../../../assets/characters/outside-pixels/outside-map-left.png");
const returnArrow = require("../../../../assets/characters/outside-pixels/outside-return-arrow-v2.png");

export function LeftArea({ onExplore, onReturn }: { onExplore: () => void; onReturn: () => void }) {
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <Image source={leftBackground} style={styles.background} contentFit="cover" />
    <Image pointerEvents="none" source={returnArrow} style={styles.returnArrow} contentFit="contain" />
    <Pressable accessibilityRole="button" accessibilityLabel="水辺を調べる" style={styles.action} onPress={onExplore} />
    <Pressable accessibilityRole="button" accessibilityLabel="十字路へ戻る" style={styles.exit} onPress={onReturn} />
  </View>;
}

const styles = StyleSheet.create({
  background: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  returnArrow: { position: "absolute", right: 0, top: "43%", zIndex: 3, width: "24%", height: "14%", opacity: 0.72 },
  action: { position: "absolute", top: 0, bottom: 0, left: 0, width: "72%" },
  exit: { position: "absolute", top: "40%", right: 0, width: "20%", height: "22%", zIndex: 4 },
});
