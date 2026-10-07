import { useCallback } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

/** Daily data also refreshes if this screen stays open overnight or resumes. */
export function useReportRefresh(refresh: () => void) {
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      if (timer) clearTimeout(timer);
      refresh();
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(update, midnight.getTime() - now.getTime() + 100);
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
      else if (timer) clearTimeout(timer);
    });
    update();
    return () => { if (timer) clearTimeout(timer); subscription.remove(); };
  }, [refresh]));
}
