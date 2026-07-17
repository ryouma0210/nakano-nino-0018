import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lightTheme } from "@/constants/theme";

export function Screen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: Math.max(12, insets.top) }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: lightTheme.background,
  },
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 120,
  },
});
