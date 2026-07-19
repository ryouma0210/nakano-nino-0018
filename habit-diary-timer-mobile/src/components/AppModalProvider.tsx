import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { ConfirmModal } from "@/components/ConfirmModal";

type Notice = {
  title: string;
  message: string;
  onClose?: () => void;
};

type AppModalContextValue = {
  showNotice: (title: string, message: string, onClose?: () => void) => void;
};

const AppModalContext = createContext<AppModalContextValue>({
  showNotice: () => {},
});

export function AppModalProvider({ children }: PropsWithChildren) {
  const [notice, setNotice] = useState<Notice | null>(null);

  const showNotice = useCallback(
    (title: string, message: string, onClose?: () => void) => {
      setNotice({ title, message, onClose });
    },
    [],
  );

  const close = useCallback(() => {
    const onClose = notice?.onClose;
    setNotice(null);
    onClose?.();
  }, [notice]);

  const value = useMemo(() => ({ showNotice }), [showNotice]);

  return (
    <AppModalContext.Provider value={value}>
      {children}
      <ConfirmModal
        visible={notice !== null}
        title={notice?.title ?? "お知らせ"}
        message={notice?.message ?? ""}
        confirmLabel="閉じる"
        showCancel={false}
        onCancel={close}
        onConfirm={close}
      />
    </AppModalContext.Provider>
  );
}

export function useAppModal() {
  return useContext(AppModalContext);
}
