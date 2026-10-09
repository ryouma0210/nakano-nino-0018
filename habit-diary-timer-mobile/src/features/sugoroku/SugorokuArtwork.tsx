import { useLayoutEffect, useRef, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, View, type GestureResponderEvent, type ImageSourcePropType, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ImageExpandBadge } from "@/components/ImageExpandBadge";
import { LocalizedPressable as Pressable } from "@/components/LocalizedPressable";
import { getSugorokuImages } from "./images";
import type { SugorokuTile } from "./game";

function ArtworkPlaceholder({ tile, failed = false }: { tile: SugorokuTile; failed?: boolean }) {
  return (
    <View style={styles.placeholder} accessible={false}>
      <View style={styles.track}>
        {Array.from({ length: 12 }, (_, index) => (
          <View key={index} style={[styles.square, index === 9 && styles.activeSquare]} />
        ))}
      </View>
      <View style={styles.emblem}>
        <Ionicons name={tile.kind === "goal" ? "flag-outline" : tile.kind === "stop" ? "hand-left-outline" : "dice-outline"} size={76} color="#dbe9ff" />
      </View>
      <AppText variant="title" style={styles.title}>{tile.label}</AppText>
      <AppText variant="muted">{failed ? "画像を表示できませんでした" : "画像未設定"}</AppText>
    </View>
  );
}

type ArtworkPagerProps = {
  tile: SugorokuTile;
  sources: readonly ImageSourcePropType[];
  selectedIndex: number;
  failedIndices: ReadonlySet<number>;
  onSelect: (index: number) => void;
  onImageError: (index: number) => void;
  onExpand?: () => void;
};

