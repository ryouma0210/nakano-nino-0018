import { useMemo, useState } from "react";
import { FlatList, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Disclosure } from "@/components/Disclosure";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import { favoriteCategories, favoriteCategoryLabel, favoriteDisplayName, type FavoriteCategory } from "./catalog";
import { addManualFavorite, favoritePickerCandidates } from "./favoritePickerModel";
import { ManualEntryField } from "./ManualEntryField";
import { RankedSelectionEditor } from "./RankedSelectionEditor";

export { favoriteDisplayName } from "./catalog";

type Props = {
  visible: boolean;
  selected: readonly string[];
  ranked: readonly string[];
  saving: boolean;
  error: boolean;
  onSelectedChange: (ids: string[]) => void;
  onRankedChange: (ids: string[]) => void;
  onSave: () => void;
  onClose: () => void;
};

export function FavoritePickerModal(props: Props) {
  // Each opening starts from its selected registrations. Closing discards local additions and inputs.
  return props.visible ? <FavoritePickerSession {...props} /> : null;
}

function FavoritePickerSession({ visible, selected, ranked, saving, error, onSelectedChange, onRankedChange, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FavoriteCategory | "all">("all");
  const [sessionCandidates, setSessionCandidates] = useState<string[]>(() => [...selected]);
  const candidates = useMemo(() => favoritePickerCandidates(selected, sessionCandidates, query, category), [category, query, selected, sessionCandidates]);
  const options = selected.map((id) => ({ value: id, label: favoriteDisplayName(id), localize: false }));

  function addFavorite(name: string) {
    const result = addManualFavorite(name, selected, sessionCandidates);
    if ("error" in result) return result;
    setSessionCandidates(result.sessionCandidates);
    onSelectedChange(result.selected);
    setQuery("");
    setCategory("all");
    return { addedName: result.addedName };
  }

  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => { if (!saving) onClose(); }}>
    <View style={[styles.backdrop, {
      paddingTop: Math.max(16, insets.top + 12), paddingBottom: Math.max(16, insets.bottom + 12),
      paddingLeft: Math.max(16, insets.left + 12), paddingRight: Math.max(16, insets.right + 12),
    }]}>
      <View style={styles.modal} accessibilityViewIsModal>
        <AppText variant="subtitle">オカズ記録</AppText>
        <FlatList style={styles.list} contentContainerStyle={styles.content} data={candidates} keyExtractor={(item) => item.id}
          numColumns={2} columnWrapperStyle={styles.columns}
          keyboardShouldPersistTaps="handled" initialNumToRender={10} maxToRenderPerBatch={12} windowSize={5}
          extraData={selected} ListHeaderComponent={<View style={styles.header}>
            <ManualEntryField title="オカズを手入力で追加" label="追加する名前" emptyMessage="名前を入力してください。"
              successMessage="オカズを追加しました。" onAdd={addFavorite} disabled={saving} testID="favorite-add" />
            <RankedSelectionEditor title="オカズ上位3名" options={options} value={ranked} onChange={onRankedChange} limit={3} disabled={saving} testID="favorite-ranking" />
            <Disclosure title="検索" active={query.trim().length > 0 || category !== "all"} testID="favorite-search-toggle">
              <TextField label="名前・作品名で検索" value={query} onChangeText={setQuery} placeholder="名前・作品名を入力" editable={!saving} testID="favorite-search" />
              <SelectField label="分類" value={category} onChange={(value) => setCategory(value as FavoriteCategory | "all")}
                options={[{ value: "all", label: "すべて" }, ...favoriteCategories]} disabled={saving} testID="favorite-category" />
            </Disclosure>
            <AppText variant="muted">固定候補を選ぶか名前を手入力で追加し、上位3名を設定できます。</AppText>
          </View>}
          ListEmptyComponent={<AppText variant="muted">条件に一致する候補はありません。</AppText>}
          renderItem={({ item }) => {
            const checked = selected.includes(item.id);
            return <Pressable testID={`favorite-option-${item.id}`} accessibilityRole="checkbox" accessibilityLabel={favoriteDisplayName(item.id)}
              accessibilityState={{ checked, disabled: saving }} disabled={saving}
              onPress={() => onSelectedChange(checked ? selected.filter((id) => id !== item.id) : [...selected, item.id])}
              style={[styles.option, checked && styles.selected]}>
              <AppText localize={false} accessible={false} style={styles.check}>{checked ? "✅" : "☐"}</AppText>
              <View style={styles.caption}>
                <AppText localize={false} textBreakStrategy="simple" style={[styles.name, checked && styles.selectedText]}>{item.name}</AppText>
                {item.work ? <AppText localize={false} variant="muted" textBreakStrategy="simple" style={styles.detail}>{item.work}</AppText> : favoriteCategoryLabel(item.category) ? <AppText variant="muted" style={styles.detail}>{favoriteCategoryLabel(item.category)}</AppText> : null}
              </View>
            </Pressable>;
          }} />
        <View style={styles.count}><AppText variant="muted">オカズ登録数</AppText><AppText localize={false}>{selected.length}</AppText></View>
        {error ? <AppText style={styles.error}>オカズを保存できませんでした。再保存できます。</AppText> : null}
        <View style={styles.actions}>
          <View style={styles.action}><PrimaryButton title="キャンセル" tone="secondary" disabled={saving} onPress={onClose} /></View>
          <View style={styles.action}><PrimaryButton title={saving ? "保存中..." : error ? "再保存" : "完了"} disabled={saving} onPress={onSave} /></View>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.85)" },
  modal: { width: "100%", maxWidth: 560, height: "100%", maxHeight: 720, minHeight: 0, gap: 14, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: "#b7d7ff", backgroundColor: "#111" },
  list: { flex: 1, minHeight: 0 },
  content: { gap: 8, paddingBottom: 8, paddingRight: Platform.OS === "web" ? 16 : 0 },
  header: { gap: 16, paddingBottom: 10 },
  columns: { justifyContent: "space-between", gap: 8 },
  option: { width: "48%", minWidth: 0, minHeight: 44, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "#555", backgroundColor: "#050505" },
  selected: { borderColor: "#9bcbff", backgroundColor: "#142b45" },
  check: { width: 20, flexShrink: 0, textAlign: "center", color: "#fff", fontSize: 13, fontWeight: "900", lineHeight: 20 },
  caption: { flex: 1, minWidth: 0, gap: 3 },
  name: { minWidth: 0, color: "#fff", fontSize: 13, fontWeight: "900", lineHeight: 20 },
  selectedText: { color: "#9bcbff" },
  detail: { minWidth: 0, fontSize: 11, lineHeight: 16 },
  count: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  error: { color: "#ffb5bd" },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
});
