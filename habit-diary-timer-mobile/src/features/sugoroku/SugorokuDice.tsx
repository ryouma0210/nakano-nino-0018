import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  value: number | null;
  rolling: boolean;
  onRollAnimationEnd: () => void;
};

const pips: Record<number, readonly number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8],
  4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
// Decorative faces must never draw from the game's random outcome stream.
const rollingFaces = [1, 4, 2, 6, 3, 5] as const;

function useReducedMotion() {
  const [reduced, setReduced] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const update = (value: boolean) => { if (mounted) setReduced(value); };
    AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => update(false));
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", update);
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return reduced;
}

export function SugorokuDice({ value, rolling, onRollAnimationEnd }: Props) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const onEnd = useRef(onRollAnimationEnd);
  const finishedRoll = useRef(false);
  const [decorativeFace, setDecorativeFace] = useState<number>(rollingFaces[0]);
  const [settled, setSettled] = useState(false);

  useLayoutEffect(() => { onEnd.current = onRollAnimationEnd; }, [onRollAnimationEnd]);

  useLayoutEffect(() => {
    if (!rolling) {
      finishedRoll.current = false;
      progress.stopAnimation();
      progress.setValue(0);
      setSettled(false);
      return;
    }
    if (reducedMotion === null || finishedRoll.current) return;

    let current = true;
    let faceTimer: ReturnType<typeof setInterval> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let animation: Animated.CompositeAnimation | undefined;
    progress.setValue(0);
    setSettled(false);

    function stopFaces() {
      if (faceTimer !== undefined) clearInterval(faceTimer);
      faceTimer = undefined;
    }

    function finish() {
      if (!current || finishedRoll.current) return;
      stopFaces();
      finishedRoll.current = true;
      setSettled(true);
      onEnd.current();
    }

    if (reducedMotion) {
      // Preserve the roll/commit sequence without rotation or flashing faces.
      settleTimer = setTimeout(finish, 160);
    } else {
      let faceIndex = 0;
      setDecorativeFace(rollingFaces[faceIndex]);
      faceTimer = setInterval(() => {
        if (!current) return;
        faceIndex = (faceIndex + 1) % rollingFaces.length;
        setDecorativeFace(rollingFaces[faceIndex]);
      }, 75);
      // Show the actual result during the last small bounce, then commit it.
      settleTimer = setTimeout(() => {
        if (!current) return;
        stopFaces();
        setSettled(true);
      }, 720);
      animation = Animated.timing(progress, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      });
      animation.start(({ finished }) => { if (finished) finish(); });
    }

    return () => {
      current = false;
      stopFaces();
      if (settleTimer !== undefined) clearTimeout(settleTimer);
      animation?.stop();
    };
  }, [progress, reducedMotion, rolling]);

  const face = rolling && reducedMotion === null ? null
    : rolling && !settled && !reducedMotion ? decorativeFace : value;
  const inputRange = [0, 0.14, 0.36, 0.58, 0.8, 0.92, 1];
  const transform = reducedMotion === false ? [
    { translateX: progress.interpolate({ inputRange, outputRange: [0, -3, 3, -2, 1, 0, 0] }) },
    { translateY: progress.interpolate({ inputRange, outputRange: [0, -8, -3, -9, -3, 1, 0] }) },
    { rotate: progress.interpolate({ inputRange, outputRange: ["0deg", "-20deg", "135deg", "285deg", "365deg", "357deg", "360deg"] }) },
    { scale: progress.interpolate({ inputRange, outputRange: [1, 0.96, 1.03, 0.98, 1.02, 0.99, 1] }) },
  ] : [];

  return (
    <View style={styles.stage} accessible={false} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.dice, { transform }]}>
        {face === null ? <Ionicons name="dice-outline" size={62} color="#18243a" /> : face === 0 ? (
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.zeroFace}>0</Text>
        ) : (
          <View style={styles.pips}>
            {Array.from({ length: 9 }, (_, index) => <View key={index} style={[styles.pip, !pips[face]?.includes(index) && styles.hiddenPip]} />)}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: "100%", height: 120, alignItems: "center", justifyContent: "center" },
  dice: { width: 88, height: 88, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#e5eefb", borderColor: "#92abcc", borderWidth: 2 },
  zeroFace: { color: "#18243a", fontSize: 48, lineHeight: 58, fontWeight: "800", textAlign: "center", includeFontPadding: false },
  pips: { width: 58, height: 58, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pip: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#18243a" },
  hiddenPip: { opacity: 0 },
});
