import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";

export function ErrorDetailsScreen({ title, details, onRetry }: { title: string; details: string; onRetry?: () => void }) {
  return (
    <Screen>
      <AppText variant="title">{title}</AppText>
      <AppText>エラーの詳細をすべて表示しています。調査時はこの内容を共有してください。</AppText>
      <View style={styles.errorBox}>
        <AppText selectable style={styles.errorText}>{details}</AppText>
      </View>
      {onRetry ? <PrimaryButton title="再試行" onPress={onRetry} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorBox: { borderWidth: 1, borderColor: lightTheme.danger, padding: 12, backgroundColor: "#120507" },
  errorText: { color: "#ff9ca2", fontSize: 12, lineHeight: 18, fontFamily: "monospace" },
});
