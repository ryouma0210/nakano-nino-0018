import { useEffect, useState, type PropsWithChildren } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { translateText } from "@/i18n";
import { RHYTHM_FEEDBACK, RHYTHM_MAIN_FEEDBACK, type RhythmFeedbackState } from "./feedback";
import { startFeedbackSequence } from "./feedbackSequence";

type Props = PropsWithChildren<{
  state: RhythmFeedbackState | null;
  eventKey: string | number;
  active: boolean;
  fill?: boolean;
}>;

const colors: Record<RhythmFeedbackState, string> = {
  running: "#dccbff", paused: "#a7f3df", finished: "#ffe1a0",
};
// Leave the top quarter free for the independent main caption.
const rowTops = ["28%", "41%", "54%", "67%", "80%"] as const;
const outlineOffsets = [
  [-2, -2], [0, -2], [2, -2], [-2, 0], [2, 0], [-2, 2], [0, 2], [2, 2],
] as const;

function MainCaption({ state, width, height, fill }: {
  state: RhythmFeedbackState; width: number; height: number; fill: boolean;
}) {
  const { settings } = useAppAudio();
  const word = translateText(RHYTHM_MAIN_FEEDBACK[state], settings?.language ?? "ja");
  // Web does not shrink Text with adjustsFontSizeToFit; budget for the translated text too.
  const textUnits = Array.from(word).reduce((sum, letter) =>
    sum + (/\s/u.test(letter) ? 0.35 : letter.charCodeAt(0) <= 0xff ? 0.7 : 1.1), 0);
  const fontSize = Math.max(14, Math.min(56, width * 0.14, height * 0.16, (width - 140) / Math.max(1, textUnits)) * 0.8);
  const size = { fontSize, lineHeight: Math.ceil(fontSize * 1.3) };
  return <View pointerEvents="none" style={[styles.overlay, fill && styles.fillOverlay]}
    testID="rhythm-main-caption" accessible accessibilityRole="text"
    accessibilityLabel={word}
    accessibilityLiveRegion="none" aria-live="off">
    <View style={styles.mainRow} pointerEvents="none" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <View style={styles.mainText}>
        {outlineOffsets.map(([x, y]) => <AppText key={`${x}:${y}`} localize={false}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.45}
          accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
          style={[styles.mainWord, size, styles.outlineWord, { transform: [{ translateX: x }, { translateY: y }] }]}>
          {word}
        </AppText>)}
        <AppText testID="rhythm-main-caption-word" localize={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.45}
          style={[styles.mainWord, size]}>{word}</AppText>
      </View>
    </View>
  </View>;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    const update = (value: boolean) => { if (mounted) setReduced(value); };
    AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => update(true));
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", update);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}

function FeedbackCaption({ state, width, height, fill }: { state: RhythmFeedbackState; width: number; height: number; fill: boolean }) {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const reducedMotion = useReducedMotion();
  const [motion] = useState(() => new Animated.Value(0.5));
  const [frame, setFrame] = useState({ index: 0, visible: true });
  const words = RHYTHM_FEEDBACK[state];
  const word = words[frame.index];
  const slot = frame.index % rowTops.length;
  const show = frame.visible && Boolean(word);
  const lineHeight = width < 360 ? 20 : 24;
  const rowTop = Math.max(0, Math.min(height * parseFloat(rowTops[slot]) / 100, height - lineHeight - 8));

  useEffect(() => startFeedbackSequence(words.length, (next) => {
    setFrame((current) => current.index === next.index && current.visible === next.visible ? current : next);
  }), [words.length]);

  useEffect(() => {
    motion.stopAnimation(); motion.setValue(0.5);
    if (!show || reducedMotion !== false) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(motion, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web", isInteraction: false }),
      Animated.timing(motion, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web", isInteraction: false }),
      Animated.timing(motion, { toValue: 0.5, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web", isInteraction: false }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [frame.index, motion, reducedMotion, show]);

  if (!show) return null;
  return <View pointerEvents="none" style={[styles.overlay, fill && styles.fillOverlay]} testID={`rhythm-feedback-${state}`}
      accessible accessibilityRole="text" accessibilityLabel={translateText(word, language)}
      accessibilityLiveRegion="none" aria-live="off">
      <Animated.View pointerEvents="none"
        accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
        style={[styles.row, { top: rowTop, right: slot < 3 ? 64 : 12, alignItems: slot % 2 === 0 ? "flex-start" : "flex-end",
          opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
          transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [3, -3] }) }],
        }]}>
        <AppText testID={`rhythm-feedback-word-${state}-${frame.index}`} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
          style={[styles.word, { color: colors[state], fontSize: width < 360 ? 14 : 17, lineHeight }]}>
          {word}
        </AppText>
      </Animated.View>
    </View>;
}

/** Remount the sequence on a new state/event or when the screen becomes active again. */
export function RhythmFeedback({ state, eventKey, active, children, fill = false }: Props) {
  const [{ width, height }, setSize] = useState({ width: 288, height: 180 });
  return <View style={[styles.wrap, fill && styles.fill]} onLayout={(event) => {
    const layout = event.nativeEvent.layout;
    setSize({ width: layout.width, height: fill ? layout.height : layout.width / 1.6 });
  }}>
    {children}
    {active && state ? <MainCaption state={state} width={width} height={height} fill={fill} /> : null}
    {active && state ? <FeedbackCaption key={`${state}:${typeof eventKey}:${eventKey}`} state={state} width={width} height={height} fill={fill} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  fill: { flex: 1, minHeight: 0 },
  fillOverlay: { height: "100%", aspectRatio: undefined, borderRadius: 0 },
  overlay: { position: "absolute", top: 0, left: 0, width: "100%", aspectRatio: 1.6, overflow: "hidden", borderRadius: 6 },
  mainRow: { position: "absolute", top: 8, left: 64, right: 64 },
  mainText: { position: "relative", width: "100%" },
  mainWord: { width: "100%", color: "#ec4f9a", fontWeight: "900", textAlign: "center", paddingHorizontal: 3 },
  outlineWord: { position: "absolute", top: 0, left: 0, color: "#fff" },
  row: { position: "absolute", left: 12, right: 12 },
  word: { maxWidth: "100%", paddingHorizontal: 8, paddingVertical: 1, borderRadius: 5,
    backgroundColor: "rgba(8,8,16,0.66)", fontWeight: "900", textShadowColor: "#080814", textShadowRadius: 3 },
});
