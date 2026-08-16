import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { lightTheme } from "@/constants/theme";
import { roomMessages } from "@/constants/messages";
import { contractService } from "@/services/gameRoomService";

const recordExchangeItems = [
  ["本日の記録", "/(tabs)/today"],
  ["週間報告", "/(tabs)/report"],
  ["調教日記", "/(tabs)/records"],
  ["ご褒美", "/(tabs)/rewards"],
  ["コレクション", "/(tabs)/collection"],
  ["お貢ぎ履歴", "/(tabs)/tribute"],
] as const;

const managementSettingItems = [
  ["ループ音声", "/(tabs)/loop-audio"],
  ["ファイル格納", "/(tabs)/files"],
  ["マイページ", "/(tabs)/mypage"],
  ["設定", "/(tabs)/settings"],
  ["外部リンク", "/(tabs)/external-links"],
] as const;

type MenuTitle =
  | (typeof recordExchangeItems)[number][0]
  | (typeof managementSettingItems)[number][0];

function menuTone(title: MenuTitle) {
  if (title === "設定" || title === "外部リンク") return "secondary";
  if (title === "ご褒美") return "defeat";
  if (title === "マイページ") return "record";
  if (title === "ファイル格納") return "preparation";
  if (title === "お貢ぎ履歴") return "tribute";
  if (title === "ループ音声" || title === "コレクション") return "collection";
  if (title === "本日の記録" || title === "週間報告" || title === "調教日記")
    return "record";
  return "primary";
}

export default function MenuScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const [contractSigned, setContractSigned] = useState(false);
  const section =
    params.section === "record" || params.section === "management"
      ? params.section
      : "all";
  const title =
    section === "record"
      ? "記録・交換メニュー"
      : section === "management"
        ? "管理・設定メニュー"
        : "記録・管理メニュー";
  const kicker =
    section === "record"
      ? "RECORD / EXCHANGE"
      : section === "management"
        ? "MANAGEMENT / SETTINGS"
        : "RECORD / MANAGEMENT";

  useFocusEffect(
    useCallback(() => {
      let active = true;
      contractService.load().then((contract) => {
        if (active) setContractSigned(Boolean(contract.signedAt));
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <AppText style={styles.kicker}>{kicker}</AppText>
        <AppText variant="title">{title}</AppText>
        <View style={styles.rule} />
      </View>
      <RoomConversation
        characterSource={require("../../assets/characters/settings-nino.png")}
        roomName="管理メニュー"
        lines={roomMessages.menu.lines}
        contractLines={roomMessages.menu.contractLines}
      />
      {section !== "management" ? (
        <MenuSection
          title="記録・交換メニュー"
          items={recordExchangeItems}
          contractSigned={contractSigned}
        />
      ) : null}
      {section !== "record" ? (
        <MenuSection
          title="管理・設定メニュー"
          items={managementSettingItems}
          contractSigned={contractSigned}
        />
      ) : null}
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

function MenuSection({
  title,
  items,
  contractSigned,
}: {
  title: string;
  items: readonly (readonly [MenuTitle, string])[];
  contractSigned: boolean;
}) {
  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      <View style={styles.items}>
        {items.map(([itemTitle, href]) => {
          const locked = itemTitle === "ループ音声" && !contractSigned;
          return (
            <PrimaryButton
              key={href}
              title={locked ? "ループ音声　※未開放" : itemTitle}
              disabled={locked}
              tone={menuTone(itemTitle)}
              onPress={() => router.push(href)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 12 },
  kicker: {
    color: lightTheme.danger,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
  },
  rule: { height: 1, backgroundColor: "#fff" },
  section: {
    gap: 10,
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 4,
    padding: 12,
    backgroundColor: "#080808",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  items: { gap: 12 },
});
