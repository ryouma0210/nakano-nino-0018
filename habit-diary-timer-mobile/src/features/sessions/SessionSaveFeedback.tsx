import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";

export function SessionSaveNotice({ onRetry, children }: PropsWithChildren<{ onRetry: () => void }>) {
  return <View style={styles.notice}>
    <AppText accessibilityRole="alert">記録の保存に失敗しました。結果を保持しています。</AppText>
    {children}
    <PrimaryButton title="再保存" onPress={onRetry} />
  </View>;
}

export function PendingResultConfirmation({ visible, onCancel, onConfirm, inline = false }: {
  visible: boolean; onCancel: () => void; onConfirm: () => void; inline?: boolean;
}) {
  return <ConfirmModal visible={visible} inline={inline} title="未保存の結果があります"
    message="未保存の結果は破棄されます。保存せずに移動しますか？" confirmLabel="保存せずに移動"
    confirmTone="danger" onCancel={onCancel} onConfirm={onConfirm} />;
}

const styles = StyleSheet.create({ notice: { gap: 10, padding: 12, borderWidth: 1, borderColor: "#e88895", backgroundColor: "#271219", borderRadius: 6 } });
