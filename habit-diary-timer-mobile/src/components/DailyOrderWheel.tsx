import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { translateText } from "@/i18n";
import { getWheelGeometry, getWheelSpinTarget, getWheelStopAngle } from "./dailyOrderWheelGeometry";

type Props = {
  count: number;
  completedIndices: readonly number[];
  selectedIndex: number | null;
  spinning: boolean;
  spinId: number;
  onSpinEnd: () => void;
};

const sectorColors = ["#ff828b", "#ffd66d", "#87df91", "#79cfff", "#c4a0ff", "#ffa2d2", "#ffb374", "#7ee2d4"];
const rimWidth = 6;
const pointerSpace = 16;

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

export function DailyOrderWheel({ count, completedIndices, selectedIndex, spinning, spinId, onSpinEnd }: Props) {
  const { settings } = useAppAudio();
  const [width, setWidth] = useState(0);
  const rotation = useRef(new Animated.Value(0)).current;
  const onSpinEndRef = useRef(onSpinEnd);
  const finishedSpinRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const sectorCount = Number.isSafeInteger(count) && count >= 3 ? count : 3;
  const selection = selectedIndex != null && Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < sectorCount
    ? selectedIndex : null;

  useEffect(() => { onSpinEndRef.current = onSpinEnd; }, [onSpinEnd]);

  useEffect(() => {
    let current = true;
    let animation: Animated.CompositeAnimation | undefined;

    // Retrieve the native value before a new spin so cancellation never snaps
    // the next animation back to a stale starting angle.
    rotation.stopAnimation((currentAngle) => {
      if (!current) return;
      if (!spinning || selection == null) {
        rotation.setValue(selection == null ? 0 : getWheelStopAngle(sectorCount, selection));
        return;
      }
      if (reducedMotion == null || finishedSpinRef.current === spinId) return;

      const restingAngle = getWheelStopAngle(sectorCount, selection);
      animation = Animated.timing(rotation, {
        toValue: reducedMotion ? restingAngle : getWheelSpinTarget(currentAngle, sectorCount, selection),
        duration: reducedMotion ? 0 : 4200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      });
      animation.start(({ finished }) => {
        if (!current || !finished) return;
        // Whole turns have no visual effect; discard them between spins.
        rotation.setValue(restingAngle);
        finishedSpinRef.current = spinId;
        onSpinEndRef.current();
      });
    });

    return () => {
      current = false;
      animation?.stop();
    };
  }, [rotation, sectorCount, selection, spinning, spinId, reducedMotion]);

  function measure(event: LayoutChangeEvent) {
    const measured = Math.max(0, Math.min(event.nativeEvent.layout.width, 360));
    setWidth((previous) => previous === measured ? previous : measured);
  }

  const diameter = width - rimWidth * 2;
  const geometry = diameter > 0 ? getWheelGeometry(sectorCount, diameter) : null;
  const labelWidth = geometry ? Math.min(34, 2 * geometry.radius * 0.8 * Math.sin(Math.PI / sectorCount)) : 0;
  const fontSize = Math.max(4, Math.min(12, Math.floor(labelWidth / 2)));
  const hubSize = Math.max(22, Math.min(46, diameter * 0.15));
  const completed = new Set(completedIndices);
  const spin = rotation.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"], extrapolate: "extend" });

  return (
    <View
      onLayout={measure}
      style={styles.container}
      accessible
      accessibilityRole="image"
      accessibilityLabel={translateText("命令ルーレット", settings?.language ?? "ja")}
      accessibilityState={{ busy: spinning }}
      accessibilityValue={selection != null && !spinning ? { text: completed.has(selection) ? String(selection + 1) : "???" } : undefined}
    >
      {geometry ? (
        <View
          style={{ width, height: width + pointerSpace + 4 }}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={[styles.rim, { top: pointerSpace, width, height: width, borderRadius: width / 2 }]}>
            <Animated.View
              style={[styles.disc, { width: diameter, height: diameter, borderRadius: geometry.radius, transform: [{ rotate: spin }] }]}
            >
              {Array.from({ length: sectorCount }, (_, index) => (
                <View key={`sector-${index}`} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${180 + index * geometry.arcDegrees}deg` }] }]}>
                  <View
                    style={[
                      styles.sector,
                      {
                        left: geometry.radius - geometry.triangleHalfWidth,
                        top: geometry.radius,
                        borderLeftWidth: geometry.triangleHalfWidth,
                        borderRightWidth: geometry.triangleHalfWidth,
                        borderBottomWidth: geometry.radius + 1,
                        borderBottomColor: sectorColors[index % sectorColors.length],
                      },
                    ]}
                  />
                </View>
              ))}
              {Array.from({ length: sectorCount }, (_, index) => (
                <View key={`label-${index}`} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${index * geometry.arcDegrees}deg` }] }]}>
                  <AppText
                    localize={false}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    style={[
                      styles.label,
                      { left: geometry.radius - labelWidth / 2, top: geometry.radius * 0.13, width: labelWidth, fontSize, lineHeight: fontSize + 4 },
                    ]}
                  >
                    {completed.has(index) ? index + 1 : "???"}
                  </AppText>
                </View>
              ))}
            </Animated.View>
            <View style={[styles.hub, { width: hubSize, height: hubSize, borderRadius: hubSize / 2, left: (width - hubSize) / 2, top: (width - hubSize) / 2 }]}>
              <View style={[styles.hubCore, { width: hubSize * 0.4, height: hubSize * 0.4, borderRadius: hubSize / 2 }]} />
            </View>
          </View>
          <View style={[styles.pointer, { left: width / 2 - 11 }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", alignItems: "center" },
  rim: {
    position: "absolute",
    left: 0,
    padding: rimWidth,
    backgroundColor: "#e9b84c",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 5,
    elevation: 5,
  },
  disc: { overflow: "hidden", backgroundColor: "#ffcf63" },
  sector: { position: "absolute", width: 0, height: 0, borderLeftColor: "transparent", borderRightColor: "transparent" },
  label: { position: "absolute", color: "#241526", fontWeight: "900", textAlign: "center", includeFontPadding: false },
  hub: {
    position: "absolute", alignItems: "center", justifyContent: "center",
    backgroundColor: "#ffe5a1", borderColor: "#a87119", borderWidth: 3,
  },
  hubCore: { backgroundColor: "#873c62", borderColor: "#fff4d6", borderWidth: 1 },
  pointer: {
    position: "absolute", top: 0, width: 0, height: 0,
    borderLeftWidth: 11, borderRightWidth: 11, borderTopWidth: 27,
    borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#fff0b4",
  },
});
