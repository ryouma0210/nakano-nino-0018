import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { lightTheme } from "@/constants/theme";

const iconMap = {
  index: "home-outline",
  habits: "checkbox-outline",
  records: "book-outline",
  timer: "timer-outline",
  settings: "settings-outline",
} as const;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: lightTheme.primary,
        tabBarInactiveTintColor: lightTheme.muted,
        tabBarStyle: {
          minHeight: 64,
          paddingBottom: 8,
          paddingTop: 8,
          borderTopColor: lightTheme.border,
        },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={iconMap[route.name as keyof typeof iconMap]} size={size} color={color} />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: "ホーム" }} />
      <Tabs.Screen name="habits" options={{ title: "習慣の部屋" }} />
      <Tabs.Screen name="records" options={{ title: "日記の部屋" }} />
      <Tabs.Screen name="timer" options={{ title: "集中の部屋" }} />
      <Tabs.Screen name="settings" options={{ title: "準備の部屋" }} />
    </Tabs>
  );
}
