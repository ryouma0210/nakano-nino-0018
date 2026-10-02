import { useCallback, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import type { Direction } from "./gameLogic";
import { attachOutsideKeyboardControls } from "./keyboardControls";

export function useOutsideKeyboardControls(enabled: boolean, onMove: (direction: Direction) => void, onAdvance?: () => void) {
  const controls = useRef({ enabled, onMove, onAdvance });
  useLayoutEffect(() => {
    controls.current = { enabled, onMove, onAdvance };
  }, [enabled, onMove, onAdvance]);

  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    return attachOutsideKeyboardControls(document, () => controls.current);
  }, []));
}
