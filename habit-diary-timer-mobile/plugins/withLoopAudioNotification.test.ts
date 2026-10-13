import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { patchAudioControlsService } = require("./withLoopAudioNotification.js") as {
  patchAudioControlsService: (source: string, version: string) => string;
};
const packagePath = require.resolve("expo-audio/package.json");
const { version } = JSON.parse(readFileSync(packagePath, "utf8")) as { version: string };
const source = readFileSync(join(dirname(packagePath), "android/src/main/java/expo/modules/audio/service/AudioControlsService.kt"), "utf8");

describe("Android live notification patch", () => {
  it("opts expo-audio into source builds so the patched Kotlin is included instead of the prebuilt AAR", () => {
    const appPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(appPackage.expo.autolinking.android.buildFromSource).toContain("expo-audio");
    const appConfig = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
    expect(appConfig.expo.plugins).toContain("./plugins/withLoopAudioNotification");
  });

  it("applies reproducibly to the installed SDK while preserving the non-live player and actual transport", () => {
    const patched = patchAudioControlsService(source, version);
    expect(patched).toContain("override fun isCurrentMediaItemLive(): Boolean = true");
    expect(patched).toContain("override fun getDuration(): Long = androidx.media3.common.C.TIME_UNSET");
    expect(patched).toContain("override fun getContentDuration(): Long = androidx.media3.common.C.TIME_UNSET");
    expect(patched).toContain("override fun isCurrentMediaItemSeekable(): Boolean = false");
    expect(patched).toContain("override fun isCommandAvailable(command: Int): Boolean = availableCommands.contains(command)");
    expect(patched).toContain(".setUsesChronometer(false)");
    expect(patched).toContain(".setShowWhen(false)");
    expect(patched).toMatch(/if \(!isLive\) \{\s+return player\.ref\s+\}/);
    expect(patched).toContain("ACTION_PAUSE -> currentPlayerRef.pause()");
    expect(patched).not.toContain(".remove(Player.COMMAND_PLAY_PAUSE)");
    expect(patchAudioControlsService(patched, version)).toBe(patched);
  });

  it("preserves either newline convention", () => {
    const lf = source.replace(/\r\n/g, "\n");
    const patched = patchAudioControlsService(lf, version);
    expect(patched).not.toContain("\r");
    expect(patchAudioControlsService(lf.replace(/\n/g, "\r\n"), version)).toBe(patched.replace(/\n/g, "\r\n"));
  });

  it("fails visibly for a changed SDK or incomplete patch instead of silently shipping clip time", () => {
    expect(() => patchAudioControlsService(source, "57.0.5")).toThrow("Review");
    expect(() => patchAudioControlsService("changed service", version)).toThrow("changed");
    const patched = patchAudioControlsService(source, version);
    expect(() => patchAudioControlsService(patched.replace(".setUsesChronometer(false)", ""), version)).toThrow("incomplete");
  });
});
