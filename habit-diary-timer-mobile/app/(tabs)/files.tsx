import { useCallback, useEffect, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RoomConversation } from "@/components/RoomConversation";
import { roomMessages } from "@/constants/messages";
import { Screen } from "@/components/Screen";
import {
  fileStorageService,
  formatBytes,
  type StoredFile,
} from "@/services/fileStorageService";

export default function FilesScreen() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [purposeFilter, setPurposeFilter] = useState<"all" | "training" | "punishment">("all");
  const [columns, setColumns] = useState<1 | 2 | 3>(3);
  const [selected, setSelected] = useState<StoredFile | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredFile | null>(null);
  const load = useCallback(() => {
    fileStorageService.list().then(setFiles);
  }, []);
  useEffect(load, [load]);
  useFocusEffect(load);

  async function upload(purpose: "training" | "punishment") {
    if (await fileStorageService.pickAndStore(purpose)) load();
  }

  function remove(file: StoredFile) {
    setPendingDelete(file);
  }

  const visibleFiles = files.filter(
    (file) => purposeFilter === "all" || file.purpose === purposeFilter,
  );
  const tileWidth = columns === 1 ? "100%" : columns === 2 ? "48.8%" : "31.7%";

  return (
    <Screen>
      <AppText variant="title">ファイル格納部屋</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/files-nino.png")}
        roomName="ファイル格納部屋"
        lines={roomMessages.files.lines}
        contractLines={roomMessages.files.contractLines}
      />
      <View style={styles.uploadButtons}>
        <View style={styles.grow}>
          <PrimaryButton title="調教用" onPress={() => upload("training")} />
        </View>
        <View style={styles.grow}>
          <PrimaryButton title="お仕置き用" onPress={() => upload("punishment")} />
        </View>
      </View>
      <AppText variant="muted">
        使用量 {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}
      </AppText>
      <Card style={styles.displaySettings}>
        <AppText variant="label">用途で絞り込み</AppText>
        <View style={styles.optionRow}>
          {([
            ["all", "すべて"],
            ["training", "調教用"],
            ["punishment", "お仕置き用"],
          ] as const).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setPurposeFilter(value)}
              style={[styles.optionButton, purposeFilter === value && styles.optionButtonSelected]}
            >
              <AppText style={[styles.optionText, purposeFilter === value && styles.optionTextSelected]}>
                {label}
              </AppText>
            </Pressable>
          ))}
        </View>
        <AppText variant="label">表示サイズ</AppText>
        <View style={styles.optionRow}>
          {([1, 2, 3] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setColumns(value)}
              style={[styles.optionButton, columns === value && styles.optionButtonSelected]}
            >
              <AppText style={[styles.optionText, columns === value && styles.optionTextSelected]}>
                {value}列
              </AppText>
            </Pressable>
          ))}
        </View>
      </Card>
      {files.length === 0 ? (
        <Card>
          <AppText variant="muted">格納されたファイルはありません。</AppText>
        </Card>
      ) : null}
      {files.length > 0 && visibleFiles.length === 0 ? (
        <Card><AppText variant="muted">該当するファイルはありません。</AppText></Card>
      ) : null}
      <View style={styles.fileGrid}>
      {visibleFiles.map((file, index) => (
        <View key={file.uri} style={[styles.fileTile, { width: tileWidth }]}>
          <Pressable
            onPress={() => setSelected(file)}
            style={[styles.preview, columns === 1 ? styles.previewWide : styles.previewSquare]}
          >
            {/\.(png|jpe?g|webp|gif)$/i.test(file.name) ? (
              <View style={styles.thumbnailWrap}>
                <Image source={{ uri: file.uri }} style={styles.thumbnail} resizeMode="contain" />
                <FileLabel label={`格納ファイル ${index + 1}/${visibleFiles.length}`} />
              </View>
            ) : /\.mp4$/i.test(file.name) ? (
              <VideoThumbnail
                file={file}
                label={`格納ファイル ${index + 1}/${visibleFiles.length}`}
              />
            ) : (
              <View style={styles.fileBadge}>
                <AppText style={styles.fileBadgeText}>
                  FILE
                </AppText>
              </View>
            )}
          </Pressable>
          <View style={[styles.row, styles.compactRow]}>
            <View style={styles.grow}>
              <AppText numberOfLines={1} style={styles.compactName}>
                {file.name}
              </AppText>
            </View>
            <Pressable accessibilityLabel={`${file.name}を削除`} onPress={() => remove(file)} style={styles.compactDelete}>
              <AppText style={styles.compactDeleteText}>×</AppText>
            </Pressable>
          </View>
        </View>
      ))}
      </View>
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
      {selected ? (
        <FileViewer file={selected} onClose={() => setSelected(null)} />
      ) : null}
      <ConfirmModal
        visible={pendingDelete !== null}
        title="ファイルを削除しますか？"
        message={`${pendingDelete?.name ?? ""}\n\n削除したファイルは元に戻せません。`}
        confirmLabel="削除する"
        confirmTone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const file = pendingDelete;
          setPendingDelete(null);
          if (!file) return;
          await fileStorageService.remove(file.uri);
          load();
        }}
      />
    </Screen>
  );
}

