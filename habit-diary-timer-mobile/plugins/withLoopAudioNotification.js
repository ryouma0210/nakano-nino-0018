const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

const supportedVersion = "57.0.4";
const marker = "// Nino Room: live loop notifications do not expose playback time.";
const originalLivePlayer = `    return object : ForwardingPlayer(player.ref) {
      override fun getAvailableCommands(): Player.Commands {
        return super.getAvailableCommands().buildUpon()
          .remove(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
          .build()
      }
    }`;
const livePlayer = `    ${marker}
    return object : ForwardingPlayer(player.ref) {
      override fun isCurrentMediaItemLive(): Boolean = true
      override fun isCurrentMediaItemSeekable(): Boolean = false
      override fun getDuration(): Long = androidx.media3.common.C.TIME_UNSET
      override fun getContentDuration(): Long = androidx.media3.common.C.TIME_UNSET

      override fun isCommandAvailable(command: Int): Boolean = availableCommands.contains(command)

      override fun getAvailableCommands(): Player.Commands {
        return super.getAvailableCommands().buildUpon()
          .remove(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
          .remove(Player.COMMAND_SEEK_TO_DEFAULT_POSITION)
          .remove(Player.COMMAND_SEEK_TO_MEDIA_ITEM)
          .remove(Player.COMMAND_SEEK_BACK)
          .remove(Player.COMMAND_SEEK_FORWARD)
          .remove(Player.COMMAND_SEEK_TO_PREVIOUS)
          .remove(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
          .remove(Player.COMMAND_SEEK_TO_NEXT)
          .remove(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
          .build()
      }
    }`;
const originalNotification = "      .setContentIntent(buildContentIntent())\n      .setAutoCancel(false)";
const notification = "      .setContentIntent(buildContentIntent())\n      .setShowWhen(false)\n      .setUsesChronometer(false)\n      .setAutoCancel(false)";

/** Keep this scoped to expo-audio's live session wrapper; the actual player is unchanged. */
function patchAudioControlsService(source, version) {
  if (version !== supportedVersion) {
    throw new Error(`Review the loop notification patch before using expo-audio ${version} (expected ${supportedVersion}).`);
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let result = source.replace(/\r\n/g, "\n");
  if (result.includes(marker)) {
    if (!result.includes(livePlayer) || !result.includes(notification)) {
      throw new Error("The expo-audio loop notification patch is incomplete; reinstall dependencies and prebuild again.");
    }
    return source;
  }
  for (const [before, after] of [[originalLivePlayer, livePlayer], [originalNotification, notification]]) {
    if (result.split(before).length !== 2) {
      throw new Error("expo-audio AudioControlsService changed; review the loop notification patch before building.");
    }
    result = result.replace(before, after);
  }
  return result.replace(/\n/g, newline);
}

module.exports = function withLoopAudioNotification(config) {
  return withDangerousMod(config, ["android", async (mod) => {
    const packagePath = require.resolve("expo-audio/package.json", { paths: [mod.modRequest.projectRoot] });
    const { version } = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const servicePath = path.join(path.dirname(packagePath), "android/src/main/java/expo/modules/audio/service/AudioControlsService.kt");
    const source = fs.readFileSync(servicePath, "utf8");
    const patched = patchAudioControlsService(source, version);
    if (patched !== source) fs.writeFileSync(servicePath, patched, "utf8");
    return mod;
  }]);
};
module.exports.patchAudioControlsService = patchAudioControlsService;
