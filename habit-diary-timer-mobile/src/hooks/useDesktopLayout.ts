import { Platform, useWindowDimensions } from "react-native";
import { usesDesktopLayout } from "@/utils/desktopLayout";

export function useDesktopLayout() {
  const { width, height } = useWindowDimensions();
  return { isDesktop: usesDesktopLayout(Platform.OS, width), width, height };
}
