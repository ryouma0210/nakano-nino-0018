import { Children, isValidElement, type PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lightTheme } from "@/constants/theme";
import { useHasBottomNavigation } from "@/components/BottomNavigation";
import { RoomConversation } from "@/components/RoomConversation";
import { useDesktopLayout } from "@/hooks/useDesktopLayout";
import { DESKTOP_CONTENT_MAX_WIDTH, desktopConversationWidth } from "@/utils/desktopLayout";

export function Screen({
  children,
  style,
  desktopLayout = "auto",
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; desktopLayout?: "auto" | "single" }>) {
  const insets = useSafeAreaInsets();
  const hasBottomNavigation = useHasBottomNavigation();
  const { isDesktop, width } = useDesktopLayout();
  const items = Children.toArray(children);
  // Only an explicit, direct RoomConversation child opts into two panes.
  // Fragments and nested components retain their existing layout.
  const conversationIndex = desktopLayout === "auto"
    ? items.findIndex((item) => isValidElement(item) && item.type === RoomConversation)
    : -1;
  const hasConversation = conversationIndex >= 0;
  const split = isDesktop && hasConversation;
  return (
    <View style={[
      styles.root,
      style,
      {
        paddingTop: Math.max(12, insets.top),
        paddingBottom: hasBottomNavigation ? 0 : insets.bottom,
      },
    ]}>
      <ScrollView
        style={[styles.scroll, split && desktopOuterScroll]}
        contentContainerStyle={[
          styles.content,
          hasBottomNavigation && styles.contentWithNavigation,
          isDesktop && styles.desktopContent,
          split && styles.desktopConversationContent,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {hasConversation ? (
          <>
            {conversationIndex > 0 ? <View style={styles.section}>{items.slice(0, conversationIndex)}</View> : null}
            <View style={[styles.section, split && styles.desktopPanes]}>
              <View
                tabIndex={split ? 0 : undefined}
                style={[
                  styles.conversationPane,
                  split && desktopScrollablePane,
                  split && { width: desktopConversationWidth(width) },
                ]}
              >
                {items[conversationIndex]}
              </View>
              <View
                tabIndex={split ? 0 : undefined}
                style={[styles.section, split && styles.desktopMainPane, split && desktopScrollablePane]}
              >
                {items.slice(conversationIndex + 1)}
              </View>
            </View>
          </>
        ) : children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    backgroundColor: lightTheme.background,
  },
  scroll: { flex: 1, minHeight: 0 },
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 120,
  },
  contentWithNavigation: { paddingBottom: 24 },
  desktopContent: { width: "100%", maxWidth: DESKTOP_CONTENT_MAX_WIDTH, alignSelf: "center", padding: 24, paddingBottom: 28 },
  desktopConversationContent: { flex: 1, minHeight: 0 },
  section: { gap: 14, minWidth: 0 },
  desktopPanes: { flex: 1, flexDirection: "row", gap: 24, minHeight: 0 },
  conversationPane: { minWidth: 0, flexShrink: 0 },
  desktopMainPane: { flex: 1, minHeight: 0, paddingRight: 8, paddingBottom: 4 },
});

// These CSS overflow properties are applied only on Web. Keeping View wrappers
// mounted across the breakpoint preserves form, timer, and media state.
const desktopScrollablePane = { overflowY: "auto", overflowX: "hidden" } as ViewStyle;
// scrollEnabled=false adds touch-action:none in React Native Web, which also
// blocks touch scrolling inside the panes on Windows touchscreens.
const desktopOuterScroll = { overflowY: "hidden", overflowX: "hidden" } as ViewStyle;
