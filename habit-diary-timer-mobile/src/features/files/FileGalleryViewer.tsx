/* eslint-disable react-hooks/immutability */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Image, Modal, PanResponder, Platform, StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { LocalizedPressable as Pressable } from "@/components/LocalizedPressable";
import type { StoredFile } from "@/services/fileStorageService";
import { displayedFileName, storedFileKey } from "./fileList";
import { adjacentGalleryIndex, createGallerySwipe, type GalleryDirection } from "./galleryNavigation";

type Props = {
  files: readonly StoredFile[];
  selectedKey: string;
  onSelect: (file: StoredFile) => void;
  onClose: () => void;
};

export function FileGalleryViewer({ files, selectedKey, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { setSessionAudioActive } = useAppAudio();
  const index = files.findIndex((file) => storedFileKey(file) === selectedKey);
  const file = files[index];
  const video = Boolean(file && /\.mp4$/i.test(file.name));
  const mediaRef = useRef<View>(null);
  const mediaBounds = useRef({ top: Number.NaN, height: 0 });
  const swipe = useMemo(() => createGallerySwipe(), []);
  useLayoutEffect(() => {
    swipe.cancel();
    return () => swipe.cancel();
  }, [selectedKey, swipe]);
  const navigate = useCallback((direction: GalleryDirection) => {
    const next = adjacentGalleryIndex(index, files.length, direction);
    if (next !== null) onSelect(files[next]);
  }, [files, index, onSelect]);

  useEffect(() => {
    if (!video) return;
    setSessionAudioActive(true);
    return () => setSessionAudioActive(false);
  }, [setSessionAudioActive, video]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey
        || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      const target = event.target;
      // Native media controls and fields keep their own arrow-key behavior.
      if (target instanceof Element && target.closest("input,textarea,select,video,audio,[contenteditable=true],[role=slider]")) return;
      if (document.fullscreenElement?.tagName === "VIDEO") return;
      event.preventDefault();
      navigate(event.key === "ArrowLeft" ? -1 : 1);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [navigate]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture(event) {
      const bounds = mediaBounds.current;
      swipe.start({
        touches: event.nativeEvent.touches.length,
        startY: event.nativeEvent.pageY - bounds.top,
        mediaHeight: bounds.height,
        video,
      });
      return false;
    },
    onMoveShouldSetPanResponderCapture(_event, gesture) {
      return swipe.move({ dx: gesture.dx, dy: gesture.dy, touches: gesture.numberActiveTouches });
    },
    onPanResponderStart(_event, gesture) {
      if (gesture.numberActiveTouches !== 1) swipe.cancel();
    },
    onPanResponderMove(_event, gesture) {
      swipe.move({ dx: gesture.dx, dy: gesture.dy, touches: gesture.numberActiveTouches });
    },
    onPanResponderRelease(_event, gesture) {
      const direction = swipe.release(gesture);
      if (direction !== null) navigate(direction);
    },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => swipe.cancel(),
    onPanResponderReject: () => swipe.cancel(),
  }), [navigate, swipe, video]);

  // A filter change or deletion may remove the selected entry while the modal is open.
  useEffect(() => { if (!file) onClose(); }, [file, onClose]);
  if (!file) return null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.viewer, {
        paddingTop: Math.max(12, insets.top),
        paddingBottom: Math.max(12, insets.bottom),
        paddingLeft: Math.max(12, insets.left),
        paddingRight: Math.max(12, insets.right),
      }]}>
        <View style={styles.header}>
          <View style={styles.caption}>
            <AppText localize={false} numberOfLines={2} style={styles.filename}>{displayedFileName(file)}</AppText>
            <AppText localize={false} accessibilityLiveRegion="polite" style={styles.count}>{`${index + 1} / ${files.length}`}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={onClose} style={styles.closeButton}>
            <AppText style={styles.buttonText}>閉じる</AppText>
          </Pressable>
        </View>
        <View
          ref={mediaRef}
          style={styles.media}
          collapsable={false}
          onLayout={() => {
            swipe.cancel();
            mediaRef.current?.measureInWindow((_x, y, _width, height) => {
              mediaBounds.current = { top: y, height };
            });
          }}
          {...responder.panHandlers}
        >
          {video ? (
            <GalleryVideo key={selectedKey} uri={file.uri} />
          ) : (
            <Image key={selectedKey} source={{ uri: file.uri }} style={styles.fullMedia} resizeMode="contain" />
          )}
        </View>
        <View style={styles.navigation}>
          <NavigationButton title="前へ" disabled={index <= 0} onPress={() => navigate(-1)} />
          <NavigationButton title="次へ" disabled={index >= files.length - 1} onPress={() => navigate(1)} />
        </View>
        {files.length > 1 ? <AppText variant="muted" style={styles.hint}>左右にスワイプして切り替え</AppText> : null}
      </View>
    </Modal>
  );
}

function GalleryVideo({ uri }: { uri: string }) {
  // Only the selected file has a player. Native useVideoPlayer releases it on unmount.
  const player = useVideoPlayer({ uri });
  useLayoutEffect(() => {
    // Restore the source if React re-runs effects after a development cleanup.
    if (Platform.OS === "web") player.replace({ uri });
    player.loop = true;
    player.play();
    return () => {
      try {
        player.pause();
        // Web's hook does not release automatically; discard its source before removal.
        if (Platform.OS === "web") player.replace(null);
      } catch {
        // Native cleanup may already have released the player.
      }
    };
  }, [player, uri]);
  return <VideoView player={player} style={styles.fullMedia} nativeControls contentFit="contain" />;
}

function NavigationButton({ title, disabled, onPress }: { title: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.navigationButton, disabled && styles.disabled]}
    >
      <AppText style={styles.buttonText}>{title}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, minHeight: 0, backgroundColor: "#000", gap: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 0 },
  caption: { flex: 1, minWidth: 0 },
  filename: { color: "#fff", fontSize: 15, fontWeight: "700" },
  count: { color: "#aaa", fontSize: 13 },
  closeButton: { minWidth: 72, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: "#aaa", borderRadius: 4, alignItems: "center", justifyContent: "center" },
  media: { flex: 1, minHeight: 0, overflow: "hidden" },
  fullMedia: { width: "100%", height: "100%" },
  navigation: { flexDirection: "row", gap: 12, flexShrink: 0 },
  navigationButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#aaa", borderRadius: 4 },
  buttonText: { color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.3 },
  hint: { textAlign: "center", flexShrink: 0 },
});
