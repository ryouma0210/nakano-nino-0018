import type { ReactElement } from "react";
import { FlatList, ScrollView, StyleSheet, View, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHasBottomNavigation } from "@/components/BottomNavigation";
import { lightTheme } from "@/constants/theme";
import { useDesktopLayout } from "@/hooks/useDesktopLayout";
import { DESKTOP_CONTENT_MAX_WIDTH, desktopConversationWidth } from "@/utils/desktopLayout";
import type { StoredFile } from "@/services/fileStorageService";
import { storedFileKey } from "./fileList";

type Props = {
  files: StoredFile[];
  columns: 1 | 2 | 3;
  title: ReactElement;
  conversation: ReactElement;
  header: ReactElement;
  footer: ReactElement;
  renderItem: ListRenderItem<StoredFile>;
};

/** One virtualized scrolling list; the desktop conversation is a sibling pane. */
export function FileLibraryList({ files, columns, title, conversation, header, footer, renderItem }: Props) {
  const insets = useSafeAreaInsets();
  const hasNavigation = useHasBottomNavigation();
  const { isDesktop, width } = useDesktopLayout();
  return (
    <View style={[styles.root, { paddingTop: Math.max(12, insets.top), paddingBottom: hasNavigation ? 0 : insets.bottom }]}>
      <View style={[styles.content, isDesktop && styles.desktopContent]}>
        {isDesktop ? title : null}
        <View style={[styles.panes, isDesktop && styles.desktopPanes]}>
          {isDesktop ? (
            <ScrollView style={{ width: desktopConversationWidth(width), flexGrow: 0 }} contentContainerStyle={styles.conversation} keyboardShouldPersistTaps="handled">
              {conversation}
            </ScrollView>
          ) : null}
          <FlatList
            key={columns}
            style={styles.list}
            data={files}
            numColumns={columns}
            keyExtractor={storedFileKey}
            renderItem={renderItem}
            ListHeaderComponent={<View style={styles.header}>{!isDesktop ? <>{title}{conversation}</> : null}{header}</View>}
            ListFooterComponent={<View style={styles.footer}>{footer}</View>}
            contentContainerStyle={[styles.listContent, isDesktop && styles.desktopListContent, hasNavigation && styles.withNavigation]}
            columnWrapperStyle={columns > 1 ? styles.row : undefined}
            ItemSeparatorComponent={RowGap}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </View>
    </View>
  );
}

function RowGap() { return <View style={styles.rowGap} />; }

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, minWidth: 0, backgroundColor: lightTheme.background },
  content: { flex: 1, minHeight: 0, width: "100%" },
  desktopContent: { maxWidth: DESKTOP_CONTENT_MAX_WIDTH, alignSelf: "center", padding: 24, paddingBottom: 0, gap: 14 },
  panes: { flex: 1, minHeight: 0, minWidth: 0 },
  desktopPanes: { flexDirection: "row", gap: 24 },
  conversation: { paddingBottom: 28 },
  list: { flex: 1, minWidth: 0, minHeight: 0 },
  listContent: { padding: 16, paddingBottom: 120 },
  desktopListContent: { padding: 0, paddingRight: 8, paddingBottom: 28 },
  withNavigation: { paddingBottom: 24 },
  header: { gap: 14, paddingBottom: 14 },
  footer: { gap: 14, paddingTop: 14 },
  row: { gap: 8 },
  rowGap: { height: 8 },
});
