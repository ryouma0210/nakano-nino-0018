import { describe, expect, it } from "vitest";
import { desktopCharacterHeight, desktopConversationWidth, usesDesktopLayout } from "./desktopLayout";

describe("desktop layout sizing", () => {
  it("enables desktop layout only on a wide Web viewport", () => {
    expect(usesDesktopLayout("web", 1023)).toBe(false);
    expect(usesDesktopLayout("web", 1024)).toBe(true);
    expect(usesDesktopLayout("web", 1920)).toBe(true);
    expect(usesDesktopLayout("ios", 1366)).toBe(false);
    expect(usesDesktopLayout("android", 1366)).toBe(false);
    expect(usesDesktopLayout("web", Number.NaN)).toBe(false);
  });

  it("keeps the conversation pane readable without expanding across large monitors", () => {
    expect(desktopConversationWidth(1024)).toBe(300);
    expect(desktopConversationWidth(1440)).toBe(360);
    expect(desktopConversationWidth(3840)).toBe(380);
  });

  it("reserves viewport space for the title, navigation, and dialogue", () => {
    expect(desktopCharacterHeight(720)).toBe(400);
    expect(desktopCharacterHeight(1080)).toBe(560);
    expect(desktopCharacterHeight(400)).toBe(160);
  });
});
