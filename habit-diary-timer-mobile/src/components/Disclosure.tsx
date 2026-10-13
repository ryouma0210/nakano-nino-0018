import { useState, type PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "./AppText";
import { LocalizedPressable } from "./LocalizedPressable";

/** Hiding a panel never changes the values owned by its screen. */
export function Disclosure({ title, active = false, testID, expanded: controlledExpanded, onExpandedChange, children }: PropsWithChildren<{
  title: string;
  active?: boolean;
  testID: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}>) {
  const [localExpanded, setExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  return <View style={styles.panel}>
    <LocalizedPressable testID={testID} accessibilityRole="button" accessibilityLabel={title}
      accessibilityHint={active ? "絞り込み中" : undefined}
      accessibilityState={{ expanded }} aria-expanded={expanded}
      onPress={() => { setExpanded(!expanded); onExpandedChange?.(!expanded); }}
      style={({ pressed }) => [styles.heading, pressed && styles.pressed]}>
      <View style={styles.labels}>
        <AppText style={styles.title}>{title}</AppText>
        {active ? <AppText style={styles.active}>絞り込み中</AppText> : null}
      </View>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color="#b7d7ff" />
    </LocalizedPressable>
    {expanded ? <View testID={`${testID}-content`} style={styles.content}>{children}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { minWidth: 0, borderWidth: 1, borderColor: "#52657c", borderRadius: 4, backgroundColor: "#101722" },
  heading: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  labels: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  title: { fontWeight: "800" },
  active: { color: "#b7d7ff", fontSize: 12 },
  content: { padding: 12, paddingTop: 4, gap: 12 },
  pressed: { backgroundColor: "#253954" },
});
