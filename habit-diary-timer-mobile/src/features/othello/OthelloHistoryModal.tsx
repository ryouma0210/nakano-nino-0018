import { FlatList, Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import type { OthelloHistoryEntry } from "./storage";

type Props = {
  visible: boolean;
  history: readonly OthelloHistoryEntry[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
};

const DIFFICULTY_LABELS = { easy: "イージー", normal: "ノーマル", hard: "ハード" } as const;

export function OthelloHistoryModal({ visible, history, loading, failed, onRetry, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={[
        styles.modal,
        { paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(12, insets.bottom), paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) },
      ]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <AppText variant="subtitle" accessibilityRole="header" style={styles.title}>プレイ履歴</AppText>
            <PrimaryButton title="閉じる" tone="secondary" onPress={onClose} />
          </View>
          <AppText variant="muted">終了したゲームを新しい順に１００件まで保存します。</AppText>
          {loading ? <AppText variant="muted">読み込み中…</AppText> : failed ? (
            <View style={styles.error}>
              <AppText>オセロのプレイ履歴を読み込めませんでした。</AppText>
              <PrimaryButton title="再読み込み" tone="secondary" onPress={onRetry} />
            </View>
          ) : (
            <FlatList
              testID="othello-history"
              style={styles.list}
              data={history.slice(0, 100)}
              keyExtractor={(entry) => entry.id}
              renderItem={({ item }) => {
                const date = new Date(item.completedAt);
                return (
                  <View testID="othello-history-entry" style={styles.entry}>
                    <AppText style={styles.date}>{`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`}</AppText>
                    <AppText style={[styles.result, item.result === "win" ? styles.win : item.result === "loss" ? styles.loss : styles.draw]}>{item.result === "win" ? "あなたの勝ち" : item.result === "loss" ? "私の勝ち" : "引き分け"}</AppText>
                    <View style={styles.row}><AppText variant="muted">二乃様の強さ</AppText><AppText>{DIFFICULTY_LABELS[item.difficulty]}</AppText></View>
                    <View style={styles.row}><AppText>あなた（白）</AppText><AppText localize={false}>{item.humanCount}</AppText></View>
                    <View style={styles.row}><AppText>二乃様（紫）</AppText><AppText localize={false}>{item.cpuCount}</AppText></View>
                    <AppText variant="muted">{item.reason === "surrender" ? "降参" : "対局終了"}</AppText>
                  </View>
                );
              }}
              ListEmptyComponent={<AppText variant="muted">まだプレイ履歴はありません。</AppText>}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: "#080d14" },
  content: { flex: 1, width: "100%", maxWidth: 640, alignSelf: "center", gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  title: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  entry: { paddingVertical: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: "#444" },
  date: { fontWeight: "800" },
  result: { fontSize: 18, lineHeight: 26, fontWeight: "800" },
  win: { color: "#9cde71" },
  loss: { color: "#ff6767" },
  draw: { color: "#ebd384" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  error: { gap: 12 },
});
