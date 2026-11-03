import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { lightTheme } from "@/constants/theme";
import { secondsToClock } from "@/utils/date";
import { AppText } from "./AppText";

export type RoomRhythmMarker = { phase: number; visible?: boolean };

export function RoomRhythmGauge({
  elapsedSeconds,
  markers,
  expanded = false,
  testID,
  elapsedTestID,
  accessibilityLabel = "動画に同期したリズムゲージ",
}: {
  elapsedSeconds: number;
  markers: readonly RoomRhythmMarker[];
  expanded?: boolean;
  testID?: string;
  elapsedTestID?: string;
  accessibilityLabel?: string;
}) {
  const [trackWidth, setTrackWidth] = useState(1);
  const markerWidth = expanded ? 74 : 52;
  const markerCenter = markerWidth / 2;
  const travelWidth = Math.max(0, trackWidth - markerWidth - 4);

  return (
    <View style={styles.frame}>
      <View style={styles.title}>
        <View style={styles.titleGroup}>
          <AppText style={styles.titleText}>RHYTHM</AppText>
          <AppText style={styles.elapsedText} testID={elapsedTestID}>
            経過時間 {secondsToClock(elapsedSeconds)}
          </AppText>
        </View>
        <AppText style={styles.subText}>ピンクのポイントで消滅</AppText>
      </View>
      <View
        accessibilityLabel={accessibilityLabel}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        style={styles.track}
        testID={testID}
      >
        <View style={styles.line} />
        <View style={styles.hitPoint} />
        {markers.map(({ phase, visible = true }, index) => {
          if (!visible) return null;
          const left = markerCenter + (1 - phase) * travelWidth;
          const opacity = phase > 0.92 ? Math.max(0, (1 - phase) / 0.08) : 1;
          return (
            <View key={index} style={[styles.marker, expanded && styles.expandedMarker, { left, opacity }]}>
              <Image
                source={require("../../assets/ui/rhythm-heart.png")}
                style={styles.markerImage}
                resizeMode="contain"
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "#777",
    backgroundColor: "#151515",
  },
  title: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 2,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 9,
    paddingTop: 6,
  },
  titleText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  titleGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  elapsedText: { color: lightTheme.muted, fontSize: 8, fontWeight: "800" },
  subText: { color: lightTheme.muted, fontSize: 9 },
  track: { overflow: "hidden", height: 58, justifyContent: "center", marginHorizontal: 8 },
  line: { position: "absolute", right: 10, left: 20, height: 3, backgroundColor: "#ddd" },
  hitPoint: {
    position: "absolute",
    left: 15,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 4,
    borderColor: "#ff69b4",
    backgroundColor: "transparent",
    zIndex: 3,
  },
  marker: {
    position: "absolute",
    width: 52,
    height: 58,
    marginLeft: -26,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  expandedMarker: { width: 74, height: 82, marginLeft: -37 },
  markerImage: { width: "100%", height: "100%" },
});
