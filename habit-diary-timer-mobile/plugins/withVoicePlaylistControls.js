const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

const supportedVersion = "57.0.4";
const marker = "// Nino Room: native voice playlist lock-screen controls v1.";
const androidRoot = "android/src/main/java/expo/modules/audio/";

function replaceOnce(source, before, after, file) {
  if (source.split(before).length !== 2) {
    throw new Error(`expo-audio ${file} changed; review the voice playlist patch before building.`);
  }
  return source.replace(before, after);
}

function patch(source, file, transform, required) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const normalized = source.replace(/\r\n/g, "\n");
  const result = normalized.includes(marker) ? normalized : `${transform(normalized)}\n${marker}\n`;
  if (required.some((snippet) => !result.includes(snippet))) {
    throw new Error(`The expo-audio voice playlist patch in ${file} is incomplete; reinstall dependencies and prebuild again.`);
  }
  return result.replace(/\n/g, newline);
}

const lockScreenFields = `  // Lock screen controls
  var isActiveForLockScreen = false
  internal var metadata: Metadata? = null
  internal var lockScreenOptions: AudioLockScreenOptions? = null
  internal var mediaSession: MediaSession = buildBasicMediaSession(context, ref)
  val serviceConnection = AudioPlaybackServiceConnection(WeakReference(this), appContext)

  val isLive: Boolean
    get() = ref.isCurrentMediaItemLive

`;
const lockScreenMethods = `  fun setActiveForLockScreen(active: Boolean, metadata: Metadata? = null, options: AudioLockScreenOptions? = null) {
    if (active) {
      this.metadata = metadata
      this.lockScreenOptions = options
      this.isActiveForLockScreen = true

      if (serviceConnection.bindingState == ServiceBindingState.UNBOUND) {
        serviceConnection.bindWithService()
      }

      val serviceBinder = serviceConnection.playbackServiceBinder
      if (serviceBinder != null && serviceConnection.bindingState == ServiceBindingState.BOUND) {
        serviceBinder.service.setPlayerOptions(this, metadata, options)
      } else if (serviceConnection.bindingState == ServiceBindingState.BINDING) {
        // The settings will be applied when the service connects
      } else {
        appContext?.jsLogger?.error(
          getPlaybackServiceErrorMessage("Failed to activate lock screen controls - service binding failed")
        )
      }
    } else if (isActiveForLockScreen) {
      this.isActiveForLockScreen = false
      serviceConnection.playbackServiceBinder?.service?.unregisterPlayer()
    }
  }

  fun updateLockScreenMetadata(metadata: Metadata) {
    if (isActiveForLockScreen) {
      this.metadata = metadata

      val serviceBinder = serviceConnection.playbackServiceBinder
      if (serviceBinder != null && serviceConnection.bindingState == ServiceBindingState.BOUND) {
        serviceBinder.service.setPlayerMetadata(this, metadata)
      } else {
        appContext?.jsLogger?.warn(
          getPlaybackServiceErrorMessage("Cannot update lock screen metadata - service not connected")
        )
      }
    }
  }

  fun clearLockScreenControls() {
    if (isActiveForLockScreen) {
      serviceConnection.playbackServiceBinder?.service?.unregisterPlayer()
    }
  }

`;
const assignSession = `  internal fun assignBasicMediaSession() {
    mediaSession.release()
    mediaSession = buildBasicMediaSession(context, ref)
  }

`;
const releaseControls = `    mediaSession.release()
    if (isActiveForLockScreen) {
      serviceConnection.playbackServiceBinder?.service?.unregisterPlayer()
    }
    serviceConnection.unbind()
`;

const androidPlaylistMetadata = `  override fun resolveLockScreenMetadata(metadata: Metadata?): Metadata? {
    val title = sources.getOrNull(currentTrackIndex)?.name ?: return metadata
    return Metadata(title, metadata?.artist, metadata?.albumTitle, metadata?.artworkUrl)
  }

  fun updateTrackName(index: Int, name: String) {
    val source = sources.getOrNull(index) ?: return
    sources[index] = AudioSource(source.uri, source.headers, name)
    if (index == currentTrackIndex && isActiveForLockScreen) {
      metadata?.let { updateLockScreenMetadata(it) }
    }
  }

`;
const androidBridge = `      Function("setActiveForLockScreen") { playlist: AudioPlaylist, active: Boolean, metadata: Metadata?, options: AudioLockScreenOptions? ->
        runOnMain {
          playlist.serviceConnection.playsInSilentMode = playsInSilentMode
          playlist.setActiveForLockScreen(active, metadata, options)
        }
      }

      Function("updateLockScreenMetadata") { playlist: AudioPlaylist, metadata: Metadata ->
        runOnMain { playlist.updateLockScreenMetadata(metadata) }
      }

      Function("clearLockScreenControls") { playlist: AudioPlaylist ->
        runOnMain { playlist.setActiveForLockScreen(false) }
      }

      Function("updateTrackName") { playlist: AudioPlaylist, index: Int, name: String ->
        runOnMain { playlist.updateTrackName(index, name) }
      }

`;

