import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { mainCharacter } from "@/constants/character";
import { lightTheme } from "@/constants/theme";

type Props = {
  achievementRate: number;
  completedCount: number;
  totalHabits: number;
  journalCount: number;
};

export function CharacterPanel({ achievementRate, completedCount, totalHabits, journalCount }: Props) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const shineAnim = useRef(new Animated.Value(0)).current;
  const cloudAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const shineLoop = Animated.loop(
      Animated.timing(shineAnim, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const cloudLoop = Animated.loop(
      Animated.timing(cloudAnim, {
        toValue: 1,
        duration: 7000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    floatLoop.start();
    shineLoop.start();
    cloudLoop.start();
    return () => {
      floatLoop.stop();
      shineLoop.stop();
      cloudLoop.stop();
    };
  }, [cloudAnim, floatAnim, shineAnim]);

  const characterTranslateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });
  const shineTranslateX = shineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-90, 260],
  });
  const cloudTranslateX = cloudAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 220],
  });

  return (
    <View style={styles.panel}>
      <View style={styles.topBar}>
        <View>
          <AppText style={styles.roomName}>{mainCharacter.roomName}</AppText>
          <AppText variant="muted">{mainCharacter.title}</AppText>
        </View>
        <View style={styles.dayBadge}>
          <AppText style={styles.dayText}>DAY 01</AppText>
        </View>
      </View>

      <View style={styles.stage}>
        <Animated.View style={[styles.cloudOne, { transform: [{ translateX: cloudTranslateX }] }]} />
        <Animated.View style={[styles.cloudTwo, { transform: [{ translateX: cloudTranslateX }] }]} />
        <Animated.View style={[styles.character, { transform: [{ translateY: characterTranslateY }] }]}>
          <View style={styles.hair} />
          <View style={styles.face}>
            <View style={styles.eyeRow}>
              <View style={styles.eye} />
              <View style={styles.eye} />
            </View>
            <View style={styles.smile} />
          </View>
          <View style={styles.body} />
        </Animated.View>
        <View style={styles.statusBox}>
          <StatusLine label={mainCharacter.affectionLabel} value={`${achievementRate}%`} />
          <StatusLine label="習慣" value={`${completedCount}/${totalHabits}`} />
          <StatusLine label="記録" value={`${journalCount}件`} />
          <StatusLine label="気分" value={mainCharacter.mood} />
        </View>
      </View>

      <View style={styles.dialog}>
        <View style={styles.namePlate}>
          <AppText style={styles.nameText}>{mainCharacter.name}</AppText>
        </View>
        <AppText style={styles.dialogText}>{mainCharacter.greeting}</AppText>
      </View>

      <View style={styles.progressPanel}>
        <View style={styles.progressHeader}>
          <AppText style={styles.progressTitle}>TODAY ROUTE</AppText>
          <AppText style={styles.progressPercent}>{achievementRate}%</AppText>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(6, Math.min(100, achievementRate))}%` }]} />
          <Animated.View style={[styles.progressShine, { transform: [{ translateX: shineTranslateX }] }]} />
          {[0, 1, 2, 3, 4].map((point) => (
            <View key={point} style={[styles.progressDot, { left: `${point * 25}%` }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusLine}>
      <AppText style={styles.statusLabel}>{label}</AppText>
      <AppText style={styles.statusValue}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: "hidden",
    borderWidth: 2,
    borderColor: lightTheme.primary,
    borderRadius: 22,
    backgroundColor: lightTheme.gamePanel,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    backgroundColor: lightTheme.gamePanelDark,
  },
  roomName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  dayBadge: {
    borderWidth: 1,
    borderColor: lightTheme.gold,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  dayText: {
    color: lightTheme.gold,
    fontWeight: "900",
  },
  stage: {
    minHeight: 210,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: "#ffe9f3",
  },
  cloudOne: {
    position: "absolute",
    top: 30,
    left: 16,
    width: 86,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  cloudTwo: {
    position: "absolute",
    top: 66,
    left: 80,
    width: 56,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.48)",
  },
  character: {
    alignItems: "center",
    width: 126,
  },
  hair: {
    width: 94,
    height: 78,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    backgroundColor: "#f58ab7",
  },
  face: {
    alignItems: "center",
    justifyContent: "center",
    width: 72,
    height: 62,
    marginTop: -46,
    borderRadius: 32,
    backgroundColor: "#ffe0cf",
  },
  eyeRow: {
    flexDirection: "row",
    gap: 18,
  },
  eye: {
    width: 8,
    height: 12,
    borderRadius: 4,
    backgroundColor: lightTheme.primaryDark,
  },
  smile: {
    width: 24,
    height: 10,
    marginTop: 10,
    borderBottomWidth: 3,
    borderBottomColor: lightTheme.primaryDark,
    borderRadius: 12,
  },
  body: {
    width: 104,
    height: 92,
    marginTop: -4,
    borderTopLeftRadius: 38,
    borderTopRightRadius: 38,
    backgroundColor: lightTheme.accent,
  },
  statusBox: {
    width: 158,
    gap: 8,
    borderWidth: 1,
    borderColor: lightTheme.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
    backgroundColor: "rgba(255,255,255,0.86)",
  },
  statusLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  statusLabel: {
    color: lightTheme.muted,
    fontWeight: "800",
  },
  statusValue: {
    color: lightTheme.primaryDark,
    fontWeight: "900",
  },
  dialog: {
    borderTopWidth: 2,
    borderTopColor: lightTheme.primary,
    padding: 14,
    backgroundColor: "#fff",
  },
  namePlate: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 8,
    backgroundColor: lightTheme.primary,
  },
  nameText: {
    color: "#fff",
    fontWeight: "900",
  },
  dialogText: {
    color: lightTheme.primaryDark,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
  },
  progressPanel: {
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#fff",
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressTitle: {
    color: lightTheme.primaryDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  progressPercent: {
    color: lightTheme.primary,
    fontWeight: "900",
  },
  progressTrack: {
    overflow: "hidden",
    height: 18,
    borderWidth: 1,
    borderColor: lightTheme.primaryDark,
    borderRadius: 999,
    backgroundColor: "#eaddec",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: lightTheme.primary,
  },
  progressShine: {
    position: "absolute",
    top: -4,
    left: 0,
    width: 42,
    height: 28,
    opacity: 0.45,
    backgroundColor: "#fff",
    transform: [{ rotate: "18deg" }],
  },
  progressDot: {
    position: "absolute",
    top: 3,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 6,
    backgroundColor: lightTheme.gold,
  },
});
