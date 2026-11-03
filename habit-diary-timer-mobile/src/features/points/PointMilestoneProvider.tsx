import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useState } from "react";
import { AppState, Modal, ScrollView, StyleSheet, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppModal } from "@/components/AppModalProvider";
import { pointRepository } from "@/repositories/rewardRepository";
import { pointMilestoneRepository, type PointMilestoneSnapshot } from "@/repositories/pointMilestoneRepository";

type MilestoneContextValue = {
  snapshot: PointMilestoneSnapshot | null;
  error: boolean;
  refresh: () => void;
};

const MilestoneContext = createContext<MilestoneContextValue>({ snapshot: null, error: false, refresh: () => {} });
// Let timed activities and their result dialogs finish before announcing rewards.
const noticeScreens = new Set(["/", "/tasks", "/menu", "/nino-room", "/collection", "/rewards", "/today"]);

export function PointMilestoneProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isNoticeVisible } = useAppModal();
  const [snapshot, setSnapshot] = useState<PointMilestoneSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [acknowledgeError, setAcknowledgeError] = useState(false);
  const [active, setActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");

  const refresh = useCallback(() => {
    try {
      setSnapshot(pointMilestoneRepository.sync());
      setError(false);
      setAcknowledgeError(false);
    } catch {
      // An event read/write failure must never fail the original point award.
      setError(true);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      // Point awards can notify within a transaction. Wait for its commit.
      timer = setTimeout(refresh, 0);
    };
    scheduleRefresh();
    const unsubscribe = pointRepository.subscribe(scheduleRefresh);
    const subscription = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state === "active") scheduleRefresh();
    });
    return () => { clearTimeout(timer); unsubscribe(); subscription.remove(); };
  }, [pathname, refresh]);

  const pending = snapshot?.pending ?? [];
  const visible = active && !error && !isNoticeVisible && noticeScreens.has(pathname) && pending.length > 0;

  function dismiss(openCollection: boolean) {
    try {
      setSnapshot(pointMilestoneRepository.acknowledge(pending.map((item) => item.id)));
      setAcknowledgeError(false);
      if (openCollection && pathname !== "/collection") router.push("/(tabs)/collection");
    } catch {
      setAcknowledgeError(true);
    }
  }

  return <MilestoneContext.Provider value={{ snapshot, error, refresh }}>
    {children}
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => dismiss(false)}>
      <View style={[styles.backdrop, { paddingTop: Math.max(20, insets.top), paddingBottom: Math.max(20, insets.bottom) }]}>
        <View style={styles.dialog} testID="point-milestone-dialog" accessibilityViewIsModal>
          <AppText variant="subtitle" accessibilityRole="header">ポイント達成イベント</AppText>
          <AppText>お祝いメッセージが解放されました！</AppText>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {pending.map((item) => <View key={item.id} style={styles.milestone} testID={`point-milestone-notice-${item.id}`}>
              <AppText variant="label">{item.title}</AppText>
              <AppText>{`累計${item.points.toLocaleString()}Pt達成`}</AppText>
              <AppText>{item.message}</AppText>
            </View>)}
          </ScrollView>
          <AppText variant="muted">解放したメッセージは、コレクションと控え室でいつでも楽しめます。</AppText>
          {acknowledgeError ? <AppText accessibilityRole="alert">確認状態を保存できませんでした。もう一度お試しください。</AppText> : null}
          <PrimaryButton title="コレクションへ" onPress={() => dismiss(true)} testID="point-milestone-collection" />
          <PrimaryButton title="閉じる" tone="secondary" onPress={() => dismiss(false)} testID="point-milestone-close" />
        </View>
      </View>
    </Modal>
  </MilestoneContext.Provider>;
}

export function usePointMilestones() { return useContext(MilestoneContext); }

const styles = StyleSheet.create({
  backdrop: { flex: 1, paddingHorizontal: 20, backgroundColor: "rgba(0,0,0,0.88)", alignItems: "center", justifyContent: "center" },
  dialog: { width: "100%", maxWidth: 480, maxHeight: "100%", minHeight: 0, padding: 18, gap: 14, borderWidth: 1, borderColor: "#f2c94c", backgroundColor: "#101010" },
  scroll: { flexShrink: 1, minHeight: 0 },
  list: { gap: 14 },
  milestone: { gap: 8, padding: 12, backgroundColor: "#262118", borderRadius: 4 },
});
