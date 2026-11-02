import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { formatError } from "@/utils/error";

type Notice = {
  title: string;
  message: string;
  onClose?: () => void;
};

type AppModalContextValue = {
  isNoticeVisible: boolean;
  showNotice: (title: string, message: string, onClose?: () => void) => void;
  showError: (title: string, error: unknown, prefix?: string, onClose?: () => void) => void;
};

const AppModalContext = createContext<AppModalContextValue>({
  isNoticeVisible: false,
  showNotice: () => {},
  showError: () => {},
});

export function AppModalProvider({ children }: PropsWithChildren) {
  const [notice, setNotice] = useState<Notice | null>(null);

  const showNotice = useCallback(
    (title: string, message: string, onClose?: () => void) => {
      setNotice({ title, message, onClose });
    },
    [],
  );

  const showError = useCallback(
    (title: string, error: unknown, prefix = "処理中にエラーが発生しました。", onClose?: () => void) => {
      setNotice({
        title,
        message: `${prefix}\n\n${formatError(error)}`,
        onClose,
      });
    },
    [],
  );

  const close = useCallback(() => {
    const onClose = notice?.onClose;
    setNotice(null);
    onClose?.();
  }, [notice]);

  const value = useMemo(() => ({ showNotice, showError, isNoticeVisible: notice !== null }), [showError, showNotice, notice]);

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
