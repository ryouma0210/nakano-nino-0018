import { Stack } from "expo-router";

export default function TabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }}>
      <Stack.Screen name="index" options={{ title: "ホーム" }} />
      <Stack.Screen name="rooms" options={{ title: "廊下" }} />
      <Stack.Screen name="nino-room" options={{ title: "二ノ様の控室" }} />
      <Stack.Screen name="outside" options={{ title: "館の外" }} />
      <Stack.Screen name="menu" options={{ title: "記録・管理メニュー" }} />
      <Stack.Screen name="loop-audio" options={{ title: "ループ音声" }} />
      <Stack.Screen name="habits" options={{ title: "調教部屋" }} />
      <Stack.Screen name="records" options={{ title: "調教日記部屋" }} />
      <Stack.Screen name="tribute" options={{ title: "お貢ぎ履歴" }} />
      <Stack.Screen name="timer" options={{ title: "お仕置き部屋" }} />
      <Stack.Screen name="preparation" options={{ title: "準備部屋" }} />
      <Stack.Screen name="defeat" options={{ title: "敗北部屋" }} />
      <Stack.Screen name="brainwash" options={{ title: "洗脳部屋" }} />
      <Stack.Screen name="management" options={{ title: "射精管理部屋" }} />
      <Stack.Screen name="rewards" options={{ title: "ご褒美部屋" }} />
      <Stack.Screen name="mypage" options={{ title: "マイページ" }} />
      <Stack.Screen name="orders" options={{ title: "本日の命令部屋" }} />
      <Stack.Screen name="collection" options={{ title: "コレクション部屋" }} />
      <Stack.Screen name="today" options={{ title: "本日の記録" }} />
      <Stack.Screen name="report" options={{ title: "週間報告部屋" }} />
      <Stack.Screen name="contract" options={{ title: "契約部屋" }} />
      <Stack.Screen name="files" options={{ title: "ファイル格納部屋" }} />
      <Stack.Screen name="settings" options={{ title: "設定" }} />
      <Stack.Screen name="external-links" options={{ title: "外部リンク" }} />
      <Stack.Screen name="slave-contract" options={{ title: "奴隷契約書" }} />
    </Stack>
  );
}
