import { Component, type ErrorInfo, type PropsWithChildren, useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initializeDatabase } from "@/database/schema";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/AppText";
import { ErrorDetailsScreen } from "@/components/ErrorDetailsScreen";
import { AudioProvider } from "@/audio/AudioProvider";
import { formatError } from "@/utils/error";
import { AppModalProvider } from "@/components/AppModalProvider";
import { appendWebErrorLog } from "@/utils/webErrorLog";

type ErrorHandler = (error: Error, isFatal?: boolean) => void;
type ErrorUtilsApi = { getGlobalHandler?: () => ErrorHandler; setGlobalHandler: (handler: ErrorHandler) => void };

export default function RootLayout() {
  return <AppErrorBoundary><RootContent /></AppErrorBoundary>;
}

function RootContent() {
  const [ready, setReady] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const initialize = useCallback(() => {
    setReady(false);
    setErrorDetails(null);
    try {
      initializeDatabase();
      setReady(true);
    } catch (error) {
      console.error(error);
      setErrorDetails(formatError(error));
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      initialize();
      return undefined;
    }

    const previousConsoleWarn = console.warn;
    const previousConsoleError = console.error;
    console.warn = (...args) => {
      appendWebErrorLog("console.warn", args);
      previousConsoleWarn(...args);
    };
    console.error = (...args) => {
      appendWebErrorLog("console.error", args);
      previousConsoleError(...args);
    };

    const handleError = (event: ErrorEvent) => {
      appendWebErrorLog("window.error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error instanceof Error ? formatError(event.error) : String(event.error),
      });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      appendWebErrorLog("window.unhandledrejection", {
        reason: event.reason instanceof Error ? formatError(event.reason) : String(event.reason),
      });
    };
    if (typeof window !== "undefined") {
      window.addEventListener("error", handleError);
      window.addEventListener("unhandledrejection", handleRejection);
    }

    const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsApi }).ErrorUtils;
    const canUseGlobalErrorHandler = typeof errorUtils?.setGlobalHandler === "function";
    const previousHandler = typeof errorUtils?.getGlobalHandler === "function"
      ? errorUtils.getGlobalHandler()
      : undefined;
    if (canUseGlobalErrorHandler) {
      errorUtils.setGlobalHandler((error, isFatal) => {
        console.error("Global error", { isFatal, error });
        setErrorDetails(`${formatError(error)}\nFATAL: ${Boolean(isFatal)}`);
      });
    }
    initialize();
    return () => {
      console.warn = previousConsoleWarn;
      console.error = previousConsoleError;
      if (typeof window !== "undefined") {
        window.removeEventListener("error", handleError);
        window.removeEventListener("unhandledrejection", handleRejection);
      }
      if (canUseGlobalErrorHandler && previousHandler) errorUtils.setGlobalHandler(previousHandler);
    };
  }, [initialize]);

  if (errorDetails) {
    return <SafeAreaProvider><ErrorDetailsScreen title="起動エラー" details={errorDetails} onRetry={initialize} /></SafeAreaProvider>;
  }

  if (!ready) {
    return <SafeAreaProvider><Screen><AppText>読み込み中...</AppText></Screen></SafeAreaProvider>;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AudioProvider>
          <AppModalProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }} />
          </AppModalProvider>
        </AudioProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

class AppErrorBoundary extends Component<PropsWithChildren, { details: string | null }> {
  state = { details: null };

  static getDerivedStateFromError(error: unknown) {
    return { details: formatError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ details: `${formatError(error)}\nCOMPONENT STACK:\n${info.componentStack ?? "-"}` });
  }

  render() {
    if (this.state.details) {
      return <SafeAreaProvider><ErrorDetailsScreen title="アプリエラー" details={this.state.details} /></SafeAreaProvider>;
    }
    return this.props.children;
  }
}
