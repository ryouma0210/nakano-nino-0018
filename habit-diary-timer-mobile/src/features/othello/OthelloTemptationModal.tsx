import { useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ImageExpandBadge } from "@/components/ImageExpandBadge";
import { LocalizedPressable } from "@/components/LocalizedPressable";
import { PrimaryButton } from "@/components/PrimaryButton";
import type { TemptationPresentation } from "./temptation";

type Props = {
  presentation: TemptationPresentation;
  coordinate: string;
  invitation: string;
  onClose: () => void;
};

export function OthelloTemptationModal({ presentation, coordinate, invitation, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const image = presentation.image;
  const close = () => { if (expanded) setExpanded(false); else onClose(); };
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={[styles.backdrop, {
        paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(12, insets.bottom),
        paddingLeft: Math.max(12, insets.left), paddingRight: Math.max(12, insets.right),
      }]}>
        <View testID={expanded ? "othello-temptation-image-expanded" : "othello-temptation-intro"}
          accessibilityViewIsModal onAccessibilityEscape={close} style={[styles.dialog, expanded && styles.expanded]}>
          {expanded && image && !imageFailed ? (
            <Image source={image.source} resizeMode="contain" style={styles.fullImage} onError={() => { setImageFailed(true); setExpanded(false); }} />
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
              <View style={styles.heading}>
                <AppText variant="subtitle" accessibilityRole="header">誘惑マス</AppText>
                <AppText localize={false} style={styles.coordinate}>{coordinate}</AppText>
              </View>
              {image && !imageFailed ? (
                <LocalizedPressable testID="othello-temptation-image" accessibilityRole="button" accessibilityLabel="画像を拡大"
                  onPress={() => setExpanded(true)} style={styles.imageButton}>
                  <Image source={image.source} resizeMode="contain" style={styles.image} onError={() => setImageFailed(true)} />
                  <ImageExpandBadge />
                </LocalizedPressable>
              ) : imageFailed ? (
                <View style={styles.placeholder}>
                  <AppText variant="muted">画像を読み込めませんでした。</AppText>
                </View>
              ) : null}
              <AppText>{invitation}</AppText>
            </ScrollView>
          )}
          <View style={styles.footer}>
            <PrimaryButton title="閉じる" tone="secondary" onPress={close} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.9)" },
  dialog: { width: "100%", maxWidth: 640, maxHeight: "100%", borderWidth: 1, borderColor: "#ff91c7", backgroundColor: "#151015" },
  expanded: { flex: 1, maxWidth: 1200 },
  scroll: { flexShrink: 1 },
  content: { padding: 16, gap: 16 },
  heading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  coordinate: { color: "#ffb6dc", fontSize: 20, fontWeight: "800" },
  imageButton: { width: "100%", aspectRatio: 1, maxHeight: 480, backgroundColor: "#080808" },
  image: { width: "100%", height: "100%" },
  fullImage: { flex: 1, width: "100%", minHeight: 0 },
  placeholder: { padding: 16, backgroundColor: "#222", borderWidth: 1, borderColor: "#555" },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: "#555" },
});
