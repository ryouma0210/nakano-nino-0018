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
import { Screen } from "@/components/Screen";
import {
  fileStorageService,
  formatBytes,
  type StoredFile,
} from "@/services/fileStorageService";

export default function FilesScreen() {
  const [files, setFiles] = useState<StoredFile[]>([]);
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

  return (
    <Screen>
      <AppText variant="title">ファイル格納部屋</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/files-nino.png")}
        roomName="ファイル格納部屋"
        lines={[
          { text: "残しておきたいファイルは、ここへ格納して。" },
          { text: "不要になったものは選んで削除できるわ。" },
        ]}
        contractLines={[
          { text: "奴隷好みのオカズを全部ここに入れなさい♡私に弱点晒せ♡" },
        ]}
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
      {files.length === 0 ? (
        <Card>
          <AppText variant="muted">格納されたファイルはありません。</AppText>
        </Card>
      ) : null}
      {files.map((file) => (
        <Card key={file.uri}>
          <Pressable onPress={() => setSelected(file)} style={styles.preview}>
            {/\.(png|jpe?g|webp|gif)$/i.test(file.name) ? (
              <Image
                source={{ uri: file.uri }}
                style={styles.thumbnail}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.fileBadge}>
                <AppText style={styles.fileBadgeText}>
                  {/\.mp4$/i.test(file.name) ? "▶ VIDEO" : "FILE"}
                </AppText>
              </View>
            )}
          </Pressable>
          <View style={styles.row}>
            <View style={styles.grow}>
              <AppText>{file.name}</AppText>
              <AppText variant="muted">{formatBytes(file.size)}</AppText>
              <AppText variant="muted">
                用途：{file.purpose === "training" ? "調教部屋" : "お仕置き部屋"}
              </AppText>
            </View>
            <PrimaryButton
              title="削除"
              tone="danger"
              onPress={() => remove(file)}
            />
          </View>
        </Card>
      ))}
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
  grow: { flex: 1 },
  preview: {
    width: "100%",
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#555",
    backgroundColor: "#000",
  },
  thumbnail: { width: "100%", height: "100%" },
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
