export type VoiceTrack = { id: string; name: string; uri: string };
export type VoicePlaybackState = { currentId: string | null; playing: boolean };
export type VoicePlaylist = {
  readonly currentIndex: number;
  readonly playing: boolean;
  readonly currentTime: number;
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
    const title = tracks.find((track) => track.id === next.currentId)?.name;
    if (title && title !== currentTitle) {
      currentTitle = title;
      options.updateTitle(title);
    }
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
