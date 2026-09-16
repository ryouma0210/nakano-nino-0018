import { useEffect, useState } from "react";
import { watchCompletionNotice } from "./completionNotice";

export function useCompletionNotice<T extends object>(result: T | null) {
  const [visible, setVisible] = useState<T | null>(null);
  useEffect(() => {
    if (!result) {
      setVisible(null);
      return;
    }
    const stop = watchCompletionNotice(result, () => {
      setVisible((current) => current === result ? null : current);
    });
    setVisible(stop ? result : null);
    return stop ?? undefined;
  }, [result]);
  return result !== null && visible === result;
}
