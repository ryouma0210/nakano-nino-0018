import { Image } from "expo-image";
import { ImageSourcePropType, Pressable, StyleSheet, View } from "react-native";

const centerBackground = require("../../../../assets/characters/outside-pixels/outside-map-center-crossroad-v2.png");
const routeOverlay = require("../../../../assets/characters/outside-pixels/outside-crossroad-route-overlay.png");

type Props = {
  crystalSource: ImageSourcePropType;
  warningSignSource: ImageSourcePropType;
  crystalScaleX: number;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onMoveForward: () => void;
  onReturnHome: () => void;
  onOpenCrystal: () => void;
  onOpenWarningSign: () => void;
};

export function CenterArea(props: Props) {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Image source={centerBackground} style={styles.background} contentFit="cover" />
      <Image pointerEvents="none" source={routeOverlay} style={styles.routeOverlay} contentFit="fill" />
      <Pressable accessibilityRole="button" accessibilityLabel="左の水辺へ移動" style={styles.leftExit} onPress={props.onMoveLeft} />
      <Pressable accessibilityRole="button" accessibilityLabel="右の草原へ移動" style={styles.rightExit} onPress={props.onMoveRight} />
      <Pressable accessibilityRole="button" accessibilityLabel="奥の森へ移動" style={styles.forwardExit} onPress={props.onMoveForward} />
      <Pressable accessibilityRole="button" accessibilityLabel="館へ戻る" style={styles.homeExit} onPress={props.onReturnHome} />
      <Pressable hitSlop={18} style={styles.crystalTap} onPress={props.onOpenCrystal}>
        <View style={[styles.crystal, { transform: [{ scaleX: props.crystalScaleX }] }]}>
          <Image source={props.crystalSource} style={styles.crystalImage} contentFit="contain" />
        </View>
      </Pressable>
      <Pressable hitSlop={16} style={styles.warningSignTap} onPress={props.onOpenWarningSign}>
        <Image source={props.warningSignSource} style={styles.warningSignImage} contentFit="contain" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  routeOverlay: { ...StyleSheet.absoluteFill, zIndex: 2, width: "100%", height: "100%", opacity: 0.72 },
  forwardExit: { position: "absolute", top: 0, left: "40%", right: "40%", height: "26%", zIndex: 4 },
  leftExit: { position: "absolute", top: "40%", left: 0, width: "24%", height: "22%", zIndex: 4 },
  rightExit: { position: "absolute", top: "40%", right: 0, width: "24%", height: "22%", zIndex: 4 },
  homeExit: { position: "absolute", left: "40%", bottom: 0, width: "20%", height: "22%", zIndex: 4 },
  crystalTap: { position: "absolute", left: "43%", top: "48%", width: "14%", height: "14%", zIndex: 5, alignItems: "center", justifyContent: "center" },
  crystal: { width: "100%", height: "100%" },
  crystalImage: { width: "100%", height: "100%" },
  warningSignTap: { position: "absolute", left: "58%", top: "22%", width: "20%", height: "22%", zIndex: 5 },
  warningSignImage: { width: "100%", height: "100%" },
});
