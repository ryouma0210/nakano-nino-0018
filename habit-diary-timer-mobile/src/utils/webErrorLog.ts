import { Platform } from "react-native";

const LOG_KEY = "nino-room-web-error-log";
const MAX_LOG_LENGTH = 80_000;

type DesktopLogger = {
  writeLog?: (label: string, payload: unknown) => Promise<void>;
};

function serialize(payload: unknown) {
  if (payload instanceof Error) {
    return {
      name: payload.name,
      message: payload.message,
      stack: payload.stack,
    };
  }
  return payload;
}

export function appendWebErrorLog(label: string, payload: unknown) {
  if (Platform.OS !== "web") return;
  const entry = `[${new Date().toISOString()}] ${label}\n${JSON.stringify(serialize(payload), null, 2)}\n\n`;
  try {
    const current = localStorage.getItem(LOG_KEY) ?? "";
    localStorage.setItem(LOG_KEY, (current + entry).slice(-MAX_LOG_LENGTH));
  } catch {
    // ログ保存失敗でアプリは止めない。
  }

  const desktop = (globalThis as typeof globalThis & { ninoDesktop?: DesktopLogger }).ninoDesktop;
  desktop?.writeLog?.(label, serialize(payload)).catch(() => undefined);
}

export function readWebErrorLog() {
  if (Platform.OS !== "web") return "";
  try {
    return localStorage.getItem(LOG_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearWebErrorLog() {
  if (Platform.OS !== "web") return;
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    // noop
  }
}