function FileLabel({ label }: { label: string }) {
  return (
    <View style={styles.videoLabel}>
      <AppText numberOfLines={1} style={styles.videoLabelText}>{label}</AppText>
    </View>
  );
}

function VideoThumbnail({ file, label }: { file: StoredFile; label: string }) {
  const player = useVideoPlayer({ uri: file.uri }, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.volume = 0;
    instance.currentTime = 0.1;
    instance.pause();
  });

  return (
    <View style={styles.thumbnailWrap} pointerEvents="none">
      <VideoView
        player={player}
        style={styles.thumbnail}
        nativeControls={false}
        contentFit="contain"
      />
      <FileLabel label={label} />
    </View>
  );
}

function FileViewer({
  file,
  onClose,
}: {
  file: StoredFile;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const video = /\.mp4$/i.test(file.name);
  const player = useVideoPlayer(
    video ? { uri: file.uri } : null,
    (instance) => {
      instance.loop = true;
      if (video) instance.play();
    },
  );
  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.viewer,
          {
            paddingTop: Math.max(12, insets.top),
            paddingBottom: Math.max(12, insets.bottom),
          },
        ]}
      >
        <AppText variant="subtitle">{file.name}</AppText>
        <View style={styles.viewerMedia}>
          {video ? (
            <VideoView
              player={player}
              style={styles.fullMedia}
              nativeControls
              contentFit="contain"
            />
          ) : (
            <Image
              source={{ uri: file.uri }}
              style={styles.fullMedia}
              resizeMode="contain"
            />
          )}
        </View>
        <PrimaryButton title="閉じる" tone="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  uploadButtons: { flexDirection: "row", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  compactRow: { gap: 4, paddingTop: 5 },
  grow: { flex: 1 },
  displaySettings: { gap: 8 },
  optionRow: { flexDirection: "row", gap: 6 },
  optionButton: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#777",
    borderRadius: 3,
    backgroundColor: "#050505",
  },
  optionButtonSelected: { borderColor: "#fff", backgroundColor: "#fff" },
  optionText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  optionTextSelected: { color: "#000" },
  fileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fileTile: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 3,
    padding: 5,
    backgroundColor: "#090909",
  },
  preview: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#555",
    backgroundColor: "#000",
  },
  previewWide: { aspectRatio: 16 / 9 },
  previewSquare: { aspectRatio: 1 },
  thumbnail: { width: "100%", height: "100%" },
  thumbnailWrap: { width: "100%", height: "100%" },
  videoLabel: {
    position: "absolute",
    top: 8,
    left: 8,
    borderWidth: 1,
    borderColor: "#fff",
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  videoLabelText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  compactName: { fontSize: 9, lineHeight: 12 },
  compactDelete: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#d9202a",
  },
  compactDeleteText: { color: "#fff", fontSize: 14, lineHeight: 18, fontWeight: "900" },
  fileBadge: { alignItems: "center", justifyContent: "center" },
  fileBadgeText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2,
  },
  viewer: { flex: 1, gap: 12, paddingHorizontal: 10, backgroundColor: "#000" },
  viewerMedia: { flex: 1, alignItems: "center", justifyContent: "center" },
  fullMedia: { width: "100%", height: "100%", backgroundColor: "#000" },
});
