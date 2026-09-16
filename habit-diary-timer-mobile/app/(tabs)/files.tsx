/* eslint-disable react-hooks/immutability */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Image as NativeImage, Platform, Pressable as NativePressable, StyleSheet, View } from "react-native";
import { LocalizedPressable as Pressable } from "@/components/LocalizedPressable";
import { router, useFocusEffect } from "expo-router";
import {
  createVideoPlayer,
  useVideoPlayer,
  VideoView,
  type VideoThumbnail as GeneratedVideoThumbnail,
} from "expo-video";
import { Image as ExpoImage } from "expo-image";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { TextField } from "@/components/TextField";
import { RoomConversation } from "@/components/RoomConversation";
import { roomMessages } from "@/constants/messages";
import { Screen } from "@/components/Screen";
import { FileGalleryViewer } from "@/features/files/FileGalleryViewer";
import { useCompletionNotice } from "@/features/files/useCompletionNotice";
import { useAppModal } from "@/components/AppModalProvider";
import {
  fileStorageService,
  formatBytes,
  type FileDeleteResult,
  type StoredFile,
} from "@/services/fileStorageService";
import {
  displayedFileName,
  filterAndSortFiles,
  selectedVisibleFiles,
  storedFileKey,
  type FilePurposeFilter,
  type FileSortOrder,
} from "@/features/files/fileList";

