import { beforeEach, describe, expect, it, vi } from "vitest";

const { configure } = vi.hoisted(() => ({ configure: vi.fn() }));
vi.mock("expo-audio", () => ({ setAudioModeAsync: configure }));

beforeEach(() => { vi.resetModules(); configure.mockReset().mockResolvedValue(undefined); });

describe("shared background audio session", () => {
  it("finishes the outgoing player's mode change before configuring the incoming player", async () => {
    let finish!: () => void;
    configure.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { setBackgroundAudioMode } = await import("./backgroundAudioMode");
    const old = setBackgroundAudioMode("mixWithOthers");
    const next = setBackgroundAudioMode("doNotMix");
    await Promise.resolve();
    expect(configure).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([old, next]);
    expect(configure.mock.calls.map(([mode]) => mode.interruptionMode)).toEqual(["mixWithOthers", "doNotMix"]);
    expect(configure).toHaveBeenLastCalledWith({ interruptionMode: "doNotMix", playsInSilentMode: true, shouldPlayInBackground: true });
  });

  it("allows a retry after the platform rejects a previous change", async () => {
    configure.mockRejectedValueOnce(new Error("session unavailable"));
    const { setBackgroundAudioMode } = await import("./backgroundAudioMode");
    await expect(setBackgroundAudioMode("doNotMix")).rejects.toThrow("session unavailable");
    await expect(setBackgroundAudioMode("mixWithOthers")).resolves.toBeUndefined();
    expect(configure).toHaveBeenCalledTimes(2);
  });
});
