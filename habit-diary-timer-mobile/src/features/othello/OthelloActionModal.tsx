import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";

export type OthelloAction = "manual" | "single" | "fast";

type Props = {
  visible: boolean;
  coordinate: string;
  onSelect: (action: OthelloAction) => void;
  onSurrender: () => void;
  onClose: () => void;
};

export function OthelloActionModal({ visible, coordinate, onSelect, onSurrender, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View testID="othello-action-menu" accessibilityViewIsModal onAccessibilityEscape={onClose} style={styles.dialog}>
          <ScrollView contentContainerStyle={styles.content}>
            <AppText variant="subtitle" accessibilityRole="header">次の一手</AppText>
            <View style={styles.target}><AppText>誘惑マス</AppText><AppText localize={false}>{coordinate}</AppText></View>
            <PrimaryButton title="おちんぽ握る♡" tone="defeat" onPress={() => onSelect("manual")} />
            <PrimaryButton title="シコシコする♡" tone="defeat" onPress={() => onSelect("single")} />
            <PrimaryButton title="逝きそう♡" tone="defeat" onPress={() => onSelect("fast")} />
            <PrimaryButton title="対局を終了して降参" tone="danger" onPress={onSurrender} />
            <PrimaryButton title="キャンセル" tone="secondary" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.88)" },
  dialog: { width: "100%", maxWidth: 420, maxHeight: "90%", borderWidth: 1, borderColor: "#ff91c7", backgroundColor: "#151015" },
  content: { padding: 20, gap: 14 },
  target: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