export default function FilesScreen() {
  const { showError, showNotice } = useAppModal();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const { importing, progress: importProgress, result: importResult } = useSyncExternalStore(
    fileStorageService.subscribeImports,
    fileStorageService.getImportState,
    fileStorageService.getImportState,
  );
  const { deleting, progress: deleteProgress, result: deleteResult } = useSyncExternalStore(
    fileStorageService.subscribeDeletes,
    fileStorageService.getDeleteState,
    fileStorageService.getDeleteState,
  );
  const maintenance = useSyncExternalStore(
    fileStorageService.subscribeMaintenance,
    fileStorageService.getMaintenanceState,
    fileStorageService.getMaintenanceState,
  );
  const filesBusy = importing || deleting || maintenance.active;
  const showImportNotice = useCompletionNotice(importResult);
  const showDeleteNotice = useCompletionNotice(deleteResult);
  const listLocked = deleting || maintenance.active;
  const focusedRef = useRef(false);
  const [purposeFilter, setPurposeFilter] = useState<FilePurposeFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<FileSortOrder>("newest");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<1 | 2 | 3>(3);
  const [selected, setSelected] = useState<StoredFile | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredFile[] | null>(null);
  const [videoThumbnails, setVideoThumbnails] = useState<
    Record<string, GeneratedVideoThumbnail>
  >({});
  const videoThumbnailsRef = useRef<Record<string, GeneratedVideoThumbnail>>({});
  const loadVersionRef = useRef(0);
  const load = useCallback(async () => {
    const startingMaintenance = fileStorageService.getMaintenanceState();
    if (startingMaintenance.active) return;
    const version = ++loadVersionRef.current;
    const nextFiles = await fileStorageService.list();
    const currentMaintenance = fileStorageService.getMaintenanceState();
    if (currentMaintenance.active || currentMaintenance.revision !== startingMaintenance.revision) return;
    if (focusedRef.current && version === loadVersionRef.current) setFiles(nextFiles);
  }, []);
  const restoreDeleteResult = useCallback((result: FileDeleteResult | null) => {
    if (!result) return;
    const removedKeys = new Set(result.removed.map(storedFileKey));
    setFiles((previous) => previous.filter((file) => !removedKeys.has(storedFileKey(file))));
    setSelectedKeys(new Set(result.failed.map(storedFileKey)));
    setSelectionMode(result.failed.length > 0);
  }, []);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      focusedRef.current = true;
      restoreDeleteResult(fileStorageService.getDeleteState().result);
      load().catch((error) => {
        if (active) showError("ファイルを読み込めませんでした。", error);
      });
      return () => {
        active = false;
        focusedRef.current = false;
        loadVersionRef.current++;
        setSelected(null);
        setPendingDelete(null);
        setSelectedKeys(new Set());
        setSelectionMode(false);
        setFiles([]);
      };
    }, [load, restoreDeleteResult, showError]),
  );

  useEffect(() => {
    if (!importResult || !focusedRef.current) return;
    load().catch((error) => showError("ファイルを読み込めませんでした。", error));
  }, [importResult, load, showError]);

  useEffect(() => {
    if (!deleteResult || deleting || !focusedRef.current) return;
    restoreDeleteResult(deleteResult);
    load().catch((error) => showError("ファイルを読み込めませんでした。", error));
  }, [deleteResult, deleting, load, restoreDeleteResult, showError]);

  useEffect(() => {
    if (maintenance.active) {
      loadVersionRef.current++;
      setSelected(null);
      setPendingDelete(null);
      setSelectedKeys(new Set());
      setSelectionMode(false);
    } else if (maintenance.revision > 0 && focusedRef.current) {
      load().catch((error) => showError("ファイルを読み込めませんでした。", error));
    }
  }, [maintenance, load, showError]);

  useEffect(() => {
    let active = true;
    const generated: Record<string, GeneratedVideoThumbnail> = {};

    async function generateSequentially() {
      if (Platform.OS === "web") return;
      const videos = files.filter((file) => /\.mp4$/i.test(file.name));
      for (const file of videos) {
        if (!active) break;
        const player = createVideoPlayer({ uri: file.uri });
        try {
          const [thumbnail] = await player.generateThumbnailsAsync(0.1, {
            maxWidth: 480,
          });
          if (!thumbnail) continue;
          if (!active) {
            thumbnail.release();
            break;
          }
          generated[file.uri] = thumbnail;
          videoThumbnailsRef.current = { ...generated };
          setVideoThumbnails({ ...generated });
        } catch (error) {
          console.warn(`動画サムネイルを生成できませんでした: ${file.name}`, error);
        } finally {
          player.release();
        }
      }
    }

    generateSequentially();
    return () => {
      active = false;
      Object.values(videoThumbnailsRef.current).forEach((thumbnail) =>
        thumbnail.release(),
      );
      videoThumbnailsRef.current = {};
      setVideoThumbnails({});
    };
  }, [files]);

  async function upload(purpose: "training" | "punishment") {
    if (filesBusy) return;
    try {
      const result = await fileStorageService.pickAndStore(purpose);
      if (!focusedRef.current && result && result.failed.length > 0) {
        showNotice("ファイル格納", [
          `${result.failed.length}件のファイルを格納できませんでした。`,
          "ファイル格納部屋で保存結果を確認できます。",
        ].join("\n"));
      }
    } catch (error) {
      showError("ファイル格納の保存に失敗しました。", error);
    }
  }

  function remove(file: StoredFile) {
    if (!filesBusy) setPendingDelete([file]);
  }

  function toggleSelection(file: StoredFile) {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      const key = storedFileKey(file);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visibleFiles = useMemo(
    () => filterAndSortFiles(files, purposeFilter, search, sort),
    [files, purposeFilter, search, sort],
  );
  const selectedFiles = selectedVisibleFiles(visibleFiles, selectedKeys);
  const allVisibleSelected = visibleFiles.length > 0 && selectedFiles.length === visibleFiles.length;

  async function confirmDelete() {
    if (filesBusy || !pendingDelete) return;
    // Recheck current visibility instead of allowing stale or hidden selections.
    const pendingKeys = new Set(pendingDelete.map(storedFileKey));
    const targets = selectedVisibleFiles(visibleFiles, pendingKeys);
    setPendingDelete(null);
    if (targets.length === 0) return;
    try {
      const result = await fileStorageService.removeMany(targets);
      if (!result) return;
      if (!focusedRef.current && result.failed.length > 0) {
        showNotice("ファイル削除", [
          `${result.removed.length}件のファイルを削除しました。`,
          ...(result.failed.length > 0 ? [
            `${result.failed.length}件のファイルを削除できませんでした。`,
            "ファイル格納部屋で残っているファイルを確認してください。",
          ] : []),
        ].join("\n"));
      }
    } catch (error) {
      showError("ファイルを削除できませんでした。", error);
    }
  }
  const tileWidth = columns === 1 ? "100%" : columns === 2 ? "47.5%" : "31%";

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
          <PrimaryButton title="調教用" disabled={filesBusy} onPress={() => upload("training")} />
        </View>
        <View style={styles.grow}>
          <PrimaryButton title="お仕置き用" disabled={filesBusy} onPress={() => upload("punishment")} />
        </View>
      </View>
      <AppText variant="muted">複数のファイルをまとめて選択できます。</AppText>
      {maintenance.active ? <AppText accessibilityLiveRegion="polite">ファイルを処理中です。完了してからもう一度お試しください。</AppText> : null}
      {importing ? (
        <AppText accessibilityLiveRegion="polite">
          {importProgress ? `格納中：${importProgress.completed}/${importProgress.total}件` : "ファイルを選択してください。"}
        </AppText>
      ) : null}
      {importResult && (showImportNotice || importResult.failed.length > 0) ? (
        <Card>
          {showImportNotice ? <AppText accessibilityLiveRegion="polite">{`${importResult.stored}件のファイルを格納しました。`}</AppText> : null}
          {importResult.failed.length > 0 ? (
            <>
              <AppText>{`${importResult.failed.length}件のファイルを格納できませんでした。`}</AppText>
              <AppText variant="muted">空き容量とファイルへのアクセスを確認し、保存できなかったファイルだけを選び直してください。</AppText>
              {importResult.failed.map((name, index) => <AppText key={index} localize={false}>{name}</AppText>)}
            </>
          ) : null}
        </Card>
      ) : null}
      <AppText variant="muted">
        使用量 {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}
      </AppText>
      <Card style={styles.displaySettings}>
        <TextField
          label="ファイル名で検索"
          placeholder="名前の一部を入力"
          value={search}
          editable={!listLocked}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => {
            setSearch(value);
            setSelectedKeys(new Set());
          }}
        />
        <AppText variant="label">用途で絞り込み</AppText>
        <View style={styles.optionRow}>
          {([
            ["all", "すべて"],
            ["training", "調教用"],
            ["punishment", "お仕置き用"],
          ] as const).map(([value, label]) => (
            <Pressable
              key={value}
              disabled={listLocked}
              accessibilityRole="button"
              accessibilityState={{ selected: purposeFilter === value, disabled: listLocked }}
              onPress={() => {
                setPurposeFilter(value);
                setSelectedKeys(new Set());
              }}
              style={[styles.optionButton, purposeFilter === value && styles.optionButtonSelected]}
            >
              <AppText style={[styles.optionText, purposeFilter === value && styles.optionTextSelected]}>
                {label}
              </AppText>
            </Pressable>
          ))}
        </View>
        <AppText variant="label">並べ替え</AppText>
        <View style={[styles.optionRow, styles.sortOptions]}>
          {([
            ["newest", "追加が新しい順"],
            ["oldest", "追加が古い順"],
            ["name", "名前順"],
            ["size", "サイズが大きい順"],
          ] as const).map(([value, label]) => (
            <Pressable
              key={value}
              disabled={listLocked}
              accessibilityRole="button"
              accessibilityState={{ selected: sort === value, disabled: listLocked }}
              onPress={() => setSort(value)}
              style={[styles.optionButton, styles.sortOption, sort === value && styles.optionButtonSelected]}
            >
              <AppText style={[styles.optionText, sort === value && styles.optionTextSelected]}>{label}</AppText>
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
      <Card style={styles.displaySettings}>
        <AppText>{`表示中：${visibleFiles.length}件`}</AppText>
        <PrimaryButton
          title={selectionMode ? "選択を終了" : "ファイルを選択"}
          tone="secondary"
          disabled={listLocked || (!selectionMode && visibleFiles.length === 0)}
          onPress={() => {
            setSelectionMode((value) => !value);
            setSelectedKeys(new Set());
          }}
        />
        {selectionMode ? (
          <>
            <AppText>{`選択中：${selectedFiles.length}件`}</AppText>
            <AppText variant="muted">検索・用途を変更すると選択を解除します。</AppText>
            <PrimaryButton
              title={allVisibleSelected ? "表示中の選択を解除" : "表示中をすべて選択"}
              tone="secondary"
              disabled={listLocked || visibleFiles.length === 0}
              onPress={() => setSelectedKeys(allVisibleSelected ? new Set() : new Set(visibleFiles.map(storedFileKey)))}
            />
            <PrimaryButton
              title={`選択した${selectedFiles.length}件を削除`}
              tone="danger"
              disabled={filesBusy || selectedFiles.length === 0}
              onPress={() => setPendingDelete(selectedFiles)}
            />
          </>
        ) : null}
        {deleting ? (
          <AppText accessibilityLiveRegion="polite">
            {deleteProgress ? `削除中：${deleteProgress.completed}/${deleteProgress.total}件` : "ファイルを削除中です。"}
          </AppText>
        ) : null}
      </Card>
      {deleteResult && (showDeleteNotice || deleteResult.failed.length > 0) ? (
        <Card style={styles.displaySettings}>
          {showDeleteNotice ? <AppText accessibilityLiveRegion="polite">{`${deleteResult.removed.length}件のファイルを削除しました。`}</AppText> : null}
          {deleteResult.failed.length > 0 ? (
            <>
              <AppText>{`${deleteResult.failed.length}件のファイルを削除できませんでした。`}</AppText>
              <AppText variant="muted">削除できなかったファイルは残しています。選択内容を確認して再試行してください。</AppText>
              {deleteResult.failed.map((file) => <AppText key={storedFileKey(file)} localize={false}>{displayedFileName(file)}</AppText>)}
            </>
          ) : null}
        </Card>
      ) : null}
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
        <View key={storedFileKey(file)} style={[styles.fileTile, { width: tileWidth }, selectionMode && selectedKeys.has(storedFileKey(file)) && styles.fileTileSelected]}>
          <NativePressable
            disabled={listLocked}
            accessibilityRole={selectionMode ? "checkbox" : "button"}
            accessibilityLabel={displayedFileName(file)}
            accessibilityState={selectionMode ? { checked: selectedKeys.has(storedFileKey(file)), disabled: listLocked } : { disabled: listLocked }}
            onPress={() => selectionMode ? toggleSelection(file) : setSelected(file)}
            style={[styles.preview, columns === 1 ? styles.previewWide : styles.previewSquare]}
          >
            {/\.(png|jpe?g|webp|gif)$/i.test(file.name) ? (
              <View style={styles.thumbnailWrap}>
                <NativeImage source={{ uri: file.uri }} style={styles.thumbnail} resizeMode="contain" />
                <FileLabel label={`格納ファイル ${index + 1}/${visibleFiles.length}`} />
              </View>
            ) : /\.mp4$/i.test(file.name) ? (
              <VideoThumbnail
                uri={file.uri}
                thumbnail={videoThumbnails[file.uri]}
                label={`格納ファイル ${index + 1}/${visibleFiles.length}`}
              />
            ) : (
              <View style={styles.fileBadge}>
                <AppText style={styles.fileBadgeText}>
                  FILE
                </AppText>
              </View>
            )}
          </NativePressable>
          {selectionMode ? (
            <NativePressable
              disabled={listLocked}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selectedKeys.has(storedFileKey(file)), disabled: listLocked }}
              accessibilityLabel={displayedFileName(file)}
              onPress={() => toggleSelection(file)}
              style={styles.selectionButton}
            >
              <AppText>{selectedKeys.has(storedFileKey(file)) ? "☑ 選択済み" : "☐ 選択する"}</AppText>
            </NativePressable>
          ) : null}
          <View style={[styles.row, styles.compactRow]}>
            <View style={styles.grow}>
              <AppText localize={false} numberOfLines={1} style={styles.compactName}>
                {displayedFileName(file)}
              </AppText>
            </View>
            {!selectionMode ? <Pressable disabled={filesBusy} accessibilityLabel={`${displayedFileName(file)}を削除`} onPress={() => remove(file)} style={styles.compactDelete}>
              <AppText style={styles.compactDeleteText}>×</AppText>
            </Pressable> : null}
          </View>
        </View>
      ))}
      </View>
      <PrimaryButton
        title="管理・設定メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu?section=management")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
      {selected ? (
        <FileGalleryViewer files={visibleFiles} selectedKey={storedFileKey(selected)} onSelect={setSelected} onClose={() => setSelected(null)} />
      ) : null}
      <ConfirmModal
        visible={pendingDelete !== null}
        title="選択したファイルを削除しますか？"
        message={[
          `選択した${pendingDelete?.length ?? 0}件のファイルを削除します。`,
          ...(pendingDelete?.length === 1 ? [displayedFileName(pendingDelete[0])] : []),
          "削除したファイルは元に戻せません。",
        ].join("\n\n")}
        confirmLabel="削除する"
        confirmTone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
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

