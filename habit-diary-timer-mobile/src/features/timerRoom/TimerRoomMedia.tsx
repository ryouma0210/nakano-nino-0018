import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { VideoView, type VideoSource } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppVideoPlayer } from "@/audio/useAppVideoPlayer";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Disclosure } from "@/components/Disclosure";
import { LocalizedPressable as Pressable } from "@/components/LocalizedPressable";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextField } from "@/components/TextField";
import {
  displayedFileName,
  filterFilesByName,
  storedFileKey,
} from "@/features/files/fileList";
import {
  fileStorageService,
  type StoredFile,
} from "@/services/fileStorageService";
import {
  DEFAULT_TIMER_ROOM_MEDIA_KEY,
  MAX_TIMER_ROOM_MEDIA,
  TIMER_ROOM_MEDIA_KEY,
  defaultTimerRoomMedia,
  moveTimerRoomMedia,
  parseTimerRoomMedia,
  resolveTimerRoomMedia,
  selectTimerRoomMediaSource,
  timerRoomFiles,
  timerRoomMediaKind,
  type TimerRoomMediaPreferences,
  type TimerRoomMediaSource,
} from "./media";
import {
  moveTimerRoomDefaultVideo,
  timerRoomDefaultVideoIndex,
  type TimerRoomDefaultVideoOverride,
} from "./defaultVideoSelection";

// Explicitly registered, silent test clips. Other files are never auto-loaded.
const DEFAULT_VIDEOS = [
  require("../../../assets/timer-room/default-videos/kannkinn_1.mp4"),
  require("../../../assets/timer-room/default-videos/kannkinn_2.mp4"),
  require("../../../assets/timer-room/default-videos/kannkinn_3.mp4"),
] as const;
const fallbackImage = require("../../../assets/backgrounds/rooms-corridor.png");
const filesFailure = "画像・動画の一覧を読み込めませんでした。";
const preferencesFailure = "画像・動画の設定を読み込めませんでした。";

