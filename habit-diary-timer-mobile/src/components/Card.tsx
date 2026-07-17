import { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { lightTheme } from "@/constants/theme";

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    borderWidth: 1,
    borderColor: lightTheme.border,
    borderRadius: 10,
    padding: 14,
    backgroundColor: lightTheme.surface,
  },
});
