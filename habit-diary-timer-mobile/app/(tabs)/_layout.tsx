import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "ホーム" }} />
      <Tabs.Screen name="menu" options={{ title: "記録・管理メニュー" }} />
      <Tabs.Screen name="habits" options={{ title: "調教部屋" }} />
      <Tabs.Screen name="records" options={{ title: "調教日記部屋" }} />
      <Tabs.Screen name="timer" options={{ title: "お仕置き部屋" }} />
      <Tabs.Screen name="preparation" options={{ title: "準備部屋" }} />
      <Tabs.Screen name="management" options={{ title: "射精管理部屋" }} />
      <Tabs.Screen name="rewards" options={{ title: "ご褒美部屋" }} />
      <Tabs.Screen name="orders" options={{ title: "本日の命令部屋" }} />
      <Tabs.Screen name="collection" options={{ title: "コレクション部屋" }} />
      <Tabs.Screen name="report" options={{ title: "週間報告部屋" }} />
      <Tabs.Screen name="contract" options={{ title: "契約部屋" }} />
      <Tabs.Screen name="files" options={{ title: "ファイル格納部屋" }} />
      <Tabs.Screen name="settings" options={{ title: "設定" }} />
    </Tabs>
  );
}
