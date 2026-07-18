import { Component, type ErrorInfo, type PropsWithChildren, useCallback, useEffect, useState } from "react";
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
    const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsApi }).ErrorUtils;
    const previousHandler = errorUtils?.getGlobalHandler?.();
    errorUtils?.setGlobalHandler((error, isFatal) => {
      console.error("Global error", { isFatal, error });
      setErrorDetails(`${formatError(error)}\nFATAL: ${Boolean(isFatal)}`);
    });
    initialize();
    return () => {
      if (previousHandler) errorUtils?.setGlobalHandler(previousHandler);
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
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
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
