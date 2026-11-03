import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "./AppText";
import { translateText } from "@/i18n";

const AppToastContext = createContext<{ showErrorToast: (message: string) => void }>({ showErrorToast: () => {} });

export function AppToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const { settings } = useAppAudio();
  const insets = useSafeAreaInsets();
  const language = settings?.language ?? "ja";
  const showErrorToast = useCallback((message: string) => setToast({ message }), []);
  const dismiss = useCallback(() => setToast(null), []);
  const value = useMemo(() => ({ showErrorToast }), [showErrorToast]);
  const message = toast ? translateText(toast.message, language) : "";

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((current) => current === toast ? null : current), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (message && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
  }, [message, toast]);

  return <AppToastContext.Provider value={value}>
    {children}
    {toast ? <View pointerEvents="box-none" style={[styles.position, { top: Math.max(insets.top, 12) + 8 }]}>
      <View style={styles.toast} testID="app-error-toast" accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <AppText localize={false} style={styles.message}>{message}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={translateText("閉じる", language)}
          style={styles.close} onPress={dismiss} testID="app-toast-close">
          <AppText localize={false} style={styles.closeText}>×</AppText>
        </Pressable>
      </View>
    </View> : null}
  </AppToastContext.Provider>;
}

export function useAppToast() { return useContext(AppToastContext); }

const styles = StyleSheet.create({
  position: { position: "absolute", left: 12, right: 12, alignItems: "center", zIndex: 1000 },
  toast: { width: "100%", maxWidth: 720, flexDirection: "row", alignItems: "center", gap: 8,
    paddingLeft: 16, paddingRight: 4, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#ff9292", backgroundColor: "#721e24", elevation: 12 },
  message: { flex: 1, color: "#fff", fontWeight: "700" },
  close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  closeText: { color: "#fff", fontSize: 24 },
});