function ArtworkPager({ tile, sources, selectedIndex, failedIndices, onSelect, onImageError, onExpand }: ArtworkPagerProps) {
  const [width, setWidth] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const settledPage = useRef(selectedIndex);
  const alignedWidth = useRef(0);
  const moved = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });

  // Keep both viewers on the selected page, including after a viewport resize.
  // A swipe updates settledPage first so it is never interrupted by this sync.
  useLayoutEffect(() => {
    if (width <= 0 || (settledPage.current === selectedIndex && alignedWidth.current === width)) return;
    settledPage.current = selectedIndex;
    alignedWidth.current = width;
    scroll.current?.scrollTo({ x: selectedIndex * width, y: 0, animated: false });
  }, [selectedIndex, width]);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    moved.current = true;
    if (width <= 0 || Math.abs(event.nativeEvent.layoutMeasurement.width - width) > 1) return;
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.max(0, Math.min(sources.length - 1, Math.round(offset / width)));
    // Wait for the page to settle; intermediate positions are not selections.
    if (Math.abs(offset - index * width) > 1 || settledPage.current === index) return;
    settledPage.current = index;
    onSelect(index);
  }

  function beginPress(event: GestureResponderEvent) {
    moved.current = false;
    touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
  }

  function movePress(event: GestureResponderEvent) {
    if (Math.abs(event.nativeEvent.pageX - touchStart.current.x) > 8
      || Math.abs(event.nativeEvent.pageY - touchStart.current.y) > 8) moved.current = true;
  }

  return (
    <View style={styles.pager}>
      <View style={styles.imageViewport} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <ScrollView
            ref={scroll}
            horizontal
            pagingEnabled
            scrollEnabled={sources.length > 1}
            showsHorizontalScrollIndicator={false}
            bounces={false}
            style={styles.pagerScroll}
            contentContainerStyle={styles.pagerContent}
            scrollEventThrottle={16}
            onScroll={handleScroll}
            onScrollBeginDrag={() => { moved.current = true; }}
            onContentSizeChange={() => scroll.current?.scrollTo({ x: selectedIndex * width, y: 0, animated: false })}
          >
            {sources.map((source, index) => (
              <View
                key={index}
                style={[styles.imagePage, { width }]}
                accessibilityElementsHidden={index !== selectedIndex}
                importantForAccessibility={index === selectedIndex ? "auto" : "no-hide-descendants"}
              >
                {failedIndices.has(index) ? <ArtworkPlaceholder tile={tile} failed /> : onExpand ? (
                  <Pressable
                    style={styles.image}
                    accessibilityRole="button"
                    accessibilityLabel="画像を拡大"
                    disabled={index !== selectedIndex}
                    onPressIn={beginPress}
                    onTouchMove={movePress}
                    onPress={() => { if (!moved.current && index === settledPage.current) onExpand(); }}
                  >
                    <Image source={source} resizeMode="contain" style={styles.image} onError={() => onImageError(index)} accessible={false} />
                    <ImageExpandBadge />
                  </Pressable>
                ) : (
                  <Image source={source} resizeMode="contain" style={styles.image} onError={() => onImageError(index)} accessible={false} />
                )}
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
      {sources.length > 1 ? (
        <View style={styles.pageControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="前の画像"
            disabled={selectedIndex === 0}
            style={[styles.pageButton, selectedIndex === 0 && styles.pageButtonDisabled]}
            onPress={() => onSelect(selectedIndex - 1)}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <AppText style={styles.pageIndicator} localize={false} accessibilityLiveRegion="polite">{`${selectedIndex + 1} / ${sources.length}`}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="次の画像"
            disabled={selectedIndex === sources.length - 1}
            style={[styles.pageButton, selectedIndex === sources.length - 1 && styles.pageButtonDisabled]}
            onPress={() => onSelect(selectedIndex + 1)}
          >
            <Ionicons name="chevron-forward" size={24} color="#fff" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

type ArtworkModalProps = Omit<ArtworkPagerProps, "onExpand"> & {
  visible: boolean;
  onClose: () => void;
};

function ArtworkModal({ visible, onClose, ...pagerProps }: ArtworkModalProps) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        style={[
          styles.fullscreen,
          {
            paddingTop: Math.max(12, insets.top),
            paddingBottom: Math.max(12, insets.bottom),
            paddingLeft: Math.max(12, insets.left),
            paddingRight: Math.max(12, insets.right),
          },
        ]}
      >
        <View style={styles.fullscreenHeader}>
          <AppText variant="subtitle" accessibilityRole="header" style={styles.fullscreenTitle}>{pagerProps.tile.label}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="閉じる"
            style={styles.closeButton}
            onPress={onClose}
          >
            <Ionicons name="close" size={24} color="#fff" />
            <AppText style={styles.controlText}>閉じる</AppText>
          </Pressable>
        </View>
        {pagerProps.sources.length > 0 ? <ArtworkPager {...pagerProps} /> : <ArtworkPlaceholder tile={pagerProps.tile} />}
      </View>
    </Modal>
  );
}

const mapTile: SugorokuTile = { id: "start", label: "マップ", position: 0, kind: "start" };

export function SugorokuMapModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  // Keep the last map page when the player closes and reopens the map.
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [failedIndices, setFailedIndices] = useState<ReadonlySet<number>>(() => new Set());

  function handleImageError(index: number) {
    setFailedIndices((current) => current.has(index) ? current : new Set([...current, index]));
  }

  return (
    <ArtworkModal
      visible={visible}
      onClose={onClose}
      tile={mapTile}
      sources={getSugorokuImages("start")}
      selectedIndex={selectedIndex}
      failedIndices={failedIndices}
      onSelect={setSelectedIndex}
      onImageError={handleImageError}
    />
  );
}

// The parent keys this component by tile ID so selection and failures reset on movement.
export function SugorokuArtwork({ tile }: { tile: SugorokuTile }) {
  const [failedIndices, setFailedIndices] = useState<ReadonlySet<number>>(() => new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const sources = getSugorokuImages(tile.id);

  function handleImageError(index: number) {
    setFailedIndices((current) => current.has(index) ? current : new Set([...current, index]));
  }

  return (
    <>
      <View style={styles.frame}>
        {sources.length > 0 ? (
          <ArtworkPager
            tile={tile}
            sources={sources}
            selectedIndex={selectedIndex}
            failedIndices={failedIndices}
            onSelect={setSelectedIndex}
            onImageError={handleImageError}
            onExpand={() => setExpanded(true)}
          />
        ) : <ArtworkPlaceholder tile={tile} />}
      </View>
      <ArtworkModal
        visible={sources.length > 0 && expanded}
        onClose={() => setExpanded(false)}
        tile={tile}
        sources={sources}
        selectedIndex={selectedIndex}
        failedIndices={failedIndices}
        onSelect={setSelectedIndex}
        onImageError={handleImageError}
      />
    </>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", height: 420, maxHeight: 460, overflow: "hidden", borderRadius: 8, backgroundColor: "#101c2b", borderWidth: 1, borderColor: "#34475e" },
  image: { width: "100%", height: "100%" },
  pager: { flex: 1, minHeight: 0 },
  imageViewport: { flex: 1, minHeight: 0 },
  pagerScroll: { flex: 1 },
  pagerContent: { height: "100%" },
  imagePage: { height: "100%", overflow: "hidden" },
  pageControls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, paddingVertical: 6 },
  pageButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#263c59" },
  pageButtonDisabled: { opacity: 0.35 },
  pageIndicator: { color: "#fff", fontWeight: "700", minWidth: 56, textAlign: "center" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, padding: 24 },
  track: { position: "absolute", width: 264, flexDirection: "row", flexWrap: "wrap", gap: 10, opacity: 0.3, transform: [{ rotate: "-12deg" }] },
  square: { width: 58, height: 80, borderRadius: 8, borderWidth: 1, borderColor: "#b9cde8", backgroundColor: "#263c59" },
  activeSquare: { backgroundColor: "#d7b85b", borderColor: "#f3db91" },
  emblem: { borderWidth: 1, borderColor: "#6685ac", borderRadius: 28, padding: 20, backgroundColor: "#14263e" },
  title: { textAlign: "center", color: "#e7f0ff" },
  controlText: { color: "#fff", fontWeight: "700" },
  fullscreen: { flex: 1, backgroundColor: "#080d14", gap: 12 },
  fullscreenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  fullscreenTitle: { flex: 1, color: "#fff" },
  closeButton: { minHeight: 48, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, backgroundColor: "#263c59" },
});
