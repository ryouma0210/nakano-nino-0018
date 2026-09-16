import { createContext, type PropsWithChildren, useContext, useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { lightTheme } from "@/constants/theme";
import { translateText } from "@/i18n";

type Destination = "home" | "tasks" | "rooms" | "nino-room" | "outside" | "record" | "management" | "mypage";

const destinations = [
  { id: "home", label: "ホーム", accessibilityLabel: "ホーム", icon: "home-outline", href: "/(tabs)" },
  { id: "tasks", label: "タスク", accessibilityLabel: "タスク", icon: "checkbox-outline", href: "/(tabs)/tasks" },
  { id: "rooms", label: "部屋", accessibilityLabel: "廊下", icon: "grid-outline", href: "/(tabs)/rooms" },
  { id: "nino-room", label: "控え室", accessibilityLabel: "二ノ様の控室", icon: "sparkles-outline", href: "/(tabs)/nino-room" },
  { id: "outside", label: "館の外", accessibilityLabel: "館の外", icon: "map-outline", href: "/(tabs)/outside" },
  { id: "record", label: "記録", accessibilityLabel: "記録・交換メニュー", icon: "calendar-outline", href: "/(tabs)/menu?section=record" },
  { id: "management", label: "設定", accessibilityLabel: "管理・設定メニュー", icon: "settings-outline", href: "/(tabs)/menu?section=management" },
  { id: "mypage", label: "マイページ", accessibilityLabel: "マイページ", icon: "person-circle-outline", href: "/(tabs)/mypage" },
] as const;

const roomScreens = new Set(["rooms", "habits", "timer", "preparation", "defeat", "brainwash", "management", "orders", "contract"]);
const recordScreens = new Set(["records", "tribute", "rewards", "collection", "today", "report"]);
const managementScreens = new Set(["loop-audio", "files", "settings", "external-links", "slave-contract"]);
const BottomNavigationVisibleContext = createContext(false);

export function useHasBottomNavigation() {
  return useContext(BottomNavigationVisibleContext);
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const update = () => {
      if (!window.matchMedia("(pointer: coarse)").matches) {
        setVisible(false);
        return;
      }
      const focused = document.activeElement;
      const editing = focused instanceof HTMLTextAreaElement
        || (focused instanceof HTMLInputElement && ["text", "search", "email", "tel", "url", "password", "number"].includes(focused.type))
        || (focused instanceof HTMLElement && focused.isContentEditable);
      setVisible(editing);
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  return visible;
}

function selectedDestination(pathname: string, section: string | undefined): Destination | null {
  const screen = pathname.split("/").filter(Boolean).at(-1) ?? "";
  if (screen === "") return "home";
  if (screen === "tasks" || screen === "nino-room" || screen === "outside" || screen === "mypage") return screen;
  if (screen === "menu") {
    return section === "record" || section === "management" ? section : null;
  }
  if (roomScreens.has(screen)) return "rooms";
  if (recordScreens.has(screen)) return "record";
  if (managementScreens.has(screen)) return "management";
  return null;
}

export function BottomNavigationLayout({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const keyboardVisible = useKeyboardVisible();
  const isOutside = pathname.split("/").filter(Boolean).at(-1) === "outside";
  const showNavigation = !keyboardVisible && !isOutside;
  return (
    <BottomNavigationVisibleContext.Provider value={showNavigation}>
      <View style={styles.layout}>
        <View style={styles.content}>{children}</View>
        {showNavigation ? <BottomNavigation /> : null}
      </View>
    </BottomNavigationVisibleContext.Provider>
  );
}

function BottomNavigation() {
  const { settings, playEffect } = useAppAudio();
  const language = settings?.language ?? "ja";
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ section?: string | string[] }>();
  const section = Array.isArray(params.section) ? params.section[0] : params.section;
  const selected = selectedDestination(pathname, section);

  function navigate(destination: typeof destinations[number]) {
    const targetPath = destination.href.split("?")[0].replace("/(tabs)", "") || "/";
    if (pathname === targetPath && (targetPath !== "/menu" || section === destination.id)) return;
    playEffect("button");
    router.replace(destination.href);
  }

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.footer,
        {
          paddingBottom: Math.max(6, insets.bottom),
          paddingLeft: Math.max(4, insets.left),
          paddingRight: Math.max(4, insets.right),
        },
      ]}
    >
      {destinations.map((destination) => {
        const active = selected === destination.id;
        const label = language !== "ja" && destination.id === "outside" ? "外へ" : destination.label;
        return (
          <Pressable
            key={destination.id}
            accessibilityRole="tab"
            accessibilityLabel={translateText(destination.accessibilityLabel, language)}
            accessibilityState={{ selected: active }}
            onPress={() => navigate(destination)}
            style={({ pressed }) => [styles.item, active && styles.selectedItem, pressed && styles.pressedItem]}
          >
            <Ionicons name={destination.icon} size={21} color={active ? "#ffbad4" : "#c3b7bd"} accessible={false} />
            <AppText
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.9}
              localize={false}
              style={[styles.label, active && styles.selectedLabel]}
            >
              {translateText(label, language)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, backgroundColor: lightTheme.background },
  content: { flex: 1, minHeight: 0 },
  footer: {
    flexDirection: "row",
    flexShrink: 0,
    gap: 1,
    paddingTop: 5,
    backgroundColor: "#110c10",
    borderTopWidth: 1,
    borderTopColor: "#583242",
  },
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 1,
    paddingVertical: 5,
    borderRadius: 8,
    borderTopWidth: 2,
    borderTopColor: "transparent",
  },
  selectedItem: { backgroundColor: "#351322", borderTopColor: "#ef7caa" },
  pressedItem: { backgroundColor: "#482335" },
  label: { width: "100%", minHeight: 28, textAlign: "center", fontSize: 11, lineHeight: 14, fontWeight: "600", color: "#c3b7bd" },
  selectedLabel: { fontWeight: "800", color: "#ffbad4" },
});