function VideoThumbnail({
  uri,
  thumbnail,
  label,
}: {
  uri: string;
  thumbnail?: GeneratedVideoThumbnail;
  label: string;
}) {
  return (
    <View style={styles.thumbnailWrap} pointerEvents="none">
      {Platform.OS === "web" ? (
        <VideoThumbnailPreview uri={uri} />
      ) : thumbnail ? (
        <ExpoImage
          source={thumbnail}
          style={styles.thumbnail}
          contentFit="contain"
        />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailLoading]}>
          <AppText style={styles.thumbnailLoadingText}>読込中</AppText>
        </View>
      )}
      <FileLabel label={label} />
    </View>
  );
}

function VideoThumbnailPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.volume = 0;
    instance.currentTime = 0.1;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      player.muted = true;
      player.volume = 0;
      player.currentTime = 0.1;
      player.play();
      timer = setTimeout(() => {
        try {
          player.pause();
        } catch {
          // プレビュー停止に失敗しても一覧表示は継続する。
        }
      }, 450);
    } catch {
      // WEB環境によっては自動再生できないため、黒背景のままにする。
    }
    return () => {
      if (timer) clearTimeout(timer);
      try {
        player.pause();
      } catch {
        // 画面離脱時に解放済みの場合は無視する。
      }
    };
  }, [player, uri]);

  return (
    <VideoView
      player={player}
      style={styles.thumbnail}
      nativeControls={false}
      contentFit="cover"
    />
  );
}

const styles = StyleSheet.create({
  uploadButtons: { flexDirection: "row", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  compactRow: { gap: 4, paddingTop: 5 },
  grow: { flex: 1 },
  displaySettings: { gap: 8 },
  optionRow: { flexDirection: "row", gap: 6 },
  sortOptions: { flexWrap: "wrap" },
  sortOption: { flexBasis: "45%", paddingHorizontal: 8 },
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
  fileTileSelected: { borderColor: "#f2c94c", backgroundColor: "#24200b" },
  selectionButton: { minHeight: 40, alignItems: "center", justifyContent: "center" },
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
  thumbnailLoading: { alignItems: "center", justifyContent: "center" },
  thumbnailLoadingText: { color: "#888", fontSize: 9, fontWeight: "800" },
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
});

