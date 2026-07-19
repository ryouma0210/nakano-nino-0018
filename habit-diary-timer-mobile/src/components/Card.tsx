import { PropsWithChildren } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { lightTheme } from "@/constants/theme";

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    borderWidth: 1,
    borderColor: lightTheme.border,
    borderRadius: 4,
    padding: 14,
    backgroundColor: lightTheme.surface,
  },
});
