import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useAppAudio } from "@/audio/AudioProvider";
import { translateText } from "@/i18n";

export function CollectionNewBadge({ id, onRead }: { id: string; onRead: () => void }) {
  const { settings } = useAppAudio();
  return <View style={styles.row} testID={`collection-new-${id}`}>
    <AppText localize={false} style={styles.badge}>NEW</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel={translateText("確認済みにする", settings?.language ?? "ja")}
      style={styles.button} onPress={onRead} testID={`collection-read-${id}`}>
      <AppText style={styles.label}>確認済みにする</AppText>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" },
  badge: { color: "#111", backgroundColor: "#f2c94c", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: "900" },
  button: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: "#78672f", borderRadius: 4 },
  label: { color: "#f2c94c", fontSize: 12 },
});
