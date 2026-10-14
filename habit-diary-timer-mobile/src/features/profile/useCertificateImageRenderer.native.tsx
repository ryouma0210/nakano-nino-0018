import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Modal, PixelRatio, Platform, StyleSheet, Text, View, type TextProps } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { captureRef } from "react-native-view-shot";
import { translateText, type AppLanguage } from "@/i18n";
import { createActivityCertificatePresentation } from "./certificate";
import { certificateCaptureSize, createCertificateCapture, createCertificateDismissal } from "./certificateCapture";
import type { NativeCertificateImageRenderer } from "./certificateExport";

type Capture = ReturnType<typeof createCertificateCapture>;
type RenderJob = {
  id: number;
  content: ReturnType<typeof createActivityCertificatePresentation>;
  language: AppLanguage;
  capture: Capture;
  dismissal: ReturnType<typeof createCertificateDismissal>;
};

export function useCertificateImageRenderer(): { renderImage: NativeCertificateImageRenderer; renderHost: ReactNode } {
  const [job, setJob] = useState<RenderJob | null>(null);
  const [closing, setClosing] = useState(false);
  const active = useRef<RenderJob | null>(null);
  const nextId = useRef(0);
  const mounted = useRef(true);
  const imageView = useRef<View>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.capture.cancel();
      active.current?.dismissal.complete();
      active.current = null;
    };
  }, []);

  const renderImage = useCallback<NativeCertificateImageRenderer>(async (data, language) => {
    if (!mounted.current || active.current) throw new Error("証明書の画像作成を開始できませんでした。");
    const content = createActivityCertificatePresentation(data, language);
    const dismissal = createCertificateDismissal();
    const capture = createCertificateCapture({
      requiresPhoto: content.photoDataUrl !== null,
      afterPaint: () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      capture: async (layout) => {
        if (!imageView.current) throw new Error("証明書の画像作成を開始できませんでした。");
        const uri = await captureRef(imageView.current, {
          format: "png", result: "tmpfile", ...certificateCaptureSize(layout, Platform.OS, PixelRatio.get()),
        });
        return uri.startsWith("file://") ? uri : `file://${uri}`;
      },
      release: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
      onFinish: () => {
        if (mounted.current && Platform.OS === "ios") {
          // Keep the Modal mounted until UIKit confirms it is no longer presented.
          setClosing(true);
        } else {
          if (mounted.current) setJob(null);
          dismissal.complete();
        }
      },
    });
    const next = { id: ++nextId.current, content, language, capture, dismissal };
    active.current = next;
    setClosing(false);
    setJob(next);
    let uri: string | undefined;
    try {
      try { uri = await capture.result; }
      finally { await dismissal.wait(); }
      if (!mounted.current) throw new Error("証明書の画像作成を中断しました。");
      // Export owns a successful temporary file and removes it after saving/sharing.
      return uri;
    } catch (error) {
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(console.warn);
      throw error;
    } finally {
      if (active.current === next) {
        active.current = null;
        if (mounted.current) setJob(null);
      }
    }
  }, []);

  const renderHost = job ? <Modal key={job.id} visible={!closing} animationType="none" statusBarTranslucent navigationBarTranslucent
    onShow={() => job.capture.shown()} onDismiss={() => job.dismissal.complete()} onRequestClose={() => job.capture.cancel()}>
    <View style={styles.host}>
      <View ref={imageView} collapsable={false} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
        onLayout={(event) => job.capture.layoutReady(event.nativeEvent.layout)} style={styles.page}>
        <View style={styles.frame}>
          <CertificateText style={styles.brand}>Nino Room</CertificateText>
          <CertificateText style={styles.title}>{job.content.title}</CertificateText>
          <View style={styles.identity}>
            <View style={styles.identityName}>
              <CertificateText style={styles.detail}>{job.content.nameLabel}</CertificateText>
              <CertificateText style={styles.name}>{job.content.name}</CertificateText>
            </View>
            <View style={styles.identityExtra}>
              <CertificateText style={[styles.detail, styles.identityExtraText]}>{job.content.rightHeaderLabel}</CertificateText>
              <CertificateText style={[styles.name, styles.identityExtraText]}>{job.content.rightHeaderValue}</CertificateText>
            </View>
          </View>
          <View style={styles.photoFrame}>
            {job.content.photoDataUrl ? <Image source={{ uri: job.content.photoDataUrl }} style={styles.photo} resizeMode="contain"
              onLoad={() => job.capture.photoLoaded()} onError={() => job.capture.fail(new Error("画像を読み込めませんでした。"))} />
              : <CertificateText style={styles.photoPlaceholder}>{job.content.photoLabel}</CertificateText>}
          </View>
          <View style={styles.rankings}>
            <View style={styles.rankingColumn}>
              <CertificateText style={styles.sectionTitle}>{job.content.weaknessesLabel}</CertificateText>
              {job.content.weaknesses.length ? job.content.weaknesses.map((weakness, index) => <View key={index} style={styles.favorite}>
                <CertificateText style={styles.rank}>{index + 1}</CertificateText>
                <View style={styles.favoriteText}>
                  <CertificateText style={styles.favoriteName}>{weakness}</CertificateText>
                </View>
              </View>) : <CertificateText style={styles.detail}>{job.content.emptyWeaknessesLabel}</CertificateText>}
            </View>
            <View style={styles.rankingColumn}>
              <CertificateText style={styles.sectionTitle}>{job.content.favoritesLabel}</CertificateText>
              {job.content.favorites.length ? job.content.favorites.map((favorite, index) => <View key={index} style={styles.favorite}>
                <CertificateText style={styles.rank}>{index + 1}</CertificateText>
                <View style={styles.favoriteText}>
                  <CertificateText style={styles.favoriteName}>{favorite.name}</CertificateText>
                  <CertificateText style={styles.detail}>{favorite.detail}</CertificateText>
                </View>
              </View>) : <CertificateText style={styles.detail}>{job.content.emptyFavoritesLabel}</CertificateText>}
            </View>
          </View>
          <View style={styles.metrics}>
            {job.content.metricRows.map((row, index) => <View key={index} style={styles.metricRow}>
              {row.map((metric) => <View key={metric.label} style={styles.metric}>
                <View style={styles.metricLabel}><CertificateText>{metric.label}</CertificateText></View>
                <View style={styles.metricValue}><CertificateText style={styles.metricValueText}>{metric.value}</CertificateText></View>
              </View>)}
            </View>)}
          </View>
          <CertificateText style={styles.issued}>{`${job.content.issuedLabel}: ${job.content.issuedAt}`}</CertificateText>
        </View>
      </View>
      <View style={styles.progress} accessibilityViewIsModal>
        <ActivityIndicator size="large" color="#9d8257" />
        <Text style={styles.progressText}>{translateText("発行中...", job.language)}</Text>
      </View>
    </View>
  </Modal> : null;
  return { renderImage, renderHost };
}

