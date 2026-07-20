import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { AppText } from "@/components/AppText";
import type { StoredFile } from "@/services/fileStorageService";

const defaultVideos = [
  require("../../assets/videos/timer_1.mp4"),
  require("../../assets/videos/timer_2.mp4"),
];

function randomDefaultIndex(current?: number) {
  const candidates = defaultVideos.map((_, index) => index).filter((index) => index !== current);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
}

function isVideo(file?: StoredFile) {
  return Boolean(file && /\.mp4$/i.test(file.name));
}

export function PunishmentMedia({ active, files, useStored, fullscreen = false }: {
  active: boolean;
  files: StoredFile[];
  useStored: boolean;
  fullscreen?: boolean;
}) {
  const [defaultIndex, setDefaultIndex] = useState(() => randomDefaultIndex());
  const [fileIndex, setFileIndex] = useState(() =>
    files.length > 0 ? Math.floor(Math.random() * files.length) : 0,
  );
  const defaultLoopCount = useRef(0);
  const currentFile = files[fileIndex % Math.max(1, files.length)];
  const showingStoredVideo = useStored && isVideo(currentFile);
  const player = useVideoPlayer(defaultVideos[defaultIndex], (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.volume = 0;
    instance.playbackRate = 1;
  });

  const advance = useCallback(() => {
    if (useStored && files.length > 0) {
      setFileIndex((index) => (index + 1) % files.length);
    } else {
      setDefaultIndex((index) => randomDefaultIndex(index));
    }
  }, [files.length, useStored]);

  useEventListener(player, "playToEnd", () => {
    if (!active) return;
    if (useStored) {
      advance();
      return;
    }
    if (defaultLoopCount.current < 2) {
      defaultLoopCount.current += 1;
      player.replay();
      return;
    }
    defaultLoopCount.current = 0;
    advance();
  });

  useEffect(() => {
    defaultLoopCount.current = 0;
    const source = showingStoredVideo && currentFile
      ? { uri: currentFile.uri }
      : defaultVideos[defaultIndex];
    player.replaceAsync(source).then(() => {
      player.muted = true;
      player.volume = 0;
      player.playbackRate = 1;
      if (active) player.play();
      else {
        player.currentTime = 0.1;
        player.pause();
      }
    }).catch(console.error);
  }, [active, currentFile, defaultIndex, player, showingStoredVideo]);

  useEffect(() => {
    if (!active || !useStored || files.length === 0 || showingStoredVideo) return;
    const timer = setInterval(advance, 10000);
    return () => clearInterval(timer);
  }, [active, advance, files.length, showingStoredVideo, useStored]);

  return (
    <View style={fullscreen ? styles.fullscreenFrame : styles.frame}>
      {useStored && currentFile && !showingStoredVideo ? (
        <Image source={{ uri: currentFile.uri }} style={[styles.media, fullscreen && styles.fullscreenMedia]} resizeMode="contain" />
      ) : (
        <VideoView player={player} style={[styles.media, fullscreen && styles.fullscreenMedia]} nativeControls={false} contentFit="contain" />
      )}
      {!fullscreen ? (
        <View style={styles.badge}>
          <AppText style={styles.badgeText}>
            {useStored
              ? `格納ファイル ${Math.min(fileIndex + 1, files.length)}/${files.length}`
              : `DEFAULT VIDEO ${defaultIndex + 1}/${defaultVideos.length}`}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderWidth: 1, borderColor: "#fff", backgroundColor: "#000" },
  media: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  fullscreenFrame: {
    flex: 1,
    width: "100%",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  fullscreenMedia: {
    width: "100%",
    height: "100%",
    aspectRatio: undefined,
    backgroundColor: "#000",
  },
  badge: { position: "absolute", top: 8, left: 8, borderWidth: 1, borderColor: "#fff", paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "rgba(0,0,0,0.78)" },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
});
