import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove, type NavigationAction } from "expo-router/react-navigation";
import { attachEnduranceBeforeUnload } from "@/features/endurance/beforeUnload";

/** Keep an unsaved result mounted, including navigation from the shared sidebar. */
export function usePendingResultGuard(pending: boolean, hasPending: () => boolean, discard: () => void) {
  const navigation = useNavigation();
  const [action, setAction] = useState<NavigationAction | null>(null);
  usePreventRemove(pending, ({ data }) => {
    setAction(data.action);
  });
  useEffect(() => attachEnduranceBeforeUnload(Platform.OS, () => !hasPending()), [hasPending]);
  return {
    requested: action !== null,
    cancel: () => setAction(null),
    confirm: () => {
      if (!action) return;
      discard();
      setAction(null);
      // Replay the navigation's original action, which has already visited this guard.
      navigation.dispatch(action);
    },
  };
}
