export const DESKTOP_BREAKPOINT = 1024;
export const DESKTOP_SIDEBAR_WIDTH = 216;
export const DESKTOP_CONTENT_MAX_WIDTH = 1240;

export function usesDesktopLayout(platform: string, width: number) {
  return platform === "web" && Number.isFinite(width) && width >= DESKTOP_BREAKPOINT;
}

export function desktopConversationWidth(windowWidth: number) {
  return Math.min(380, Math.max(300, windowWidth * 0.25));
}

export function desktopCharacterHeight(windowHeight: number) {
  return Math.min(560, Math.max(160, windowHeight - 320));
}
