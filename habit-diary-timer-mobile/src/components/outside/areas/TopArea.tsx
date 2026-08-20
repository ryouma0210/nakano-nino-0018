import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";

const topBackground = require("../../../../assets/characters/outside-pixels/outside-map-top.png");
const returnArrow = require("../../../../assets/characters/outside-pixels/outside-return-arrow-v2.png");

export function TopArea({ onExplore, onReturn }: { onExplore: () => void; onReturn: () => void }) {
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <Image source={topBackground} style={styles.background} contentFit="cover" />
    <Image pointerEvents="none" source={returnArrow} style={styles.returnArrow} contentFit="contain" />
    <Pressable accessibilityRole="button" accessibilityLabel="奥の森を進む" style={styles.action} onPress={onExplore} />
    <Pressable accessibilityRole="button" accessibilityLabel="十字路へ戻る" style={styles.exit} onPress={onReturn} />
  </View>;
}

const styles = StyleSheet.create({
  background: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  returnArrow: { position: "absolute", bottom: "1%", left: "38%", zIndex: 3, width: "24%", height: "14%", opacity: 0.72, transform: [{ rotate: "90deg" }] },
  action: { position: "absolute", top: "16%", right: "18%", bottom: "24%", left: "18%" },
  exit: { position: "absolute", left: "40%", bottom: 0, width: "20%", height: "18%", zIndex: 4 },
});
