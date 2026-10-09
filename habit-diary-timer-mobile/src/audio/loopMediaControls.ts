export type LoopMediaStatus = {
  playing: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  timeControlStatus: string;
  playbackState: string;
  didJustFinish: boolean;
  error?: string | null;
};

export type LoopMediaPlayer = {
  readonly playing: boolean;
  readonly currentStatus: LoopMediaStatus;
  setActiveForLockScreen: (active: boolean, metadata?: { title: string; artist: string }, options?: {
    showSeekForward: boolean; showSeekBackward: boolean; isLiveStream: boolean;
  }) => void;
  updateLockScreenMetadata: (metadata: { title: string; artist: string }) => void;
};

type Mode = "mixWithOthers" | "doNotMix";
type Request = { preparing: boolean; played: boolean };
type Options<Player> = {
  setMode: (mode: Mode) => Promise<void>;
  onExternalStop: () => void;
  onUnexpectedPlayback: (player: Player) => void;
  onStartFailure: (player: Player) => void;
  onError: (error: unknown) => void;
  installStopActions?: (stop: () => void) => () => void;
};

/** Only manual loop players are owned here; room sounds keep their own lifecycle. */
export function createLoopMediaControls<Player extends LoopMediaPlayer>(players: readonly Player[], options: Options<Player>) {
  const requested = new Map<Player, Request>();
  const loadErrors = new Map<Player, string>();
  let representative: Player | null = null;
  let removeStopActions: (() => void) | undefined;
  let disposed = false;
  let metadata = { title: "ループ音声", artist: "Nino Room" };
  let mode: Mode | null = null;
  let modeQueue: Promise<void> = Promise.resolve();

  function setMode(next: Mode): Promise<void> {
    const result = modeQueue.then(async () => {
      if (mode === next) return;
      await options.setMode(next);
      mode = next;
    });
    // One failed platform call must not strand a later stop or retry.
    modeQueue = result.catch(() => {});
    return result;
  }

  function clearControls() {
    const previous = representative;
    representative = null;
    removeStopActions?.();
    removeStopActions = undefined;
    if (previous) {
      try { previous.setActiveForLockScreen(false); } catch (error) { options.onError(error); }
    }
  }

  function syncRepresentative() {
    if (representative && requested.get(representative)?.played) return;
    clearControls();
    const next = [...requested].find(([, request]) => request.played)?.[0];
    if (!next || disposed) return;
    representative = next;
    try {
      next.setActiveForLockScreen(true, metadata, { showSeekForward: false, showSeekBackward: false, isLiveStream: true });
      removeStopActions = options.installStopActions?.(() => {
        if (representative === next && !disposed) requestExternalStop();
      });
    } catch (error) { options.onError(error); }
  }

  function stop(player?: Player) {
    if (player) requested.delete(player);
    else requested.clear();
    syncRepresentative();
    if (requested.size === 0) void setMode("mixWithOthers").catch(options.onError);
  }

  function requestExternalStop() {
    if (disposed || requested.size === 0) return;
    // Clear intent before pause/reset generates additional player events.
    stop();
    options.onExternalStop();
  }

  function checkPlayer(player: Player, event?: Pick<LoopMediaStatus, "error" | "isLoaded">) {
    if (disposed) return;
    try {
      // Read current native state: an event can arrive after a newer play/stop.
      const status = player.currentStatus;
      // Web exposes decode/load errors only in event payloads, not currentStatus.
      if (event?.error) loadErrors.set(player, event.error);
      else if (event?.isLoaded) loadErrors.delete(player);
      const playing = player.playing || status.playing;
      const request = requested.get(player);
      if (!request) {
        // SDK interruptions can automatically resume a player after a user stop.
        if (playing) options.onUnexpectedPlayback(player);
        return;
      }
      const error = status.error || loadErrors.get(player);
      if (error) {
        stop(player);
        options.onStartFailure(player);
        options.onError(new Error(error));
        return;
      }
      if (request.preparing) return;
      if (playing) {
        request.played = true;
        syncRepresentative();
      } else if (request.played && !status.isBuffering && !status.didJustFinish
        && status.timeControlStatus === "paused" && (status.isLoaded || status.playbackState === "idle")) {
        requestExternalStop();
      }
    } catch (error) { options.onError(error); }
  }

  return {
    initialize() {
      disposed = false;
      void setMode("mixWithOthers").catch(options.onError);
    },
    start(player: Player, startPlayback: () => void | Promise<void>) {
      if (disposed || !players.includes(player)) return;
      const request = { preparing: true, played: false };
      requested.set(player, request);
      syncRepresentative();
      void setMode("doNotMix").then(async () => {
        if (disposed || requested.get(player) !== request) return;
        const error = player.currentStatus.error || loadErrors.get(player);
        if (error) throw new Error(error);
        request.preparing = false;
        await startPlayback();
        if (requested.get(player) === request) checkPlayer(player);
      }).catch((error) => {
        if (disposed || requested.get(player) !== request) return;
        stop(player);
        options.onStartFailure(player);
        options.onError(error);
      });
    },
    stop,
    checkPlayer,
    check() { players.forEach((player) => checkPlayer(player)); },
    hasRequests() { return requested.size > 0; },
    updateTitle(title: string) {
      metadata = { title, artist: "Nino Room" };
      if (representative) {
        try { representative.updateLockScreenMetadata(metadata); } catch (error) { options.onError(error); }
      }
    },
    dispose() {
      disposed = true;
      requested.clear();
      clearControls();
      void setMode("mixWithOthers").catch(options.onError);
    },
  };
}

/** Expo supplies metadata and playback state; these actions stop the whole mix. */
export function installLoopMediaSessionActions(session: Pick<MediaSession, "setActionHandler"> | undefined, stop: () => void) {
  if (!session) return () => {};
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try { session.setActionHandler(action, handler); } catch { /* Some browsers do not support every action. */ }
  };
  let active = true;
  const stopAll = () => { if (active) stop(); };
  set("pause", stopAll);
  set("stop", stopAll);
  set("play", null);
  set("seekto", null);
  return () => {
    active = false;
    set("pause", null);
    set("stop", null);
  };
}
