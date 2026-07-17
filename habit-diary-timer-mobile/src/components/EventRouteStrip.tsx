import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { lightTheme } from "@/constants/theme";

type Props = {
  progress: number;
};

const eventPoints = ["起床", "習慣", "記録", "集中", "休憩", "夜"];

export function EventRouteStrip({ progress }: Props) {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const scrollLoop = Animated.loop(
      Animated.timing(scrollAnim, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    scrollLoop.start();
    pulseLoop.start();
    return () => {
      scrollLoop.stop();
      pulseLoop.stop();
    };
  }, [pulseAnim, scrollAnim]);

  const cloudTranslate = scrollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-180, 180],
  });
  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });
  const currentIndex = Math.min(eventPoints.length - 1, Math.floor((progress / 100) * eventPoints.length));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.backLight, { transform: [{ translateX: cloudTranslate }] }]} />
      <View style={styles.leftPlate}>
        <View style={styles.miniPortrait}>
          <View style={styles.miniHair} />
          <View style={styles.miniFace} />
        </View>
        <View>
          <AppText style={styles.modeText}>EVENT</AppText>
          <AppText style={styles.levelText}>Level {Math.max(1, Math.ceil(progress / 10))}</AppText>
        </View>
      </View>

      <View style={styles.route}>
        <View style={styles.routeLine} />
        <View style={[styles.routeFill, { width: `${Math.max(8, Math.min(100, progress))}%` }]} />
        {eventPoints.map((point, index) => {
          const active = index <= currentIndex;
          return (
            <View key={point} style={[styles.pointWrap, { left: `${(index / (eventPoints.length - 1)) * 100}%` }]}>
              <Animated.View
                style={[
                  styles.point,
                  active && styles.pointActive,
                  index === currentIndex && { transform: [{ scale: pulseScale }] },
                ]}
              />
              <AppText style={[styles.pointLabel, active && styles.pointLabelActive]}>{point}</AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    minHeight: 88,
    borderWidth: 2,
    borderColor: lightTheme.primaryDark,
    borderRadius: 16,
    backgroundColor: "#3b2b50",
  },
  backLight: {
    position: "absolute",
    top: -22,
    left: 0,
    width: 170,
    height: 132,
    opacity: 0.24,
    borderRadius: 72,
    backgroundColor: lightTheme.primary,
  },
  leftPlate: {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    borderRadius: 12,
    padding: 8,
    backgroundColor: "rgba(20,14,26,0.72)",
  },
  miniPortrait: {
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff0f7",
  },
  miniHair: {
    position: "absolute",
    top: 5,
    width: 28,
    height: 22,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: "#f58ab7",
  },
  miniFace: {
    width: 22,
    height: 20,
    marginTop: 8,
    borderRadius: 11,
    backgroundColor: "#ffe0cf",
  },
  modeText: {
    color: lightTheme.gold,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  levelText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  route: {
    position: "absolute",
    right: 18,
    bottom: 18,
    left: 116,
    height: 42,
  },
  routeLine: {
    position: "absolute",
    top: 12,
    right: 0,
    left: 0,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  routeFill: {
    position: "absolute",
    top: 12,
    left: 0,
    height: 5,
    borderRadius: 999,
    backgroundColor: lightTheme.gold,
  },
  pointWrap: {
    position: "absolute",
    top: 2,
    alignItems: "center",
    width: 46,
    marginLeft: -23,
  },
  point: {
    width: 24,
    height: 24,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 12,
    backgroundColor: "#8d7b96",
  },
  pointActive: {
    backgroundColor: lightTheme.gold,
  },
  pointLabel: {
    marginTop: 3,
    color: "rgba(255,255,255,0.66)",
    fontSize: 10,
    fontWeight: "800",
  },
  pointLabelActive: {
    color: "#fff",
  },
});
