import { Stack } from "expo-router";
import { useAppAudio } from "@/audio/AudioProvider";
import { translateText } from "@/i18n";

export default function TabLayout() {
  const { settings } = useAppAudio();
  const t = (value: string) => translateText(value, settings?.language ?? "ja");
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }}>
      <Stack.Screen name="index" options={{ title: t("ホーム") }} />
      <Stack.Screen name="rooms" options={{ title: t("廊下") }} />
      <Stack.Screen name="nino-room" options={{ title: t("二ノ様の控室") }} />
      <Stack.Screen name="outside" options={{ title: t("館の外") }} />
      <Stack.Screen name="menu" options={{ title: t("記録・管理メニュー") }} />
      <Stack.Screen name="loop-audio" options={{ title: t("ループ音声") }} />
      <Stack.Screen name="habits" options={{ title: t("調教部屋") }} />
      <Stack.Screen name="records" options={{ title: t("調教日記部屋") }} />
      <Stack.Screen name="tribute" options={{ title: t("お貢ぎ履歴") }} />
      <Stack.Screen name="timer" options={{ title: t("お仕置き部屋") }} />
      <Stack.Screen name="preparation" options={{ title: t("準備部屋") }} />
      <Stack.Screen name="defeat" options={{ title: t("敗北部屋") }} />
      <Stack.Screen name="brainwash" options={{ title: t("洗脳部屋") }} />
      <Stack.Screen name="management" options={{ title: t("射精管理部屋") }} />
      <Stack.Screen name="rewards" options={{ title: t("ご褒美部屋") }} />
      <Stack.Screen name="mypage" options={{ title: t("マイページ") }} />
      <Stack.Screen name="orders" options={{ title: t("本日の命令部屋") }} />
      <Stack.Screen name="collection" options={{ title: t("コレクション部屋") }} />
      <Stack.Screen name="today" options={{ title: t("本日の記録") }} />
      <Stack.Screen name="report" options={{ title: t("週間報告部屋") }} />
      <Stack.Screen name="contract" options={{ title: t("契約部屋") }} />
      <Stack.Screen name="files" options={{ title: t("ファイル格納部屋") }} />
      <Stack.Screen name="settings" options={{ title: t("設定") }} />
      <Stack.Screen name="external-links" options={{ title: t("外部リンク") }} />
      <Stack.Screen name="slave-contract" options={{ title: t("奴隷契約書") }} />
    </Stack>
  );
}
