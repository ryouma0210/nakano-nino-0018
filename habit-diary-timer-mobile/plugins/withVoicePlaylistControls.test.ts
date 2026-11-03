import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { patchVoicePlaylistSources, patchVoicePlaylistBaseSources, voicePlaylistPatchFiles } = require("./withVoicePlaylistControls.js") as {
  patchVoicePlaylistSources: (sources: Record<string, string>, version: string) => Record<string, string>;
  patchVoicePlaylistBaseSources: (sources: Record<string, string>, version: string) => Record<string, string>;
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
const navigationMarker = "// Nino Room: native voice playlist previous/next controls v2.";

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

  it("upgrades an installed v1 patch with a separately validated, idempotent navigation phase", () => {
    const legacy = patchVoicePlaylistBaseSources(source, version);
    const upgraded = patchVoicePlaylistSources(legacy, version);
    const navigationFiles = [
      `${androidRoot}service/AudioControlsService.kt`,
      `${androidRoot}service/AudioMediaSessionCallback.kt`,
      "ios/MediaController.swift",
    ];
    for (const file of navigationFiles) {
      expect(upgraded[file].split(navigationMarker)).toHaveLength(2);
    }
    // The older phase must remain valid, rather than being rerun on already moved methods.
    expect(patchVoicePlaylistBaseSources(upgraded, version)).toEqual(upgraded);
    expect(patchVoicePlaylistSources(upgraded, version)).toEqual(upgraded);
    for (const file of voicePlaylistPatchFiles.filter((file) => !navigationFiles.includes(file))) {
      expect(upgraded[file]).toBe(legacy[file]);
    }
  });

  it("wraps Android remote previous/next around the live selected queue independently of repeat mode", () => {
    const service = normalize(patchVoicePlaylistSources(source, version)[`${androidRoot}service/AudioControlsService.kt`]);
    const navigation = service.match(/  private fun navigatePlaylist[\s\S]*?(?=  private inner class VoicePlaylistNavigationPlayer)/)?.[0];
    expect(navigation).toContain("playlist !== currentPlayer");
    expect(navigation).toContain("!playlist.isActiveForLockScreen");
    expect(navigation).toContain("!canNavigatePlaylist() || !shouldPlayInSilentMode()");
    expect(navigation).toContain("val count = playlist.ref.mediaItemCount");
    expect(navigation).toContain("val current = playlist.ref.currentMediaItemIndex.coerceIn(0, count - 1)");
    expect(navigation).toContain("playlist.ref.seekTo((current + direction + count) % count, 0L)\n    playlist.ref.play()");
    expect(navigation).not.toMatch(/repeatMode|loopMode|sources/);
    expect(service).toContain("playlist.ref.mediaItemCount > 1 && !(currentOptions?.isLiveStream ?: playlist.isLive)");
    for (const [method, direction] of [["seekToPrevious", -1], ["seekToPreviousMediaItem", -1], ["seekToNext", 1], ["seekToNextMediaItem", 1]]) {
      expect(service).toContain(`override fun ${method}() = navigatePlaylist(${direction}, playlist)`);
    }
    expect(service).toContain("if (playlist.ref.mediaItemCount > 1) commands.add(command) else commands.remove(command)");
    expect(service).toContain("listener.onAvailableCommandsChanged(this@VoicePlaylistNavigationPlayer.availableCommands)");
    expect(service).toContain("flags.add(Player.EVENT_AVAILABLE_COMMANDS_CHANGED)");
    expect(service).toContain("listener.onEvents(this@VoicePlaylistNavigationPlayer, Player.Events(flags.build()))");
    expect(service).toContain("super.removeListener(listeners.remove(listener) ?: listener)");
  });

  it("exposes previous/play/next on both older Android notifications and modern Media3 command slots", () => {
    const patched = patchVoicePlaylistSources(source, version);
    const service = normalize(patched[`${androidRoot}service/AudioControlsService.kt`]);
    const callback = normalize(patched[`${androidRoot}service/AudioMediaSessionCallback.kt`]);
    const notification = service.match(/    \/\/ Older Android system UI[\s\S]*?(?=    builder.setStyle)/)?.[0];
    expect(notification).toContain("Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2");
    expect(notification).toMatch(/ACTION_PREVIOUS[\s\S]*ACTION_PAUSE[\s\S]*ACTION_NEXT/);
    expect(notification).toContain("media3_icon_previous");
    expect(notification).toContain("media3_icon_next");
    expect(service).toContain("ACTION_PREVIOUS -> navigatePlaylist(-1, actionPlayer as? AudioPlaylist)");
    expect(service).toContain("ACTION_NEXT -> navigatePlaylist(1, actionPlayer as? AudioPlaylist)");
    expect(service).toMatch(/CommandButton\.ICON_PREVIOUS[\s\S]*?\.setPlayerCommand\(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM\)[\s\S]*?\.setSlots\(CommandButton.SLOT_BACK\)/);
    expect(service).toMatch(/CommandButton\.ICON_NEXT[\s\S]*?\.setPlayerCommand\(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM\)[\s\S]*?\.setSlots\(CommandButton.SLOT_FORWARD\)/);
    expect(service.split(".setCallback(AudioMediaSessionCallback(player is AudioPlaylist && !(options?.isLiveStream ?: player.isLive)))")).toHaveLength(3);
    expect(callback).toContain("playlistNavigation: Boolean = false");
    expect(callback).toContain("if (playlistNavigation) commands.add(command) else commands.remove(command)");
    expect(service).toContain("if (!isLive && player is AudioPlaylist) {\n      return VoicePlaylistNavigationPlayer(player)\n    }");
  });

  it("handles iOS previous/next on the main queue, refreshes track-count availability and removes handlers", () => {
    const controller = normalize(patchVoicePlaylistSources(source, version)["ios/MediaController.swift"]);
    const navigation = controller.match(/  private func navigatePlaylist[\s\S]*?(?=  private func enableRemoteCommands)/)?.[0];
    expect(controller).toContain("let enabled = !isLiveStream && (activePlayer as? AudioPlaylist).map { $0.trackCount > 1 } == true");
    expect(controller).toContain("updatePlaylistNavigationCommands()\n    let nextArtworkItemIdentifier");
    expect(navigation).toContain("let playlist = self.activePlayer as? AudioPlaylist");
    expect(navigation).toContain("playlist.isActiveForLockScreen, playlist.trackCount > 1");
    expect(navigation).toContain("let index = (playlist.currentTrackIndex + direction + count) % count");
    expect(navigation).toContain("playlist.skipTo(index: index)\n      playlist.play(at: playlist.currentRate > 0 ? playlist.currentRate : 1.0)");
    expect(navigation).toContain("Thread.isMainThread ? navigate() : DispatchQueue.main.sync(execute: navigate)");
    expect(navigation).not.toMatch(/loopMode|\.next\(|\.previous\(/);
    for (const [command, direction] of [["previousTrack", -1], ["nextTrack", 1]]) {
      expect(controller).toContain(`remoteCommandCenter.${command}Command.addTarget { [weak self] _ in\n      self?.navigatePlaylist(${direction}) ?? .commandFailed`);
      expect(controller).toContain(`remoteCommandCenter.${command}Command.isEnabled = false`);
      expect(controller).toContain(`remoteCommandCenter.${command}Command.removeTarget(nil)`);
    }
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

  it("rejects changed navigation sources and incomplete installed navigation phases", () => {
    const patched = patchVoicePlaylistSources(source, version);
    const service = `${androidRoot}service/AudioControlsService.kt`;
    const callback = `${androidRoot}service/AudioMediaSessionCallback.kt`;
    expect(() => patchVoicePlaylistSources({ [callback]: "changed SDK source" }, version)).toThrow("changed");
    expect(() => patchVoicePlaylistSources({ ...patched, [service]: patched[service].replace("playlist.ref.play()", "") }, version)).toThrow("incomplete");
    expect(() => patchVoicePlaylistSources({ ...patched, [callback]: patched[callback].replace("if (playlistNavigation) commands.add(command) else commands.remove(command)", "") }, version)).toThrow("incomplete");
    const swift = "ios/MediaController.swift";
    expect(() => patchVoicePlaylistSources({ ...patched, [swift]: patched[swift].replace("remoteCommandCenter.nextTrackCommand.removeTarget(nil)", "") }, version)).toThrow("incomplete");
  });
});
