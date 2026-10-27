import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { patchVoicePlaylistSources, voicePlaylistPatchFiles } = require("./withVoicePlaylistControls.js") as {
  patchVoicePlaylistSources: (sources: Record<string, string>, version: string) => Record<string, string>;
  voicePlaylistPatchFiles: string[];
};
const { patchAudioControlsService } = require("./withLoopAudioNotification.js") as {
  patchAudioControlsService: (source: string, version: string) => string;
};
const packagePath = require.resolve("expo-audio/package.json");
const { version } = JSON.parse(readFileSync(packagePath, "utf8")) as { version: string };
const source = Object.fromEntries(voicePlaylistPatchFiles.map((file) => [file, readFileSync(join(dirname(packagePath), file), "utf8")]));
const androidRoot = "android/src/main/java/expo/modules/audio/";
const normalize = (value: string) => value.replace(/\r\n/g, "\n");

describe("native voice playlist lock-screen controls", () => {
  it("registers the plugin with source compilation and background playback enabled", () => {
    const config = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(config.expo.plugins).toContain("./plugins/withVoicePlaylistControls");
    expect(config.expo.plugins).toContainEqual(["expo-audio", { enableBackgroundPlayback: true }]);
    expect(packageJson.expo.autolinking.android.buildFromSource).toContain("expo-audio");
  });

  it("gives the native Android playlist the same foreground service and cleanup as single players", () => {
    const result = patchVoicePlaylistSources(source, version);
    const base = normalize(result[`${androidRoot}BaseAudioPlayer.kt`]);
    const player = normalize(result[`${androidRoot}AudioPlayer.kt`]);
    const playlist = normalize(result[`${androidRoot}AudioPlaylist.kt`]);
    const module = normalize(result[`${androidRoot}AudioModule.kt`]);
    expect(base).toContain("val serviceConnection = AudioPlaybackServiceConnection(WeakReference(this), appContext)");
    expect(base).toContain("serviceBinder.service.setPlayerOptions(this, this.metadata, options)");
    expect(base).toContain("serviceConnection.release()\n    super.sharedObjectDidRelease()");
    expect(base).toMatch(/releasePlayer\(\) \{[\s\S]*serviceConnection\.unbind\(\)[\s\S]*ref\.release\(\)/);
    expect(player).not.toContain("fun setActiveForLockScreen");
    expect(player).not.toContain("override fun sharedObjectDidRelease");
    expect(player).toContain("visualizer?.release()\n    super.releasePlayer()");
    expect(playlist).toContain("ref.repeatMode = when (value)");
    expect(playlist).toContain("ref.addMediaItem(mediaItem)");
    expect(playlist).toContain("if (isActiveForLockScreen) metadata?.let { updateLockScreenMetadata(it) }");
    expect(playlist).toContain("sources.getOrNull(currentTrackIndex)?.name");
    expect(module).toContain('Function("setActiveForLockScreen") { playlist: AudioPlaylist');
    expect(module).toContain("(players.values.asSequence() + playlists.values.asSequence()).forEach { player ->");
    for (const file of ["service/AudioControlsService.kt", "service/AudioPlaybackServiceConnection.kt"]) {
      expect(result[`${androidRoot}${file}`]).not.toMatch(/\bAudioPlayer\b/);
      expect(result[`${androidRoot}${file}`]).toContain("BaseAudioPlayer");
    }
  });

  it("preserves iOS native queue progression and routes its transport, metadata and cleanup through the media controller", () => {
    const result = patchVoicePlaylistSources(source, version);
    const playlist = normalize(result["ios/AudioPlaylist.swift"]);
    const controller = normalize(result["ios/MediaController.swift"]);
    const module = normalize(result["ios/AudioModule.swift"]);
    expect(controller).toContain("extension AudioPlayer: LockScreenPlayable");
    expect(controller).toContain("extension AudioPlaylist: LockScreenPlayable");
    expect(controller).toContain("private var activePlayer: (any LockScreenPlayable)?");
    expect(controller).toContain("player.lockScreenPlayer.pause()");
    expect(controller).toContain("player.play(at: Float(player.currentRate");
    expect(controller).not.toContain("player.ref");
    expect(controller).toContain("private func enableRemoteCommands(options: LockScreenOptions?) {\n    disableRemoteCommands()");
    expect(controller).not.toContain(".removeTarget(self)");
    for (const command of ["play", "pause", "togglePlayPause", "changePlaybackPosition", "skipForward", "skipBackward"]) {
      expect(controller).toContain(`remoteCommandCenter.${command}Command.removeTarget(nil)`);
    }
    expect(controller).toContain("info.removeValue(forKey: MPNowPlayingInfoPropertyIsLiveStream)");
    expect(playlist).toContain("ref.actionAtItemEnd = loopMode == .single ? .pause : .advance");
    expect(playlist).toContain("self.skipTo(index: 0)\n          self.play(at: self.currentRate)");
    expect(playlist).toContain("self.ref.seek(to: .zero)\n        self.play(at: self.currentRate)");
    expect(playlist).toContain("ref.publisher(for: \\.timeControlStatus)");
    expect(playlist).toContain("let name = sources[currentTrackIndex].name");
    expect(playlist).toContain("setActiveForLockScreen(false)\n    ref.currentItem?.cancelPendingSeeks()");
    expect(module).toContain('Function("setActiveForLockScreen") { (playlist: AudioPlaylist');
    expect(module).toContain('Function("updateLockScreenMetadata") { (playlist: AudioPlaylist');
  });

  it("is idempotent and preserves both newline conventions", () => {
    const lf = Object.fromEntries(Object.entries(source).map(([file, text]) => [file, normalize(text)]));
    const patched = patchVoicePlaylistSources(lf, version);
    expect(patchVoicePlaylistSources(patched, version)).toEqual(patched);
    const crlf = Object.fromEntries(Object.entries(lf).map(([file, text]) => [file, text.replace(/\n/g, "\r\n")]));
    expect(patchVoicePlaylistSources(crlf, version)).toEqual(Object.fromEntries(Object.entries(patched).map(([file, text]) => [file, text.replace(/\n/g, "\r\n")])));
  });

  it("renames native queue metadata without replacing audio items and reports iOS decode failures", () => {
    const result = patchVoicePlaylistSources(source, version);
    const androidPlaylist = normalize(result[`${androidRoot}AudioPlaylist.kt`]);
    const swiftPlaylist = normalize(result["ios/AudioPlaylist.swift"]);
    const androidRename = androidPlaylist.match(/  fun updateTrackName[\s\S]*?(?=  override fun onLoadingChanged)/)?.[0];
    const swiftRename = swiftPlaylist.match(/  func updateTrackName[\s\S]*?(?=  private func refreshLockScreenTitle)/)?.[0];
    expect(androidRename).toContain("sources[index] = AudioSource(source.uri, source.headers, name)");
    expect(swiftRename).toContain("sources[index].name = name");
    for (const rename of [androidRename, swiftRename]) {
      expect(rename).not.toMatch(/seek|rebuildPlaylist|replace|prepare|clear\(/);
      expect(rename).toContain("currentTrackIndex");
    }
    expect(result[`${androidRoot}AudioModule.kt`]).toContain('Function("updateTrackName") { playlist: AudioPlaylist');
    expect(result["ios/AudioModule.swift"]).toContain('Function("updateTrackName") { (playlist: AudioPlaylist');
    expect(swiftPlaylist).toContain('} else if status == .failed {\n          self.updateStatus(with: [\n            "error": self.ref.currentItem?.error?.localizedDescription ?? "Audio decoding failed"');
  });

  it("composes with the existing live-loop notification patch in either order", () => {
    const file = `${androidRoot}service/AudioControlsService.kt`;
    const voiceThenLoop = patchAudioControlsService(patchVoicePlaylistSources(source, version)[file], version);
    const loopThenVoice = patchVoicePlaylistSources({ ...source, [file]: patchAudioControlsService(source[file], version) }, version)[file];
    expect(voiceThenLoop).toBe(loopThenVoice);
    expect(voiceThenLoop).toContain("override fun getDuration(): Long = androidx.media3.common.C.TIME_UNSET");
    expect(voiceThenLoop).toMatch(/if \(!isLive\) \{\s+return player\.ref\s+\}/);
    expect(voiceThenLoop).toContain("ACTION_PAUSE -> currentPlayerRef.pause()");
  });

  it("rejects changed SDKs, unknown targets and incomplete installed patches", () => {
    expect(() => patchVoicePlaylistSources(source, "57.0.5")).toThrow("Review");
    expect(() => patchVoicePlaylistSources({ changed: "unknown" }, version)).toThrow("Unknown");
    const file = `${androidRoot}BaseAudioPlayer.kt`;
    expect(() => patchVoicePlaylistSources({ [file]: "changed SDK source" }, version)).toThrow("changed");
    const patched = patchVoicePlaylistSources(source, version);
    expect(() => patchVoicePlaylistSources({ ...patched, [file]: patched[file].replace("serviceConnection.release()", "") }, version)).toThrow("incomplete");
    const swift = "ios/AudioPlaylist.swift";
    expect(() => patchVoicePlaylistSources({ ...patched, [swift]: patched[swift].replace("setActiveForLockScreen(false)", "") }, version)).toThrow("incomplete");
  });
});
