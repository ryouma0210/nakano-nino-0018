export type VoiceTrack = { id: string; name: string; uri: string };
export type VoicePlaybackState = { currentId: string | null; playing: boolean };
export type VoicePlaybackProgress = { currentId: string | null; position: number; duration: number };
export type VoicePlaylist = {
  readonly currentIndex: number;
  readonly playing: boolean;
  readonly currentTime: number;
  readonly duration?: number;
  readonly currentStatus?: { isBuffering: boolean };
  loop: "none" | "single" | "all";
  volume: number;
  play(): void;
  pause(): void;
  clear(): void;
  add(source: { uri: string; name: string }): void;
  skipTo(index: number): void;
  seekTo(seconds: number): Promise<void>;
  updateTrackName?(index: number, name: string): void;
};

type Options = {
  prepare(isCurrent: () => boolean): Promise<void>;
  activate(title: string): void;
  updateTitle(title: string): void;
  deactivate(): void;
  release(): void;
  onChange(state: VoicePlaybackState): void;
  onProgress?(progress: VoicePlaybackProgress): void;
  onError(error: unknown): void;
};

/** The native playlist owns track advancement, including while JS is suspended. */
export function createVoicePlayback(player: VoicePlaylist, options: Options) {
  let tracks: readonly VoiceTrack[] = [];
  let state: VoicePlaybackState = { currentId: null, playing: false };
  let request = 0;
  let preparing = false;
  let disposed = false;
  let currentTitle = "";
  let seekPending: Promise<void> = Promise.resolve();
  let requestedPosition: { id: string; seconds: number; token: number } | null = null;

  // Native queues can advance while JS is suspended. Use the actual player
  // position before editing or skipping, rather than the last rendered row.
  function liveState(): VoicePlaybackState {
    if (!state.currentId || preparing) return state;
    const track = tracks[player.currentIndex];
    return track ? { currentId: track.id, playing: player.currentStatus?.isBuffering ? state.playing : player.playing } : state;
  }

  function seek(index: number, time: number, token: number) {
    const task = seekPending.then(async () => {
      if (disposed || token !== request) return;
      player.skipTo(index);
      await player.seekTo(time);
    });
    seekPending = task.catch(() => {});
    return task;
  }

  function publish(next: VoicePlaybackState) {
    state = next;
    options.onChange(next);
    options.onProgress?.(getProgress());
    const title = tracks.find((track) => track.id === next.currentId)?.name;
    if (title && title !== currentTitle) {
      currentTitle = title;
      options.updateTitle(title);
    }
  }

  function getProgress(): VoicePlaybackProgress {
    const currentId = liveState().currentId;
    if (!currentId || preparing || tracks[player.currentIndex]?.id !== currentId) return { currentId, position: 0, duration: 0 };
    const duration = Number.isFinite(player.duration) && player.duration! > 0 ? player.duration! : 0;
    const position = Number.isFinite(player.currentTime) ? Math.max(0, player.currentTime) : 0;
    return { currentId, position: duration > 0 ? Math.min(position, duration) : position, duration };
  }

  async function seekTo(seconds: number, expectedId = liveState().currentId) {
    const progress = getProgress();
    if (disposed || preparing || !Number.isFinite(seconds) || !expectedId || progress.currentId !== expectedId || progress.duration <= 0) return;
    const token = ++request;
    const target = Math.max(0, Math.min(progress.duration, seconds));
    requestedPosition = { id: expectedId, seconds: target, token };
    const task = seekPending.then(async () => {
      // Do not turn a delayed seek from the old track into a seek on the next one.
      if (disposed || token !== request || preparing || liveState().currentId !== expectedId) return;
      await player.seekTo(target);
      if (!disposed && token === request && liveState().currentId === expectedId) publish(liveState());
    });
    seekPending = task.catch(() => {});
    try { await task; }
    catch (error) { if (!disposed && token === request) options.onError(error); }
    finally { if (requestedPosition?.token === token) requestedPosition = null; }
  }

  function stop() {
    const owned = state.currentId !== null;
    ++request;
    preparing = false;
    player.pause();
    if (owned) {
      options.deactivate();
      options.release();
    }
    currentTitle = "";
    publish({ currentId: null, playing: false });
  }

  function fail(error: unknown) {
    try { stop(); } catch { /* Preserve the original playback error. */ }
    options.onError(error);
  }

  async function play(id: string) {
    if (disposed) return;
    const index = tracks.findIndex((track) => track.id === id);
    if (index < 0) return;
    const token = ++request;
    const resume = liveState().currentId === id && tracks[player.currentIndex]?.id === id && !preparing;
    preparing = true;
    publish({ currentId: id, playing: true });
    try {
      await options.prepare(() => !disposed && token === request);
      if (disposed || token !== request) return;
      if (!resume) {
        player.pause();
        await seek(index, 0, token);
      }
      if (disposed || token !== request) return;
      options.activate(tracks[index].name);
      player.play();
      preparing = false;
    } catch (error) { if (token === request && !disposed) fail(error); }
  }

  return {
    initialize() { disposed = false; },
    getState() { return { ...liveState() }; },
    getProgress,
    seekTo,
    seekBy(seconds: number, expectedId = liveState().currentId) {
      if (!Number.isFinite(seconds) || !expectedId || liveState().currentId !== expectedId) return Promise.resolve();
      const position = requestedPosition?.id === expectedId && requestedPosition.token === request
        ? requestedPosition.seconds : getProgress().position;
      return seekTo(position + seconds, expectedId);
    },
    setVolume(volume: number) { player.volume = volume; },
    async sync(next: readonly VoiceTrack[], mode: "one" | "all") {
      if (disposed) return;
      player.loop = mode === "one" ? "single" : "all";
      const changed = tracks.length !== next.length || tracks.some((track, index) => track.id !== next[index]?.id || track.uri !== next[index]?.uri);
      if (!changed) {
        next.forEach((track, index) => {
          if (track.name !== tracks[index]?.name) player.updateTrackName?.(index, track.name);
        });
        tracks = next;
        publish(liveState());
        return;
      }
      const token = ++request;
      const previous = liveState();
      const time = preparing ? 0 : player.currentTime;
      const selected = next.findIndex((track) => track.id === previous.currentId);
      preparing = true;
      try {
        player.pause();
        player.clear();
        tracks = next;
        next.forEach((track) => player.add({ uri: track.uri, name: track.name }));
        if (selected < 0) { stop(); return; }
        await seek(selected, Number.isFinite(time) ? time : 0, token);
        if (disposed || token !== request) return;
        // Reordering or importing preserves the current track and position.
        if (previous.playing) {
          await options.prepare(() => !disposed && token === request);
          if (disposed || token !== request) return;
          options.activate(next[selected].name);
          player.play();
        }
        preparing = false;
        publish(previous);
      } catch (error) { if (token === request && !disposed) fail(error); }
    },
    play,
    pause() {
      const previous = liveState();
      ++request;
      preparing = false;
      player.pause();
      publish({ ...previous, playing: false });
    },
    stop,
    step(direction: -1 | 1) {
      if (tracks.length === 0) return;
      const current = tracks.findIndex((track) => track.id === liveState().currentId);
      const index = current < 0 ? 0 : (current + direction + tracks.length) % tracks.length;
      void play(tracks[index].id);
    },
    check(status: { playing: boolean; isBuffering: boolean; error?: unknown }) {
      if (disposed) return;
      if (status.error) { fail(status.error); return; }
      if (preparing) return;
      if (!state.currentId) {
        if (status.playing) player.pause();
        return;
      }
      const track = tracks[player.currentIndex];
      if (!track) return;
      publish({ currentId: track.id, playing: status.isBuffering ? state.playing : status.playing });
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