/** Default clips follow session minutes; stored files only change manually. */
export function TimerRoomMedia({
  active,
  height,
  startedAt,
  now,
  topRightControl,
  onSelectionReadyChange,
  expanded = false,
  renderExpandedLayout,
}: {
  active: boolean;
  height: number;
  startedAt: number | null;
  now: number;
  topRightControl?: ReactNode;
  onSelectionReadyChange?(ready: boolean): void;
  expanded?: boolean;
  renderExpandedLayout?(frame: ReactNode, controls: ReactNode): ReactNode;
}) {
  const [preferences, setPreferences] = useState(defaultTimerRoomMedia);
  const [ready, setReady] = useState(false);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(
    () =>
      AppState.currentState !== "background" &&
      AppState.currentState !== "inactive",
  );
  const [visible, setVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [failedDefaultVideos, setFailedDefaultVideos] = useState<Set<number>>(() => new Set());
  const [defaultOverride, setDefaultOverride] = useState<TimerRoomDefaultVideoOverride | null>(null);
  const mounted = useRef(false);
  const filesRequest = useRef(0);
  const preferencesRequest = useRef(0);
  const savePending = useRef(false);
  const readyCallback = useRef(onSelectionReadyChange);
  readyCallback.current = onSelectionReadyChange;

  const refreshFiles = useCallback(async () => {
    const request = ++filesRequest.current;
    setLoading(true);
    try {
      const result = timerRoomFiles(await fileStorageService.list());
      if (mounted.current && request === filesRequest.current) {
        setFiles(result);
        setFileError(false);
      }
    } catch {
      if (mounted.current && request === filesRequest.current)
        setFileError(true);
    } finally {
      if (mounted.current && request === filesRequest.current)
        setLoading(false);
    }
  }, []);
  const loadPreferences = useCallback(async () => {
    const request = ++preferencesRequest.current;
    setReady(false);
    try {
      const next = parseTimerRoomMedia(
        await AsyncStorage.getItem(TIMER_ROOM_MEDIA_KEY),
      );
      if (mounted.current && request === preferencesRequest.current) {
        setPreferences(next);
        setPreferencesError(null);
      }
    } catch {
      if (mounted.current && request === preferencesRequest.current)
        setPreferencesError(preferencesFailure);
    } finally {
      if (mounted.current && request === preferencesRequest.current)
        setReady(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadPreferences();
    const unsubscribers = [
      fileStorageService.subscribeImports(() => {
        if (!fileStorageService.getImportState().importing) void refreshFiles();
      }),
      fileStorageService.subscribeDeletes(() => {
        if (!fileStorageService.getDeleteState().deleting) void refreshFiles();
      }),
      fileStorageService.subscribeMaintenance(() => {
        if (!fileStorageService.getMaintenanceState().active)
          void refreshFiles();
      }),
    ];
    return () => {
      mounted.current = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadPreferences, refreshFiles]);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void refreshFiles();
      return () => {
        setFocused(false);
        setPicker(false);
      };
    }, [refreshFiles]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
      if (state === "active") void refreshFiles();
    });
    const onVisibility = () => {
      setVisible(document.visibilityState !== "hidden");
      if (document.visibilityState !== "hidden") void refreshFiles();
    };
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", onVisibility);
    return () => {
      subscription.remove();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshFiles]);

  async function savePreferences(next: TimerRoomMediaPreferences) {
    if (savePending.current || !ready) return false;
    savePending.current = true;
    setSaving(true);
    try {
      const valid = parseTimerRoomMedia(JSON.stringify(next));
      await AsyncStorage.setItem(TIMER_ROOM_MEDIA_KEY, JSON.stringify(valid));
      if (mounted.current) {
        setPreferences(valid);
        setPreferencesError(null);
        setFailedKey(null);
      }
      return true;
    } catch {
      if (mounted.current)
        setPreferencesError(
          "画像・動画の設定を保存できませんでした。もう一度お試しください。",
        );
      return false;
    } finally {
      savePending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const resolved = useMemo(
    () => resolveTimerRoomMedia(preferences, files),
    [files, preferences],
  );
  const current = resolved.current;
  const usingDefault = preferences.source === "default";
  const defaultIndex = timerRoomDefaultVideoIndex(startedAt, now, defaultOverride);
  const defaultFailed = usingDefault && failedDefaultVideos.has(defaultIndex);
  const showFallback =
    current.key === DEFAULT_TIMER_ROOM_MEDIA_KEY || failedKey === current.key;
  const storedVideoSource = useMemo(() => current.uri ? { uri: current.uri } : null, [current.uri]);
  const video = !showFallback && current.kind === "video";
  const mediaActive = active && focused && foreground && visible && !picker;
  const blocked = !ready || loading || saving;
  const index = resolved.items.findIndex((item) => item.key === current.key);
  const selectionReady =
    ready &&
    !saving &&
    (preferences.source === "default" ||
      (!loading && !fileError && !showFallback && !resolved.missing));
  useEffect(() => {
    readyCallback.current?.(selectionReady);
  }, [selectionReady]);
  const retry = () => {
    setFailedKey(null);
    setFailedDefaultVideos(new Set());
    void loadPreferences();
    void refreshFiles();
  };
  function moveMedia(direction: -1 | 1) {
    if (usingDefault) {
      if (startedAt !== null) setDefaultOverride(moveTimerRoomDefaultVideo(startedAt, now, defaultIndex, direction));
      return;
    }
    void savePreferences(moveTimerRoomMedia(preferences, resolved.items, current.key, direction));
  }
  async function selectSource(source: TimerRoomMediaSource) {
    if (source === preferences.source) return;
    if (
      await savePreferences(selectTimerRoomMediaSource(preferences, source))
    ) {
      if (
        source === "files" &&
        !files.some((file) =>
          preferences.selectedKeys.includes(storedFileKey(file)),
        )
      )
        setPicker(true);
    }
  }
  const frame = (
      <View
        style={[
          styles.frame,
          expanded ? styles.expandedFrame : { height: Math.max(160, height) },
        ]}
        testID="timer-room-media-frame"
      >
        {usingDefault && !defaultFailed ? (
          <LoopingVideo
            key={`default-video-${defaultIndex}`}
            source={DEFAULT_VIDEOS[defaultIndex]}
            active={mediaActive}
            onError={() => setFailedDefaultVideos((previous) => previous.has(defaultIndex) ? previous : new Set(previous).add(defaultIndex))}
          />
        ) : usingDefault || showFallback ? (
          <Image source={fallbackImage} resizeMode="contain" style={styles.fill} testID="timer-room-image" />
        ) : video && storedVideoSource ? (
          <LoopingVideo
            key={`${current.key}:${current.uri}`}
            source={storedVideoSource}
            active={mediaActive}
            onError={() => setFailedKey(current.key)}
          />
        ) : (
          <Image
            key={current.key}
            source={{ uri: current.uri }}
            resizeMode="contain"
            style={styles.fill}
            onError={() => setFailedKey(current.key)}
            testID="timer-room-image"
          />
        )}
        {topRightControl ? (
          <View pointerEvents="box-none" style={styles.topRightControl}>
            {topRightControl}
          </View>
        ) : null}
      </View>
  );
  const controls = (
    <View style={[styles.mediaControls, expanded && styles.expandedMediaControls]} testID="timer-room-media-controls">
      {!usingDefault ? <View style={styles.caption}>
          <AppText
            localize={showFallback}
            numberOfLines={expanded ? 1 : 2}
            style={styles.name}
            testID="timer-room-media-name"
          >
            {showFallback ? "デフォルト画像" : current.label}
          </AppText>
          <AppText
            localize={false}
            variant="muted"
            testID="timer-room-media-count"
          >{`${index + 1} / ${resolved.items.length}`}</AppText>
      </View> : null}
      {defaultFailed ? (
        <AppText variant="muted" numberOfLines={expanded ? 1 : undefined} testID="timer-room-media-fallback">
          デフォルト動画を再生できないため、代替の画像を表示しています。
        </AppText>
      ) : null}
      {!usingDefault && (resolved.missing || failedKey === current.key) && !loading ? (
        <AppText
          variant="muted"
          numberOfLines={expanded ? 1 : undefined}
          testID="timer-room-media-fallback"
        >
          選択したファイルを読み込めないため、デフォルト画像を表示しています。
        </AppText>
      ) : null}
      {fileError ? (
        <AppText
          accessibilityRole="alert"
          numberOfLines={expanded ? 1 : undefined}
        >
          {filesFailure}
        </AppText>
      ) : null}
      {preferencesError ? (
        <AppText
          accessibilityRole="alert"
          numberOfLines={expanded ? 1 : undefined}
        >
          {preferencesError}
        </AppText>
      ) : null}
      {fileError || preferencesError || defaultFailed || failedKey === current.key ? (
        <PrimaryButton
          title="再試行"
          tone="secondary"
          disabled={saving || loading}
          onPress={retry}
          testID="timer-room-media-retry"
        />
      ) : null}
      {preferences.source === "files" || startedAt !== null ? (
        <>
          <View style={styles.row}>
            <View style={styles.button}>
              <PrimaryButton
                title="前へ"
                tone="secondary"
                disabled={usingDefault ? !ready || saving : blocked || resolved.items.length < 2}
                onPress={() => moveMedia(-1)}
                testID="timer-room-media-previous"
              />
            </View>
            <View style={styles.button}>
              <PrimaryButton
                title="次へ"
                tone="secondary"
                disabled={usingDefault ? !ready || saving : blocked || resolved.items.length < 2}
                onPress={() => moveMedia(1)}
                testID="timer-room-media-next"
              />
            </View>
          </View>
          {!expanded && !usingDefault ? (
            <PrimaryButton
              title="画像・動画を選ぶ"
              tone="secondary"
              disabled={!ready || saving}
              onPress={() => setPicker(true)}
              testID="timer-room-media-select"
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
  return (
    <View
      style={[styles.section, expanded && styles.expandedSection]}
      testID="timer-room-media"
    >
      {!expanded ? (
        <View testID="timer-room-media-source-card">
          <Card>
            <AppText variant="subtitle">表示するファイル</AppText>
            <View style={styles.sourceChoices}>
              <View style={styles.button}>
                <PrimaryButton
                  title={`デフォルト動画 (${DEFAULT_VIDEOS.length})`}
                  tone={
                    preferences.source === "default" ? "primary" : "secondary"
                  }
                  disabled={!ready || saving}
                  onPress={() => void selectSource("default")}
                  testID="timer-room-media-source-default"
                />
              </View>
              <View style={styles.button}>
                <PrimaryButton
                  title={`格納ファイル (${files.length})`}
                  tone={
                    preferences.source === "files" ? "primary" : "secondary"
                  }
                  disabled={!ready || saving}
                  onPress={() => void selectSource("files")}
                  testID="timer-room-media-source-files"
                />
              </View>
            </View>
            <AppText variant="muted">
              【デフォルト動画】または【格納ファイル】どちらか選択してください。
            </AppText>
            {preferences.source === "files" ? (
              <AppText variant="muted">
                ファイル格納で「監禁用」に設定した画像・動画を選べます。
              </AppText>
            ) : null}
          </Card>
        </View>
      ) : null}
      {expanded && renderExpandedLayout ? renderExpandedLayout(frame, controls) : <>{frame}{controls}</>}
      <MediaPicker
        visible={picker}
        files={files}
        preferences={preferences}
        loading={loading}
        fileError={fileError}
        saving={saving}
        saveError={preferencesError}
        onRetry={() => void refreshFiles()}
        onClose={() => {
          if (!savePending.current) setPicker(false);
        }}
        onSave={async (selectedKeys) => {
          const next = {
            version: 2 as const,
            source: "files" as const,
            selectedKeys,
            currentKey:
              preferences.currentKey &&
              selectedKeys.includes(preferences.currentKey)
                ? preferences.currentKey
                : selectedKeys[0],
          };
          if (await savePreferences(next)) setPicker(false);
        }}
      />
    </View>
  );
}

function LoopingVideo({
  source,
  active,
  onError,
}: {
  source: VideoSource;
  active: boolean;
  onError(): void;
}) {
  const player = useAppVideoPlayer(source, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.volume = 0;
  });
  const activeRef = useRef(active);
  const errorRef = useRef(onError);
  activeRef.current = active;
  errorRef.current = onError;
  useEffect(() => {
    const status = player.addListener("statusChange", ({ status }) => {
      if (status === "error") errorRef.current();
    });
    const playing = player.addListener("playingChange", ({ isPlaying }) => {
      if (isPlaying && !activeRef.current) player.pause();
    });
    return () => {
      status.remove();
      playing.remove();
    };
  }, [player]);
  useEffect(() => {
    if (active) player.play();
    else player.pause();
    return () => {
      try {
        player.pause();
      } catch {
        /* Already released on native. */
      }
    };
  }, [active, player]);
  return (
    <View style={styles.fill} testID="timer-room-video">
      <VideoView
        player={player}
        style={styles.fill}
        contentFit="contain"
        nativeControls={false}
        playsInline
        surfaceType="textureView"
      />
    </View>
  );
}

type PickerProps = {
  visible: boolean;
  files: StoredFile[];
  preferences: TimerRoomMediaPreferences;
  loading: boolean;
  fileError: boolean;
  saving: boolean;
  saveError: string | null;
  onRetry(): void;
  onClose(): void;
  onSave(keys: string[]): Promise<void>;
};
function MediaPicker(props: PickerProps) {
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      onRequestClose={() => {
        if (!props.saving) props.onClose();
      }}
    >
      {props.visible ? <MediaPickerContents {...props} /> : null}
    </Modal>
  );
}

function MediaPickerContents({
  files,
  preferences,
  loading,
  fileError,
  saving,
  saveError,
  onRetry,
  onClose,
  onSave,
}: PickerProps) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const availableKeys = useMemo(
    () => new Set(files.map(storedFileKey)),
    [files],
  );
  // Keep saved choices while the asynchronous file list is still loading.
  const [selected, setSelected] = useState(() => [...preferences.selectedKeys]);
  const choices = useMemo(
    () => filterFilesByName(files, search),
    [files, search],
  );
  const toggle = (key: string) =>
    setSelected((previous) => {
      const current = previous.filter((item) => availableKeys.has(item));
      return current.includes(key)
        ? current.filter((item) => item !== key)
        : current.length < MAX_TIMER_ROOM_MEDIA
          ? [...current, key]
          : current;
    });
  const validSelected = selected.filter((key) => availableKeys.has(key));
  return (
    <View
      style={[
        styles.dialog,
        {
          paddingTop: Math.max(16, insets.top),
          paddingBottom: Math.max(16, insets.bottom),
        },
      ]}
      testID="timer-room-media-dialog"
      accessibilityViewIsModal
    >
      <AppText variant="title">画像・動画を選ぶ</AppText>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={choices}
        numColumns={3}
        columnWrapperStyle={styles.fileRow}
        keyExtractor={storedFileKey}
        keyboardShouldPersistTaps="handled"
        extraData={validSelected}
        ListHeaderComponent={
          <View style={styles.section}>
            <AppText variant="muted">
              選んだ順に「前へ」「次へ」で切り替えます。画像・動画は自動で切り替わりません。
            </AppText>
            <AppText variant="muted">最大100件まで選択できます。</AppText>
            <Disclosure
              title="検索"
              active={search.trim().length > 0}
              testID="timer-room-media-search-toggle"
            >
              <TextField
                label="ファイル名で検索"
                placeholder="名前の一部を入力"
                value={search}
                onChangeText={setSearch}
                editable={!saving}
                testID="timer-room-media-search"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Disclosure>
            <AppText testID="timer-room-media-selected-count">{`選択中：${validSelected.length}件`}</AppText>
            {loading ? <AppText variant="muted">読み込み中…</AppText> : null}
            {fileError ? (
              <>
                <AppText accessibilityRole="alert">{filesFailure}</AppText>
                <PrimaryButton
                  title="再試行"
                  tone="secondary"
                  onPress={onRetry}
                  disabled={loading || saving}
                />
              </>
            ) : null}
            {!loading && !fileError && files.length === 0 ? (
              <AppText variant="muted">
                監禁用の画像・動画がありません。ファイル格納で用途を追加してください。
              </AppText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !fileError && files.length > 0 ? (
            <AppText variant="muted">該当するファイルはありません。</AppText>
          ) : null
        }
        renderItem={({ item }) => {
          const key = storedFileKey(item);
          const checked = selected.includes(key);
          const disabled =
            saving ||
            (!checked && validSelected.length >= MAX_TIMER_ROOM_MEDIA);
          const label = displayedFileName(item);
          return (
            <View style={styles.fileCell}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked, disabled }}
                aria-checked={checked}
                aria-disabled={disabled}
                disabled={disabled}
                onPress={() => toggle(key)}
                testID={`timer-room-media-choice-${key}`}
                style={[
                  styles.tile,
                  checked && styles.selected,
                  disabled && styles.disabled,
                ]}
              >
                <View style={styles.thumbnail} pointerEvents="none">
                  {timerRoomMediaKind(item.name) === "video" ? (
                    <AppText variant="muted">動画</AppText>
                  ) : (
                    <Image
                      source={{ uri: item.uri }}
                      style={styles.fill}
                      resizeMode="contain"
                    />
                  )}
                  <AppText localize={false} style={styles.check}>
                    {checked ? "☑" : "□"}
                  </AppText>
                </View>
                <AppText
                  numberOfLines={2}
                  localize={false}
                  style={styles.tileName}
                >
                  {label}
                </AppText>
              </Pressable>
            </View>
          );
        }}
      />
      {saveError ? (
        <AppText accessibilityRole="alert">{saveError}</AppText>
      ) : null}
      <PrimaryButton
        title="選択完了"
        tone="save"
        disabled={saving || loading || fileError || validSelected.length === 0}
        onPress={() => void onSave(validSelected)}
        testID="timer-room-media-done"
      />
      <PrimaryButton
        title="キャンセル"
        tone="secondary"
        disabled={saving}
        onPress={onClose}
        testID="timer-room-media-cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, minWidth: 0 },
  frame: {
    position: "relative",
    width: "100%",
    backgroundColor: "#000",
    overflow: "hidden",
  },
  expandedSection: { flex: 1, minHeight: 0, gap: 6 },
  expandedFrame: { flex: 1, minHeight: 0 },
  mediaControls: { gap: 10, minWidth: 0, flexShrink: 0 },
  expandedMediaControls: { gap: 6 },
  topRightControl: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 20,
    elevation: 10,
  },
  fill: { width: "100%", height: "100%" },
  caption: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", gap: 10 },
  button: { flex: 1 },
  dialog: {
    flex: 1,
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: "#080808",
  },
  sourceChoices: { flexDirection: "row", gap: 8 },
  list: { flex: 1 },
  listContent: { gap: 10, paddingBottom: 10 },
  fileRow: { marginHorizontal: -4 },
  fileCell: { width: "33.333333%", paddingHorizontal: 4 },
  tile: {
    borderWidth: 1,
    borderColor: "#66727c",
    borderRadius: 4,
    padding: 5,
    gap: 5,
    backgroundColor: "#121820",
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  check: {
    position: "absolute",
    right: 3,
    top: 0,
    fontSize: 21,
    color: "#fff",
    backgroundColor: "#152435",
  },
  tileName: { fontSize: 12, lineHeight: 17, minHeight: 34 },
  selected: { borderColor: "#a6d5ff", backgroundColor: "#194770" },
  disabled: { opacity: 0.45 },
});
