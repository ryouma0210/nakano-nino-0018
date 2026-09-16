import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lightTheme } from "@/constants/theme";
import { useHasBottomNavigation } from "@/components/BottomNavigation";

export function Screen({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const insets = useSafeAreaInsets();
  const hasBottomNavigation = useHasBottomNavigation();
  return (
    <View style={[
      styles.root,
      style,
      {
        paddingTop: Math.max(12, insets.top),
        paddingBottom: hasBottomNavigation ? 0 : insets.bottom,
      },
    ]}>
      <ScrollView contentContainerStyle={[styles.content, hasBottomNavigation && styles.contentWithNavigation]} keyboardShouldPersistTaps="handled">
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
  contentWithNavigation: { paddingBottom: 24 },
});
