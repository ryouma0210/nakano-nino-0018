/* eslint-disable react-hooks/immutability */
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, PanResponder, Platform, StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { LocalizedPressable as Pressable } from "@/components/LocalizedPressable";
import { createGallerySwipe } from "../files/galleryNavigation";
import type { EnduranceMediaItem } from "./assets";
import type { EnduranceVideoProgress } from "./game";
import { normalizeEnduranceVideoProgress } from "./videoProgress";

export type EnduranceVideoHandle = { getProgress(): EnduranceVideoProgress };

type Props = {
  item: EnduranceMediaItem; active: boolean; onNext?: () => void; onPrevious?: () => void;
  onVideoEnd?: () => void; onVideoProgress?: (progress: EnduranceVideoProgress) => void;
  videoRef?: React.RefObject<EnduranceVideoHandle | null>; onError: () => void;
};

export function EnduranceMedia(props: Props) {
  const { item, active, onError } = props;
  const { setSessionAudioActive } = useAppAudio();
  useEffect(() => {
    if (item.kind !== "video" || !active) return;
    setSessionAudioActive(true);
    return () => setSessionAudioActive(false);
  }, [active, item.kind, setSessionAudioActive]);
  return item.kind === "video" ? <EnduranceVideo key={item.id} {...props} item={item} /> : (
    <MediaFrame {...props} renderMedia={() => <Image source={item.source} resizeMode="contain" style={styles.fill} onError={onError} />} />
  );
}

