import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "./AppText";

export function ImageExpandBadge() {
  return (
    <View style={styles.badge} pointerEvents="none">
      <Ionicons name="expand-outline" size={18} color="#fff" />
      <AppText style={styles.label}>拡大</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: "absolute", bottom: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.85)" },
  label: { color: "#fff", fontWeight: "700" },
});
