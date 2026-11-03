import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FlatList, Image, Modal, Platform, StyleSheet, View } from "react-native";
import { Asset } from "expo-asset";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { LocalizedPressable as Pressable } from "@/components/LocalizedPressable";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextField } from "@/components/TextField";
import { displayedFileName, filterFilesByName } from "@/features/files/fileList";
import type { StoredFile } from "@/services/fileStorageService";
import type { RhythmImages, RhythmImageState } from "@/services/rhythmChallengeService";
import { rhythmDefaultImages as defaultImages } from "./defaultImages";

export const RHYTHM_IMAGE_LABELS: Record<RhythmImageState, string> = {
  normal: "通常時", paused: "一時停止時", finished: "終了時",
};
export const RHYTHM_IMAGE_STATES: RhythmImageState[] = ["normal", "paused", "finished"];

export function RhythmImage({ state, images, files, loading, fill = false, overlay, action }: {
  state: RhythmImageState; images: RhythmImages; files: StoredFile[]; loading: boolean; fill?: boolean; overlay?: ReactNode; action?: ReactNode;
}) {
  const reference = images[state];
  const file = files.find((item) => item.name === reference?.name && item.purpose === reference.purpose);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  useEffect(() => { setFailedUri(null); }, [file]);
  const uri = file?.uri;
  const useStored = Boolean(uri && uri !== failedUri);
  const defaultAsset = useMemo(() => Asset.fromModule(defaultImages[state]), [state]);
  const [storedSize, setStoredSize] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const fitToImage = fill && Platform.OS === "web";
  useEffect(() => {
    if (!fitToImage || !useStored || !uri) return;
    let active = true;
    Image.getSize(uri, (width, height) => {
      if (active) setStoredSize({ uri, width, height });
    }, () => {});
    return () => { active = false; };
  }, [fitToImage, uri, useStored]);
  const onImageError = useCallback(() => { if (uri) setFailedUri(uri); }, [uri]);
  const imageSize = useStored && storedSize && storedSize.uri === uri ? storedSize : defaultAsset;
  const imageWidth = imageSize.width ?? 0;
  const imageHeight = imageSize.height ?? 0;
  const scale = imageWidth > 0 && imageHeight > 0
    ? Math.min(frameSize.width / imageWidth, frameSize.height / imageHeight) : 0;
  // Keep overlays beside the contained image, with room for text and the voice
  // button when a short window makes a portrait image particularly narrow.
  const fittedContent = fitToImage && scale > 0 ? {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto" as const,
    width: Math.min(frameSize.width, Math.max(240, imageWidth * scale)),
    height: Math.min(frameSize.height, Math.max(140, imageHeight * scale)),
  } : undefined;
  return <View style={[styles.media, fill && styles.fill]} testID={`rhythm-image-${state}`}>
    <View style={[styles.imageFrame, fill && styles.fillFrame]} testID="rhythm-image-frame"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setFrameSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
      }}>
      <View style={[styles.imageContent, fittedContent]} testID="rhythm-image-content">
        <Image key={useStored ? uri : state} source={useStored ? { uri } : defaultImages[state]}
          style={styles.image} resizeMode="contain" accessibilityLabel={RHYTHM_IMAGE_LABELS[state]}
          onError={onImageError} />
        {overlay}
        {action ? <View style={styles.mediaAction} pointerEvents="box-none">{action}</View> : null}
      </View>
    </View>
    {reference && !useStored && !loading ? <AppText variant="muted">選択した画像を読み込めないため、デフォルト画像を表示しています。</AppText> : null}
  </View>;
}

