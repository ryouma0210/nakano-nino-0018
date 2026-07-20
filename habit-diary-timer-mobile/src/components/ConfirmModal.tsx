import { Modal, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmTone?: "primary" | "danger";
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({ visible, title, message, confirmLabel = "確認", confirmTone = "primary", showCancel = true, onConfirm, onCancel }: Props) {
  const normalizedMessage = message.replace(/\\n/g, "\n");
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <AppText variant="subtitle">{title}</AppText>
          <AppText style={styles.message}>{normalizedMessage}</AppText>
          <View style={styles.actions}>
            {showCancel ? (
              <View style={styles.action}><PrimaryButton title="キャンセル" tone="secondary" onPress={onCancel} /></View>
            ) : null}
            <View style={styles.action}><PrimaryButton title={confirmLabel} tone={confirmTone} onPress={onConfirm} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.88)" },
  dialog: { width: "100%", maxWidth: 420, gap: 18, borderWidth: 1, borderColor: "#fff", padding: 20, backgroundColor: "#080808" },
  message: { color: "#ddd", lineHeight: 24 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
});
