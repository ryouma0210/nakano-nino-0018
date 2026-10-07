import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { createVideoPlayer, type VideoThumbnail } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { displayedFileName, storedFileKey } from "@/features/files/fileList";
import { mimeTypeForName, type StoredFile } from "@/services/fileStorageService";
import { MAX_CUSTOM_MEDIA } from "./game";

type Props = {
  visible: boolean;
  files: StoredFile[];
  selectedKeys: string[];
  loading: boolean;
  loadFailed: boolean;
  onToggle: (file: StoredFile) => void;
  onRetry: () => void;
  onClose: () => void;
};

export function EnduranceFilePicker(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      {props.visible ? <PickerContents {...props} /> : null}
    </Modal>
  );
}

function PickerContents({ files, selectedKeys, loading, loadFailed, onToggle, onRetry, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const thumbnails = useVideoThumbnails(files, !loading && !loadFailed);
  return (
    <View style={[styles.dialog, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
      <AppText variant="title">ファイル選択</AppText>
      <AppText variant="muted">最大100件まで選択できます。</AppText>
      {loading ? <ActivityIndicator color="#fff" /> : null}
      {loadFailed ? (
        <>
          <AppText style={styles.error}>ファイルを読み込めませんでした</AppText>
          <PrimaryButton title="再試行" tone="secondary" onPress={onRetry} />
        </>
      ) : null}
      <FlatList
        style={styles.list}
        data={loading || loadFailed ? [] : files}
        extraData={{ selectedKeys, thumbnails }}
        keyExtractor={storedFileKey}
        contentContainerStyle={styles.listContents}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        renderItem={({ item }) => {
          const selected = selectedKeys.includes(storedFileKey(item));
          const disabled = !selected && selectedKeys.length >= MAX_CUSTOM_MEDIA;
          const video = mimeTypeForName(item.name).startsWith("video/");
          const label = displayedFileName(item);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={label}
              accessibilityState={{ checked: selected, disabled }}
              aria-checked={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onPress={() => onToggle(item)}
              style={[styles.choice, selected && styles.selected, disabled && styles.disabled]}
            >
              <AppText localize={false} style={styles.checkbox}>{selected ? "☑" : "□"}</AppText>
              <View style={styles.thumbnail} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {video ? (
                  thumbnails[item.uri]
                    ? <ExpoImage source={thumbnails[item.uri]} style={styles.fill} contentFit="contain" />
                    : <AppText variant="muted">動画</AppText>
                ) : <Image source={{ uri: item.uri }} style={styles.fill} resizeMode="contain" />}
              </View>
              <AppText localize={false} numberOfLines={3} style={styles.name}>{label}</AppText>
            </Pressable>
          );
        }}
        ListEmptyComponent={!loading && !loadFailed ? (
          <AppText variant="muted">勃起我慢ゲーム用の画像・動画がありません。ファイル格納で用途を追加してください。</AppText>
        ) : null}
      />
      <PrimaryButton title="選択完了" tone="preparation" onPress={onClose} />
    </View>
  );
}

type Thumbnail = VideoThumbnail | string;

function useVideoThumbnails(files: StoredFile[], enabled: boolean) {
  const [thumbnails, setThumbnails] = useState<Record<string, Thumbnail>>({});
  useEffect(() => {
    const controller = new AbortController();
    const generated: Record<string, Thumbnail> = {};
    setThumbnails({});
    if (!enabled) return;
    async function generateSequentially() {
      for (const file of files) {
        if (controller.signal.aborted) break;
        if (!mimeTypeForName(file.name).startsWith("video/")) continue;
        try {
          // Keep only one temporary decoder alive; list rows render still images.
          const thumbnail = Platform.OS === "web"
            ? await webVideoThumbnail(file.uri, controller.signal)
            : await nativeVideoThumbnail(file.uri, controller.signal);
          if (!thumbnail) continue;
          if (controller.signal.aborted) {
            if (typeof thumbnail !== "string") thumbnail.release();
            break;
          }
          generated[file.uri] = thumbnail;
          setThumbnails({ ...generated });
        } catch {
          // A damaged or unsupported video remains selectable by name.
        }
      }
    }
    void generateSequentially();
    return () => {
      controller.abort();
      Object.values(generated).forEach((thumbnail) => {
        if (typeof thumbnail !== "string") thumbnail.release();
      });
    };
  }, [enabled, files]);
  return thumbnails;
}

async function nativeVideoThumbnail(uri: string, signal: AbortSignal): Promise<VideoThumbnail | undefined> {
  const player = createVideoPlayer({ uri });
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    player.release();
  };
  signal.addEventListener("abort", release, { once: true });
  try {
    player.muted = true;
    player.volume = 0;
    const [thumbnail] = await player.generateThumbnailsAsync(0.1, { maxWidth: 192 });
    return thumbnail;
  } finally {
    signal.removeEventListener("abort", release);
    release();
  }
}

function webVideoThumbnail(uri: string, signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (thumbnail: string | null) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      resolve(thumbnail);
    };
    const abort = () => finish(null);
    if (signal.aborted) { finish(null); return; }
    signal.addEventListener("abort", abort, { once: true });
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadeddata = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) { finish(null); return; }
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 192 / video.videoWidth, 192 / video.videoHeight);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) { finish(null); return; }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.75));
      } catch { finish(null); }
    };
    video.onerror = () => finish(null);
    timeout = setTimeout(() => finish(null), 5000);
    video.src = uri;
    video.load();
  });
}

const styles = StyleSheet.create({
  dialog: { flex: 1, paddingHorizontal: 16, gap: 16, backgroundColor: "#000" },
  list: { flex: 1 }, listContents: { gap: 10, paddingBottom: 16 },
  choice: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderWidth: 1, borderColor: "#888", borderRadius: 4 },
  selected: { borderColor: "#ff69b4", backgroundColor: "#3d1529" }, disabled: { opacity: 0.5 },
  checkbox: { fontSize: 24 }, thumbnail: { width: 76, height: 64, alignItems: "center", justifyContent: "center", backgroundColor: "#111" },
  fill: { width: "100%", height: "100%" }, name: { flex: 1 }, error: { color: "#ff3b45" },
});