function MediaFrame({ item, active, onNext, onPrevious, renderMedia, onBeforeResize }: Props & {
  renderMedia: () => React.ReactNode; onBeforeResize?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const wasActive = useRef(active);
  const insets = useSafeAreaInsets();
  const resize = useCallback((next: boolean) => {
    if (expanded === next) return;
    onBeforeResize?.();
    setExpanded(next);
  }, [expanded, onBeforeResize]);
  useEffect(() => {
    if (wasActive.current && !active) resize(false);
    wasActive.current = active;
  }, [active, resize]);
  return (
    <>
      <SwipeArea video={item.kind === "video"} onNext={onNext} onPrevious={onPrevious} style={styles.frame}>
        {expanded ? null : renderMedia()}
      </SwipeArea>
      <PrimaryButton title="拡大" tone="secondary" onPress={() => resize(true)} />
      <Modal visible={expanded} animationType="fade" statusBarTranslucent onRequestClose={() => resize(false)}>
        <View style={[styles.fullscreen, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
          {expanded ? <SwipeArea video={item.kind === "video"} onNext={onNext} onPrevious={onPrevious} style={styles.expandedMedia}>{renderMedia()}</SwipeArea> : null}
          <View style={styles.controls}>
            {onPrevious ? <View style={styles.button}><PrimaryButton title="前へ" tone="secondary" onPress={onPrevious} /></View> : null}
            {onNext ? <View style={styles.button}><PrimaryButton title="次へ" tone="secondary" onPress={onNext} /></View> : null}
            <View style={styles.button}><PrimaryButton title="閉じる" tone="secondary" onPress={() => resize(false)} /></View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SwipeArea({ video, onNext, onPrevious, style, children }: React.PropsWithChildren<{
  video: boolean; onNext?: () => void; onPrevious?: () => void; style: object;
}>) {
  const view = useRef<View>(null);
  const bounds = useRef({ top: Number.NaN, height: 0 });
  const swipe = useMemo(() => createGallerySwipe(), []);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture(event) {
      swipe.start({ touches: event.nativeEvent.touches.length, startY: event.nativeEvent.pageY - bounds.current.top, mediaHeight: bounds.current.height, video });
      return false;
    },
    onMoveShouldSetPanResponderCapture(_event, gesture) { return swipe.move({ ...gesture, touches: gesture.numberActiveTouches }); },
    onPanResponderStart(_event, gesture) { if (gesture.numberActiveTouches !== 1) swipe.cancel(); },
    onPanResponderMove(_event, gesture) { swipe.move({ ...gesture, touches: gesture.numberActiveTouches }); },
    onPanResponderRelease(_event, gesture) { const direction = swipe.release(gesture); if (direction === 1) onNext?.(); else if (direction === -1) onPrevious?.(); },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => swipe.cancel(),
    onPanResponderReject: () => swipe.cancel(),
  }), [onNext, onPrevious, swipe, video]);
  return <View ref={view} style={style} collapsable={false} {...responder.panHandlers}
    onLayout={() => view.current?.measureInWindow((_x, top, _width, height) => { bounds.current = { top, height }; })}>{children}</View>;
}

function EnduranceVideo(props: Omit<Props, "item"> & { item: Extract<EnduranceMediaItem, { kind: "video" }> }) {
  const { item, active, onVideoEnd, onVideoProgress, videoRef, onError } = props;
  const source = item.source;
  const { settings } = useAppAudio();
  const player = useVideoPlayer(source);
  const callbacks = useRef({ onVideoEnd, onVideoProgress, onError });
  const activeRef = useRef(active);
  const lastProgress = useRef<EnduranceVideoProgress>({ positionMs: 0, durationMs: null });
  const restore = useRef<{ progress: EnduranceVideoProgress; playing: boolean; awaitingView: boolean } | null>(null);
  useLayoutEffect(() => {
    callbacks.current = { onVideoEnd, onVideoProgress, onError };
    activeRef.current = active;
  }, [active, onVideoEnd, onVideoProgress, onError]);
  const getProgress = useCallback((): EnduranceVideoProgress => {
    // A web VideoView has no currentTime while it is being moved into/out of the modal.
    if (restore.current) return restore.current.progress;
    try {
      const progress = normalizeEnduranceVideoProgress(player.currentTime, player.duration);
      if (progress.positionMs === lastProgress.current.positionMs && progress.durationMs === lastProgress.current.durationMs) {
        return lastProgress.current;
      }
      lastProgress.current = progress;
      return progress;
    } catch { return lastProgress.current; }
  }, [player]);
  useImperativeHandle(videoRef, () => ({ getProgress }), [getProgress]);
  const restoreView = useCallback(() => {
    const pending = restore.current;
    if (!pending || pending.awaitingView || !(player.duration > 0)) return;
    player.currentTime = pending.progress.positionMs / 1000;
    restore.current = null;
    if (activeRef.current && pending.playing) player.play(); else player.pause();
  }, [player]);
  const publishProgress = useCallback(() => {
    restoreView();
    const progress = getProgress();
    callbacks.current.onVideoProgress?.(progress);
  }, [getProgress, restoreView]);
  const beforeResize = useCallback(() => {
    if (Platform.OS !== "web") return;
    restore.current = { progress: getProgress(), playing: activeRef.current && player.playing, awaitingView: true };
    player.pause();
  }, [getProgress, player]);
  const onSurfaceMount = useCallback(() => {
    if (restore.current) restore.current.awaitingView = false;
    publishProgress();
  }, [publishProgress]);
  useLayoutEffect(() => {
    if (Platform.OS === "web") player.replace(source);
    player.loop = false;
    return () => {
      try {
        player.timeUpdateEventInterval = 0;
        player.pause();
        if (Platform.OS === "web") player.replace(null);
      } catch { /* Already released on native. */ }
    };
  }, [player, source]);
  useEffect(() => {
    player.muted = !settings?.soundEnabled;
    player.volume = settings?.soundVolume ?? 0;
  }, [player, settings?.soundEnabled, settings?.soundVolume]);
  useEffect(() => {
    if (active) player.play(); else player.pause();
  }, [active, player]);
  useEffect(() => {
    const time = player.addListener("timeUpdate", publishProgress);
    const loaded = player.addListener("sourceLoad", publishProgress);
    const end = player.addListener("playToEnd", () => {
      publishProgress();
      if (activeRef.current) callbacks.current.onVideoEnd?.();
    });
    const playing = player.addListener("playingChange", (event) => {
      if (event.isPlaying && !activeRef.current) player.pause();
      publishProgress();
    });
    const status = player.addListener("statusChange", (event) => {
      if (event.status === "error") callbacks.current.onError();
      else if (event.status === "readyToPlay") publishProgress();
    });
    player.timeUpdateEventInterval = 0.25;
    publishProgress();
    return () => {
      time.remove(); loaded.remove(); end.remove(); playing.remove(); status.remove();
      try { player.timeUpdateEventInterval = 0; } catch { /* Already released on native. */ }
    };
  }, [player, publishProgress]);
  return <MediaFrame {...props} onBeforeResize={beforeResize}
    renderMedia={() => <EnduranceVideoSurface player={player} onMount={onSurfaceMount} />} />;
}

function EnduranceVideoSurface({ player, onMount }: { player: VideoPlayer; onMount: () => void }) {
  // The web player's View registers its HTML video in a child effect before this one.
  useEffect(onMount, [onMount]);
  return <VideoView player={player} style={styles.fill} nativeControls contentFit="contain" playsInline />;
}

export function MediaChoice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={label}
    onPress={onPress} style={[styles.choice, selected && styles.selected]}>
    <AppText localize={false} style={styles.choiceText}>{`${selected ? "☑" : "□"} ${label}`}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  frame: { width: "100%", height: 380, backgroundColor: "#000", borderWidth: 1, borderColor: "#888", overflow: "hidden" },
  fill: { width: "100%", height: "100%" }, fullscreen: { flex: 1, backgroundColor: "#000", paddingHorizontal: 12, gap: 12 },
  expandedMedia: { flex: 1, minHeight: 0 }, controls: { flexDirection: "row", gap: 8 }, button: { flex: 1 },
  choice: { padding: 12, minHeight: 44, borderWidth: 1, borderColor: "#888", borderRadius: 4 },
  selected: { borderColor: "#ff69b4", backgroundColor: "#3d1529" }, choiceText: { color: "#fff" },
});