const iosProtocol = `// Both single players and native queues use the same system media controller.
protocol LockScreenPlayable: AnyObject {
  var id: String { get }
  var lockScreenPlayer: AVPlayer { get }
  var isActiveForLockScreen: Bool { get set }
  var metadata: Metadata? { get set }
  var isLive: Bool { get }
  var isPlaying: Bool { get }
  var currentRate: Float { get }
  var duration: Double { get }
  var currentTime: Double { get }
  func play(at rate: Float)
}

extension AudioPlayer: LockScreenPlayable {
  var lockScreenPlayer: AVPlayer { ref }
}

extension AudioPlaylist: LockScreenPlayable {
  var lockScreenPlayer: AVPlayer { ref }
  var isLive: Bool { ref.currentItem?.duration.isIndefinite ?? false }
}

`;
const iosPlaylistControls = `  var isActiveForLockScreen = false
  var metadata: Metadata?

  func setActiveForLockScreen(_ active: Bool, metadata: Metadata? = nil, options: LockScreenOptions? = nil) {
    if active {
      self.metadata = metadata
      refreshLockScreenTitle()
      isActiveForLockScreen = true
      MediaController.shared.setActivePlayer(self, options: options)
    } else if isActiveForLockScreen {
      isActiveForLockScreen = false
      MediaController.shared.setActivePlayer(nil)
    }
  }

  func updateLockScreenMetadata(_ metadata: Metadata?) {
    self.metadata = metadata
    refreshLockScreenTitle()
    if isActiveForLockScreen {
      MediaController.shared.updateNowPlayingInfo(for: self)
    }
  }

  func updateTrackName(index: Int, name: String) {
    guard sources.indices.contains(index) else { return }
    sources[index].name = name
    if index == currentTrackIndex && isActiveForLockScreen {
      refreshLockScreenTitle()
      MediaController.shared.updateNowPlayingInfo(for: self)
    }
  }

  private func refreshLockScreenTitle() {
    guard sources.indices.contains(currentTrackIndex), let name = sources[currentTrackIndex].name else { return }
    var next = metadata ?? Metadata()
    next.title = name
    metadata = next
  }

`;
const iosBridge = `      Function("setActiveForLockScreen") { (playlist: AudioPlaylist, active: Bool, metadata: Metadata?, options: LockScreenOptions?) in
        playlist.setActiveForLockScreen(active, metadata: metadata, options: options)
      }

      Function("updateLockScreenMetadata") { (playlist: AudioPlaylist, metadata: Metadata?) in
        playlist.updateLockScreenMetadata(metadata)
      }

      Function("clearLockScreenControls") { (playlist: AudioPlaylist) in
        playlist.setActiveForLockScreen(false)
      }

      Function("updateTrackName") { (playlist: AudioPlaylist, index: Int, name: String) in
        playlist.updateTrackName(index: index, name: name)
      }

`;

