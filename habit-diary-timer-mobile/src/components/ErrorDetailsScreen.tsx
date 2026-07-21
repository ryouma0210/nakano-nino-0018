import { useState } from "react";
import { StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";

export function ErrorDetailsScreen({ title, details, onRetry }: { title: string; details: string; onRetry?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const summary = details
    .split("\n")
    .slice(0, 8)
    .join("\n");

  async function copyDetails() {
    await Clipboard.setStringAsync(details);
    setCopied(true);
  }

  return (
    <Screen>
      <AppText variant="title">{title}</AppText>
      <AppText>
        エラー概要を表示しています。調査時は詳細をコピーして共有してください。
      </AppText>
      <View style={styles.errorBox}>
        <AppText selectable style={styles.errorText}>
          {expanded ? details : summary}
        </AppText>
      </View>
      <PrimaryButton
        title={expanded ? "詳細を閉じる" : "エラー詳細を表示"}
        onPress={() => setExpanded((current) => !current)}
      />
      <PrimaryButton
        title={copied ? "コピーしました" : "エラー詳細をコピー"}
        tone="secondary"
        onPress={copyDetails}
      />
      {onRetry ? <PrimaryButton title="再試行" onPress={onRetry} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorBox: { borderWidth: 1, borderColor: lightTheme.danger, padding: 12, backgroundColor: "#120507" },
  errorText: { color: "#ff9ca2", fontSize: 12, lineHeight: 18, fontFamily: "monospace" },
});
