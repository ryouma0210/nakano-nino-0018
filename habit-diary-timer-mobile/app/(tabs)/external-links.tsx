import { Linking, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { roomMessages } from "@/constants/messages";
import { lightTheme } from "@/constants/theme";

const links = [
  {
    label: "X",
    url: "https://x.com/nakanonino_R18?t=U_aek_i01U4jCZMaGyC5YQ&s=09",
  },
  {
    label: "Discord",
    url: "https://discord.gg/GqnzugCBKu",
  },
  {
    label: "Ci-en",
    url: "https://ci-en.dlsite.com/creator/22482",
  },
] as const;

export default function ExternalLinksScreen() {
  const openLink = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppText style={styles.kicker}>EXTERNAL LINKS</AppText>
        <AppText variant="title">外部リンク</AppText>
        <View style={styles.rule} />
      </View>

      <RoomConversation
        characterSource={require("../../assets/characters/settings-nino.png")}
        roomName="外部リンク"
        lines={roomMessages.menu.lines}
        contractLines={roomMessages.menu.contractLines}
      />

      <View style={styles.card}>
        <AppText style={styles.lead}>
          お貢ぎはPayPayかアマギフよ♡{"\n"}以下で送ってね。
        </AppText>
        <View style={styles.contractRow}>
          <View style={styles.linkTextBox}>
            <AppText style={styles.contractLabel}>奴隷契約書　※本物</AppText>
            <AppText style={styles.linkUrl}>
              名前を記入して、APP/WEBどちらでもPDF出力できます。
            </AppText>
          </View>
          <PrimaryButton
            title="開く"
            tone="contract"
            onPress={() => router.push("/(tabs)/slave-contract")}
          />
        </View>
        {links.map((link) => (
          <View key={link.label} style={styles.linkRow}>
            <View style={styles.linkTextBox}>
              <AppText style={styles.linkLabel}>{link.label}</AppText>
              <AppText style={styles.linkUrl}>{link.url}</AppText>
            </View>
            <PrimaryButton title="開く" tone="secondary" onPress={() => openLink(link.url)} />
          </View>
        ))}
      </View>

      <PrimaryButton
        title="管理・設定メニューへ戻る"
        tone="secondary"
        onPress={() => router.push("/(tabs)/menu?section=management")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 10, marginBottom: 4 },
  kicker: {
    color: lightTheme.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    letterSpacing: 6,
  },
  rule: { height: 2, backgroundColor: lightTheme.text, marginTop: 8 },
  card: {
    gap: 14,
    borderWidth: 2,
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    padding: 18,
  },
  lead: {
    color: lightTheme.text,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "900",
  },
  linkRow: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: lightTheme.border,
    paddingTop: 14,
  },
  contractRow: {
    gap: 10,
    borderWidth: 2,
    borderColor: "#8a2be2",
    backgroundColor: "#17041F",
    padding: 14,
  },
  linkTextBox: { gap: 6 },
  contractLabel: {
    color: lightTheme.text,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "900",
  },
  linkLabel: {
    color: lightTheme.danger,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "900",
  },
  linkUrl: {
    color: lightTheme.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
});