const transforms = {
  [`${androidRoot}BaseAudioPlayer.kt`]: {
    required: ["private val context: Context", "WeakReference(this)", "protected open fun resolveLockScreenMetadata", "serviceConnection.release()", releaseControls],
    apply(source, file) {
      const edit = (before, after) => { source = replaceOnce(source, before, after, file); };
      edit("import androidx.media3.common.MediaItem", "import android.content.Context\nimport androidx.media3.session.MediaSession\nimport expo.modules.audio.service.AudioPlaybackServiceConnection\nimport expo.modules.audio.service.ServiceBindingState\nimport java.lang.ref.WeakReference\nimport androidx.media3.common.MediaItem");
      edit("abstract class BaseAudioPlayer(\n", "abstract class BaseAudioPlayer(\n  private val context: Context,\n");
      let methods = lockScreenMethods.replaceAll("this.metadata = metadata", "this.metadata = resolveLockScreenMetadata(metadata)")
        .replace("setPlayerOptions(this, metadata, options)", "setPlayerOptions(this, this.metadata, options)")
        .replace("setPlayerMetadata(this, metadata)", "setPlayerMetadata(this, this.metadata)");
      methods += "  protected open fun resolveLockScreenMetadata(metadata: Metadata?): Metadata? = metadata\n\n";
      edit("  protected var playerScope", `${lockScreenFields}${methods}${assignSession}  protected var playerScope`);
      edit("    super.sharedObjectDidRelease()", "    serviceConnection.release()\n    super.sharedObjectDidRelease()");
      edit("  protected open fun releasePlayer() {\n", `  protected open fun releasePlayer() {\n${releaseControls}`);
      return source;
    },
  },
  [`${androidRoot}AudioPlayer.kt`]: {
    required: ["context = context,", "override fun releasePlayer() {\n    visualizer?.release()\n    super.releasePlayer()"],
    apply(source, file) {
      const edit = (before, after) => { source = replaceOnce(source, before, after, file); };
      edit(") : BaseAudioPlayer(\n", ") : BaseAudioPlayer(\n  context = context,\n");
      edit(lockScreenFields, "");
      edit(lockScreenMethods, "");
      edit(assignSession, "");
      edit("  override fun sharedObjectDidRelease() {\n    serviceConnection.release()\n    super.sharedObjectDidRelease()\n  }\n\n", "");
      edit(releaseControls, "");
      return source;
    },
  },
  [`${androidRoot}AudioPlaylist.kt`]: {
    required: ["context = context,", androidPlaylistMetadata, "if (isActiveForLockScreen) metadata?.let { updateLockScreenMetadata(it) }", "ref.repeatMode = when (value)"],
    apply(source, file) {
      source = replaceOnce(source, ") : BaseAudioPlayer(\n", ") : BaseAudioPlayer(\n  context = context,\n", file);
      source = replaceOnce(source, "  override fun onLoadingChanged", `${androidPlaylistMetadata}  override fun onLoadingChanged`, file);
      return replaceOnce(source, "  override fun onMediaItemChanged(mediaItem: MediaItem?, reason: Int) {\n", "  override fun onMediaItemChanged(mediaItem: MediaItem?, reason: Int) {\n    if (isActiveForLockScreen) metadata?.let { updateLockScreenMetadata(it) }\n", file);
    },
  },
  [`${androidRoot}AudioModule.kt`]: {
    required: [androidBridge, "(players.values.asSequence() + playlists.values.asSequence()).forEach { player ->"],
    apply(source, file) {
      source = replaceOnce(source, "      Function(\"destroy\") { playlist: AudioPlaylist ->", `${androidBridge}      Function("destroy") { playlist: AudioPlaylist ->`, file);
      return replaceOnce(source, "      players.values.forEach { player ->\n        player.serviceConnection", "      (players.values.asSequence() + playlists.values.asSequence()).forEach { player ->\n        player.serviceConnection", file);
    },
  },
  [`${androidRoot}service/AudioControlsService.kt`]: {
    required: ["import expo.modules.audio.BaseAudioPlayer", "private var currentPlayer: BaseAudioPlayer?", "player.mediaSession = session", "ACTION_PAUSE -> currentPlayerRef.pause()"],
    apply(source, file) {
      if (!source.includes("private var currentPlayer: AudioPlayer?")) throw new Error(`expo-audio ${file} changed; review the voice playlist patch.`);
      return source.replace(/\bAudioPlayer\b/g, "BaseAudioPlayer");
    },
  },
  [`${androidRoot}service/AudioPlaybackServiceConnection.kt`]: {
    required: ["import expo.modules.audio.BaseAudioPlayer", "WeakReference<BaseAudioPlayer>", "player.isActiveForLockScreen"],
    apply(source, file) {
      if (!source.includes("val player: WeakReference<AudioPlayer>")) throw new Error(`expo-audio ${file} changed; review the voice playlist patch.`);
      return source.replace(/\bAudioPlayer\b/g, "BaseAudioPlayer");
    },
  },
  "ios/MediaController.swift": {
    required: [iosProtocol, "private var activePlayer: (any LockScreenPlayable)?", "player.lockScreenPlayer.currentItem", "player.play(at:", "remoteCommandCenter.togglePlayPauseCommand.removeTarget(nil)", "private func enableRemoteCommands(options: LockScreenOptions?) {\n    disableRemoteCommands()"],
    apply(source, file) {
      source = replaceOnce(source, "  private var activePlayer: AudioPlayer?", "  private var activePlayer: (any LockScreenPlayable)?", file);
      source = source.replace(/: AudioPlayer\?/g, ": (any LockScreenPlayable)?").replace(/: AudioPlayer\b/g, ": any LockScreenPlayable").replace(/player\.ref\b/g, "player.lockScreenPlayer");
      // Closure-based command handlers use opaque target tokens, not `self`.
      // This controller owns these actions: clear them before reactivation so a
      // headset toggle does not pause then immediately resume through old handlers.
      source = source.replace(/\.removeTarget\(self\)/g, ".removeTarget(nil)");
      source = replaceOnce(source, "  private func enableRemoteCommands(options: LockScreenOptions?) {\n", "  private func enableRemoteCommands(options: LockScreenOptions?) {\n    disableRemoteCommands()\n", file);
      source = replaceOnce(source, "      info[MPMediaItemPropertyPlaybackDuration] = player.duration", "      info.removeValue(forKey: MPNowPlayingInfoPropertyIsLiveStream)\n      info[MPMediaItemPropertyPlaybackDuration] = player.duration", file);
      return replaceOnce(source, "class MediaController {", `${iosProtocol}class MediaController {`, file);
    },
  },
  "ios/AudioPlaylist.swift": {
    required: [iosPlaylistControls, "refreshLockScreenTitle()\n      MediaController.shared.updateNowPlayingInfo(for: self)", "setActiveForLockScreen(false)\n    ref.currentItem?.cancelPendingSeeks()", "switch self.loopMode", '"error": self.ref.currentItem?.error?.localizedDescription ?? "Audio decoding failed"'],
    apply(source, file) {
      const edit = (before, after) => { source = replaceOnce(source, before, after, file); };
      edit("  private var timeToken: Any?", `${iosPlaylistControls}  private var timeToken: Any?`);
      edit("    self.emit(event: PlaylistConstants.playlistStatusUpdate, payload: arguments)", "    self.emit(event: PlaylistConstants.playlistStatusUpdate, payload: arguments)\n    if isActiveForLockScreen {\n      refreshLockScreenTitle()\n      MediaController.shared.updateNowPlayingInfo(for: self)\n    }");
      // Native remote pause must update Now Playing even while JavaScript is suspended.
      edit("  private func setupPublisher() {\n", "  private func setupPublisher() {\n    ref.publisher(for: \\.timeControlStatus)\n      .sink { [weak self] _ in self?.updateStatus(with: [:]) }\n      .store(in: &cancellables)\n\n");
      edit('          self.updateStatus(with: ["isLoaded": true])\n        }', '          self.updateStatus(with: ["isLoaded": true])\n        } else if status == .failed {\n          self.updateStatus(with: [\n            "error": self.ref.currentItem?.error?.localizedDescription ?? "Audio decoding failed",\n            "isLoaded": false,\n            "playing": false\n          ])\n        }');
      edit("  public override func sharedObjectWillRelease() {\n", "  public override func sharedObjectWillRelease() {\n    setActiveForLockScreen(false)\n");
      return source;
    },
  },
  "ios/AudioModule.swift": {
    required: [iosBridge, "playlist.play(at: playlist.currentRate)"],
    apply(source, file) {
      return replaceOnce(source, "      Function(\"destroy\") { playlist in", `${iosBridge}      Function("destroy") { playlist in`, file);
    },
  },
};