export function RhythmImageSettings({ visible, images, files, loadingFiles, fileError, onReload, onSave, onClose }: {
  visible: boolean; images: RhythmImages; files: StoredFile[]; loadingFiles: boolean; fileError: boolean;
  onReload: () => void; onSave: (images: RhythmImages) => Promise<void>; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(images);
  const [state, setState] = useState<RhythmImageState>("normal");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    if (visible) { setDraft(images); setState("normal"); setSearch(""); setSaveError(false); }
  }, [visible, images]);
  const reference = draft[state];
  const selectedFile = files.find((item) => item.name === reference?.name && item.purpose === reference.purpose);
  async function save() {
    if (saving) return;
    setSaving(true); setSaveError(false);
    try { await onSave(draft); onClose(); } catch { setSaveError(true); }
    finally { setSaving(false); }
  }
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!saving) onClose(); }}>
    <View style={[styles.backdrop, { paddingTop: Math.max(16, insets.top), paddingBottom: Math.max(16, insets.bottom) }]}>
      <View style={styles.dialog} testID="rhythm-images-dialog" accessibilityViewIsModal>
        <FlatList data={filterFilesByName(files, search)} keyExtractor={(file) => `${file.purpose}:${file.name}`}
          style={styles.list} contentContainerStyle={styles.fileList} keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<View style={styles.section}>
        <AppText variant="subtitle">チャレンジ画像の設定</AppText>
        <AppText variant="muted">状態ごとにデフォルト画像または格納した画像を選べます。</AppText>
        <View style={styles.tabs} accessibilityRole="radiogroup">
          {RHYTHM_IMAGE_STATES.map((value) => <Pressable key={value} accessibilityRole="radio"
            accessibilityState={{ checked: value === state, disabled: saving }} disabled={saving}
            aria-checked={value === state} aria-disabled={saving}
            testID={`rhythm-image-tab-${value}`} onPress={() => { setState(value); setSearch(""); }}
            style={[styles.tab, value === state && styles.selected]}>
            <AppText>{RHYTHM_IMAGE_LABELS[value]}</AppText>
          </Pressable>)}
        </View>
        <View style={styles.current}>
          <AppText variant="muted">選択中の画像</AppText>
          <AppText numberOfLines={2} localize={reference === null}>
            {reference ? selectedFile ? displayedFileName(selectedFile) : reference.name : "デフォルト画像"}
          </AppText>
        </View>
        <Pressable accessibilityRole="radio" accessibilityState={{ checked: reference === null, disabled: saving }}
          aria-checked={reference === null} aria-disabled={saving}
          testID="rhythm-image-default" disabled={saving} onPress={() => setDraft((previous) => ({ ...previous, [state]: null }))}
          style={[styles.file, reference === null && styles.selected]}>
          <Image source={defaultImages[state]} style={styles.thumbnail} resizeMode="contain" />
          <AppText style={styles.fileName}>デフォルト画像</AppText>
          <AppText localize={false}>{reference === null ? "●" : "○"}</AppText>
        </Pressable>
        <TextField label="ファイル名で検索" placeholder="ファイル名で検索" value={search} onChangeText={setSearch}
          editable={!saving} testID="rhythm-image-search" />
        {loadingFiles ? <AppText variant="muted">読み込み中…</AppText> : null}
        {fileError ? <View style={styles.error}>
          <AppText accessibilityRole="alert">画像一覧を読み込めませんでした。</AppText>
          <PrimaryButton title="再試行" tone="secondary" onPress={onReload} disabled={loadingFiles || saving} />
        </View> : null}
          </View>}
          ListEmptyComponent={!loadingFiles && !fileError ? <AppText variant="muted">選択できる格納画像がありません。</AppText> : null}
          renderItem={({ item }) => {
            const checked = item.name === reference?.name && item.purpose === reference.purpose;
            return <Pressable accessibilityRole="radio" accessibilityState={{ checked, disabled: saving }} disabled={saving}
              aria-checked={checked} aria-disabled={saving}
              testID={`rhythm-image-file-${item.purpose}-${item.name}`}
              onPress={() => {
                if (item.purpose === "profile" || item.purpose === "chastity") return;
                setDraft((previous) => ({ ...previous, [state]: { name: item.name, purpose: item.purpose } }));
              }} style={[styles.file, checked && styles.selected]}>
              <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="contain" />
              <AppText style={styles.fileName} localize={false} numberOfLines={2}>{displayedFileName(item)}</AppText>
              <AppText localize={false}>{checked ? "●" : "○"}</AppText>
            </Pressable>;
          }} ListFooterComponent={<View style={styles.section}>
        {saveError ? <AppText accessibilityRole="alert">画像の設定を保存できませんでした。もう一度お試しください。</AppText> : null}
        <View style={styles.actions}>
          <View style={styles.action}><PrimaryButton title="キャンセル" tone="secondary" disabled={saving} onPress={onClose} testID="rhythm-images-cancel" /></View>
          <View style={styles.action}><PrimaryButton title={saving ? "保存中…" : "保存"} disabled={saving} onPress={() => void save()} testID="rhythm-images-save" /></View>
        </View>
          </View>} />
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  media: { gap: 8 },
  fill: { flex: 1, minHeight: 0 },
  fillFrame: { flex: 1, aspectRatio: undefined, borderRadius: 0, backgroundColor: "#000" },
  mediaAction: { position: "absolute", top: 8, right: 8, zIndex: 20, elevation: 20 },
  imageFrame: { width: "100%", aspectRatio: 1.6, borderRadius: 6, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#10131e" },
  imageContent: { flex: 1, width: "100%", minHeight: 0 },
  image: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  backdrop: { flex: 1, padding: 16, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.85)" },
  dialog: { width: "100%", maxWidth: 560, height: "90%", padding: 14, borderWidth: 1, borderColor: "#fff", borderRadius: 6, backgroundColor: "#101018" },
  section: { gap: 10 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tab: { flex: 1, minWidth: 64, minHeight: 44, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#777", borderRadius: 5 },
  selected: { backgroundColor: "#392958", borderColor: "#c8a4ff" },
  current: { gap: 2 },
  file: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 60, padding: 8, borderWidth: 1, borderColor: "#666", borderRadius: 5 },
  fileName: { flex: 1, minWidth: 0 },
  thumbnail: { width: 54, height: 40 },
  list: { flex: 1, minHeight: 0 },
  fileList: { gap: 8 },
  error: { gap: 6 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
});