function CertificateText({ style, ...props }: TextProps) {
  return <Text {...props} allowFontScaling={false} style={[styles.text, style]} />;
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: "#fff" },
  page: { position: "absolute", top: 0, left: 0, width: 794, minHeight: 1123, padding: 38, backgroundColor: "#fff" },
  frame: { minHeight: 1047, padding: 30, borderWidth: 2, borderColor: "#7c3aed" },
  text: { color: "#26334b", fontFamily: Platform.OS === "ios" ? "Arial" : "sans-serif", fontSize: 12, lineHeight: 18, includeFontPadding: false },
  brand: { textAlign: "center", color: "#80683f", fontSize: 13, lineHeight: 20, letterSpacing: 3, marginBottom: 8 },
  title: { textAlign: "center", color: "#7c3aed", fontSize: 28, lineHeight: 37, fontWeight: "800", marginBottom: 20 },
  identity: { flexDirection: "row", alignItems: "flex-start", paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: "#d5c8b3" },
  identityName: { width: "50%", minWidth: 0, paddingRight: 23 },
  identityExtra: { width: "50%", minWidth: 0 },
  identityExtraText: { textAlign: "right" },
  detail: { color: "#5f697a", fontSize: 11, lineHeight: 17 },
  name: { fontSize: 24, lineHeight: 36, fontWeight: "700" },
  photoFrame: { width: 216, height: 288, marginVertical: 20, alignSelf: "center", flexShrink: 0, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  photo: { width: "100%", height: "100%" },
  photoPlaceholder: { color: "#6e7582", textAlign: "center" },
  rankings: { flexDirection: "row", gap: 24, alignItems: "flex-start" },
  rankingColumn: { flex: 1, minWidth: 0 },
  sectionTitle: { marginBottom: 8, fontSize: 16, lineHeight: 24, fontWeight: "700" },
  favorite: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#ece8e1" },
  rank: { color: "#80683f", fontSize: 18, lineHeight: 27, minWidth: 19 },
  favoriteText: { flex: 1, minWidth: 0 },
  favoriteName: { fontSize: 15, lineHeight: 23, fontWeight: "700" },
  metrics: { marginTop: 24 },
  metricRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e2e5e9" },
  metric: { width: "50%", minWidth: 0, flexDirection: "row" },
  metricLabel: { width: "55%", minWidth: 0, paddingHorizontal: 8, paddingVertical: 11, backgroundColor: "#f5f6f8", justifyContent: "center" },
  metricValue: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 11, justifyContent: "center" },
  metricValueText: { fontSize: 15, lineHeight: 23, fontWeight: "700", fontVariant: ["tabular-nums"] },
  issued: { marginTop: 26, marginBottom: 8, fontSize: 11, lineHeight: 17 },
  progress: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: 18, backgroundColor: "#fff" },
  progressText: { color: "#26334b", fontSize: 16 },
});
