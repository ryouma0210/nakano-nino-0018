import { useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { translateText } from "@/i18n";
import type { ActivityCertificatePreview } from "./certificateExport";

export function CertificatePreviewModal({ preview, visible, busy, error, onClose, onIssue, onDismiss }: {
  preview: ActivityCertificatePreview;
  visible: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onIssue: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [zoomed, setZoomed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const width = Math.max(1, Math.min(window.width - Math.max(12, insets.left) - Math.max(12, insets.right), 884) - 26);
  const imageWidth = zoomed ? Math.max(794, width) : width;
  const imageHeight = imageWidth * preview.image.height / preview.image.width;
  return <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent
    onRequestClose={() => { if (!busy) onClose(); }} onDismiss={onDismiss}>
    <View style={[styles.backdrop, {
      paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(12, insets.bottom),
      paddingLeft: Math.max(12, insets.left), paddingRight: Math.max(12, insets.right),
    }]}>
      <View style={styles.dialog} accessibilityViewIsModal testID="certificate-preview-dialog">
        <AppText variant="subtitle">証明書のプレビュー</AppText>
        <AppText variant="muted">保存済みの内容を表示しています。変更する場合は閉じて、各項目を保存してください。</AppText>
        <PrimaryButton title={zoomed ? "全体を表示" : "拡大する"} tone="secondary" disabled={busy}
          testID="certificate-preview-zoom" onPress={() => setZoomed((value) => !value)} />
        <ScrollView style={styles.viewport} contentContainerStyle={styles.verticalContent} testID="certificate-preview-scroll">
          <ScrollView horizontal style={styles.horizontal} contentContainerStyle={styles.horizontalContent}>
            <Image source={{ uri: preview.image.uri }} style={{ width: imageWidth, height: imageHeight }} resizeMode="contain"
              accessibilityLabel={translateText("証明書のプレビュー", preview.language)} testID="certificate-preview-image"
              onError={() => setImageFailed(true)} />
          </ScrollView>
        </ScrollView>
        {error || imageFailed ? <AppText style={styles.error} accessibilityRole="alert">
          {error ?? "画像を読み込めませんでした。"}
        </AppText> : null}
        <View style={styles.actions}>
          <View style={styles.action}><PrimaryButton title="閉じる" tone="secondary" disabled={busy}
            testID="certificate-preview-close" onPress={onClose} /></View>
          <View style={styles.action}><PrimaryButton title={busy ? "発行中..." : "この内容で発行する"} tone="save"
            disabled={busy || imageFailed} testID="certificate-preview-issue" onPress={onIssue} /></View>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.88)" },
  dialog: { width: "100%", maxWidth: 884, height: "100%", minHeight: 0, gap: 12, padding: 12, borderWidth: 1, borderColor: "#fff", backgroundColor: "#080808" },
  viewport: { flex: 1, minHeight: 0, backgroundColor: "#d5d5d5" },
  verticalContent: { flexGrow: 1 },
  horizontal: { flexGrow: 0 },
  horizontalContent: { alignItems: "flex-start" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: { flex: 1, minWidth: 120 },
  error: { color: "#ffb5bd" },
});