function patchVoicePlaylistSources(sources, version) {
  if (version !== supportedVersion) {
    throw new Error(`Review the voice playlist patch before using expo-audio ${version} (expected ${supportedVersion}).`);
  }
  return Object.fromEntries(Object.entries(sources).map(([file, source]) => {
    const transform = transforms[file];
    if (!transform) throw new Error(`Unknown voice playlist patch target: ${file}`);
    return [file, patch(source, file, (input) => transform.apply(input, file), transform.required)];
  }));
}

function patchPlatform(mod, platform) {
  const packagePath = require.resolve("expo-audio/package.json", { paths: [mod.modRequest.projectRoot] });
  const packageRoot = path.dirname(packagePath);
  const { version } = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const files = Object.keys(transforms).filter((file) => file.startsWith(`${platform}/`));
  const original = Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(packageRoot, file), "utf8")]));
  // Validate every file before writing any of them, so changed SDKs fail without a partial patch.
  const patched = patchVoicePlaylistSources(original, version);
  for (const file of files) {
    if (patched[file] !== original[file]) fs.writeFileSync(path.join(packageRoot, file), patched[file], "utf8");
  }
  return mod;
}

module.exports = function withVoicePlaylistControls(config) {
  config = withDangerousMod(config, ["android", async (mod) => patchPlatform(mod, "android")]);
  return withDangerousMod(config, ["ios", async (mod) => patchPlatform(mod, "ios")]);
};
module.exports.patchVoicePlaylistSources = patchVoicePlaylistSources;
module.exports.voicePlaylistPatchFiles = Object.keys(transforms);
