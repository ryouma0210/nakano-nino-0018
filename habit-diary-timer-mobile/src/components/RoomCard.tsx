import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { lightTheme } from "@/constants/theme";
import type { AppRoom } from "@/constants/rooms";

type Props = {
  room: AppRoom;
};

export function RoomCard({ room }: Props) {
  return (
    <Pressable onPress={() => router.push(room.href)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.roomScene, { backgroundColor: room.color }]}>
        <View style={[styles.window, { borderColor: room.accent }]} />
        <Furniture room={room} />
        <View style={[styles.floor, { backgroundColor: room.floor }]} />
      </View>
      <View style={styles.body}>
        <AppText variant="subtitle">{room.name}</AppText>
        <AppText style={styles.roomTitle}>{room.title}</AppText>
        <AppText variant="muted">{room.description}</AppText>
      </View>
    </Pressable>
  );
}

function Furniture({ room }: { room: AppRoom }) {
  if (room.furniture === "desk") {
    return (
      <View style={styles.furnitureWrap}>
        <View style={[styles.deskTop, { backgroundColor: room.accent }]} />
        <View style={styles.deskLegs}>
          <View style={[styles.deskLeg, { backgroundColor: lightTheme.primaryDark }]} />
          <View style={[styles.deskLeg, { backgroundColor: lightTheme.primaryDark }]} />
        </View>
      </View>
    );
  }
  if (room.furniture === "clock") {
    return (
      <View style={styles.furnitureWrap}>
        <View style={[styles.clock, { borderColor: room.accent }]}>
          <View style={[styles.clockHandLong, { backgroundColor: room.accent }]} />
          <View style={[styles.clockHandShort, { backgroundColor: room.accent }]} />
        </View>
      </View>
    );
  }
  if (room.furniture === "shelf") {
    return (
      <View style={styles.furnitureWrap}>
        {[0, 1, 2].map((line) => (
          <View key={line} style={[styles.shelfLine, { backgroundColor: room.accent }]} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.furnitureWrap}>
      <View style={[styles.bedBack, { backgroundColor: room.accent }]} />
      <View style={styles.bedBase} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: lightTheme.border,
    borderRadius: 16,
    backgroundColor: lightTheme.surface,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  roomScene: {
    minHeight: 132,
    padding: 14,
  },
  window: {
    width: 48,
    height: 42,
    borderWidth: 3,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.76)",
  },
  floor: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 34,
  },
  furnitureWrap: {
    position: "absolute",
    right: 18,
    bottom: 22,
    alignItems: "center",
  },
  deskTop: {
    width: 74,
    height: 14,
    borderRadius: 7,
  },
  deskLegs: {
    width: 58,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  deskLeg: {
    width: 8,
    height: 30,
    borderRadius: 4,
  },
  clock: {
    alignItems: "center",
    justifyContent: "center",
    width: 62,
    height: 62,
    borderWidth: 5,
    borderRadius: 31,
    backgroundColor: "#fff",
  },
  clockHandLong: {
    position: "absolute",
    width: 4,
    height: 22,
    borderRadius: 2,
    transform: [{ translateY: -8 }],
  },
  clockHandShort: {
    position: "absolute",
    width: 18,
    height: 4,
    borderRadius: 2,
    transform: [{ translateX: 7 }],
  },
  shelfLine: {
    width: 72,
    height: 12,
    marginTop: 10,
    borderRadius: 6,
  },
  bedBack: {
    width: 76,
    height: 42,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  bedBase: {
    width: 92,
    height: 24,
    marginTop: -12,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  body: {
    gap: 6,
    padding: 14,
  },
  roomTitle: {
    color: lightTheme.primaryDark,
    fontWeight: "800",
  },
});
