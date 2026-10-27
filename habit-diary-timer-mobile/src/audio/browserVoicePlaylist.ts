import type { VoicePlaylistHandle, VoicePlaylistStatus } from "./voicePlaylist";

type Track = { uri: string; name: string };
type RepeatMode = "none" | "single" | "all";
export type BrowserVoicePlaylist = VoicePlaylistHandle & { destroy(): void };
const playbackErrorMessage = "ボイスを再生できませんでした。音声ファイルを確認してください。";

/** Keep one media element for track changes so browser playback permission survives the queue. */
export function createBrowserVoicePlaylist(createAudio: () => HTMLAudioElement = () => new Audio()): BrowserVoicePlaylist {
  const listeners = new Set<(status: VoicePlaylistStatus) => void>();
  const tracks: Track[] = [];
  let media: HTMLAudioElement | null = null;
  let removeEvents: (() => void) | null = null;
  let cancelSeek: (() => void) | null = null;
  let index = -1;
  let repeat: RepeatMode = "none";
  let volume = 1;
  let savedTime = 0;
  let request = 0;
  let wantsToPlay = false;
  let status: VoicePlaylistStatus = { playing: false, isBuffering: false };

  function publish(next: VoicePlaylistStatus) {
    status = next;
    for (const listener of listeners) {
      try { listener({ ...next }); }
      catch (error) { console.warn("Could not notify a voice playback subscriber", error); }
    }
  }

  function fail() {
    ++request;
    wantsToPlay = false;
    cancelSeek?.();
    media?.pause();
    publish({ playing: false, isBuffering: false, error: new Error(playbackErrorMessage) });
  }

  function ensureMedia(): HTMLAudioElement {
    if (media) return media;
    const audio = createAudio();
    media = audio;
    audio.preload = "auto";
    audio.loop = repeat === "single";
    audio.volume = volume;
    audio.setAttribute("playsinline", "true");
    const events: Record<string, () => void> = {
      playing: () => { if (wantsToPlay) publish({ playing: true, isBuffering: false }); },
      play: () => { if (wantsToPlay) publish({ playing: true, isBuffering: audio.readyState < 3 }); },
      pause: () => {
        // pause()/load() queue DOM events. A prior track's pause may arrive after
        // the same element has started its next track; trust its live state.
        if (audio.paused && (!wantsToPlay || !audio.ended)) publish({ playing: false, isBuffering: false });
      },
      waiting: () => { if (wantsToPlay) publish({ playing: !audio.paused, isBuffering: true }); },
      stalled: () => { if (wantsToPlay) publish({ playing: !audio.paused, isBuffering: true }); },
      timeupdate: () => { if (Number.isFinite(audio.currentTime)) savedTime = audio.currentTime; },
      error: fail,
      ended: () => {
        if (!wantsToPlay || index < 0) return;
        if (repeat === "single") {
          // The media element normally loops internally without dispatching ended.
          audio.currentTime = 0;
          savedTime = 0;
          play();
        } else if (index + 1 < tracks.length || repeat === "all") {
          selectTrack((index + 1) % tracks.length);
          play();
        } else {
          wantsToPlay = false;
          publish({ playing: false, isBuffering: false });
        }
      },
    };
    const bindings = Object.entries(events).map(([event, handler]) => {
      const guarded = () => { if (media === audio) handler(); };
      audio.addEventListener(event, guarded);
      return [event, guarded] as const;
    });
    removeEvents = () => { for (const [event, handler] of bindings) audio.removeEventListener(event, handler); };
    if (tracks[index]) {
      audio.src = tracks[index].uri;
      audio.load();
      if (savedTime > 0) {
        try { audio.currentTime = savedTime; } catch { /* A later seek waits for metadata. */ }
      }
    }
    return audio;
  }

  function selectTrack(next: number) {
    if (!Number.isInteger(next) || next < 0 || next >= tracks.length) throw new Error(playbackErrorMessage);
    ++request;
    cancelSeek?.();
    wantsToPlay = false;
    index = next;
    savedTime = 0;
    const existing = media;
    const audio = ensureMedia();
    if (existing) {
      audio.pause();
      audio.src = tracks[next].uri;
      audio.load();
    }
    publish({ playing: false, isBuffering: false });
  }

  function play() {
    if (!tracks[index]) return;
    const audio = ensureMedia();
    const token = ++request;
    wantsToPlay = true;
    publish({ playing: !audio.paused, isBuffering: true });
    try {
      // Always observe the promise: autoplay restrictions and decode failures reject it.
      void Promise.resolve(audio.play()).then(() => {
        if (media === audio && request === token && wantsToPlay) {
          publish({ playing: !audio.paused, isBuffering: false });
        }
      }).catch(() => {
        if (media === audio && request === token && wantsToPlay) fail();
      });
    } catch { if (request === token) fail(); }
  }

  function pause() {
    ++request;
    wantsToPlay = false;
    cancelSeek?.();
    media?.pause();
    publish({ playing: false, isBuffering: false });
  }

  const playlist: BrowserVoicePlaylist = {
    get currentIndex() { return index; },
    get currentTime() { return media && Number.isFinite(media.currentTime) ? media.currentTime : savedTime; },
    get playing() { return status.playing; },
    get currentStatus() { return { ...status }; },
    get loop() { return repeat; },
    set loop(value) {
      repeat = value;
      if (media) media.loop = value === "single";
    },
    get volume() { return volume; },
    set volume(value) {
      volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
      if (media) media.volume = volume;
    },
    play,
    pause,
    add(source) {
      tracks.push({ ...source });
      if (index < 0) selectTrack(0);
    },
    clear() {
      pause();
      tracks.length = 0;
      index = -1;
      savedTime = 0;
      if (media) { media.removeAttribute("src"); media.load(); }
    },
    skipTo(next) {
      const resume = wantsToPlay;
      selectTrack(next);
      if (resume) play();
    },
    seekTo(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0 || !tracks[index]) return Promise.reject(new Error(playbackErrorMessage));
      cancelSeek?.();
      const audio = ensureMedia();
      const apply = () => {
        const target = Number.isFinite(audio.duration) ? Math.min(seconds, audio.duration) : seconds;
        audio.currentTime = target;
        savedTime = target;
      };
      // Seeking to the beginning is valid before metadata and must not delay the initial play gesture.
      if (seconds === 0 || audio.readyState >= 1) {
        try { apply(); return Promise.resolve(); }
        catch { if (audio.readyState >= 1) return Promise.reject(new Error(playbackErrorMessage)); }
      }
      return new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timeout);
          audio.removeEventListener("loadedmetadata", loaded);
          audio.removeEventListener("error", failed);
          if (cancelSeek === canceled) cancelSeek = null;
          if (error) reject(error); else resolve();
        };
        const loaded = () => { try { apply(); finish(); } catch { finish(new Error(playbackErrorMessage)); } };
        const failed = () => finish(new Error(playbackErrorMessage));
        const canceled = () => finish(new Error("Voice seek canceled"));
        const timeout = setTimeout(failed, 15000);
        cancelSeek = canceled;
        audio.addEventListener("loadedmetadata", loaded);
        audio.addEventListener("error", failed);
      });
    },
    updateTrackName(trackIndex, name) {
      if (tracks[trackIndex]) tracks[trackIndex] = { ...tracks[trackIndex], name };
    },
    addListener(_event, listener) {
      listeners.add(listener);
      return { remove: () => { listeners.delete(listener); } };
    },
    destroy() {
      ++request;
      wantsToPlay = false;
      cancelSeek?.();
      if (media) {
        savedTime = Number.isFinite(media.currentTime) ? media.currentTime : savedTime;
        removeEvents?.();
        media.pause();
        media.removeAttribute("src");
        media.load();
        media = null;
        removeEvents = null;
      }
      status = { playing: false, isBuffering: false };
      listeners.clear();
      // Keep track definitions for React StrictMode's cleanup/re-setup cycle.
      // The next add, seek, or play recreates the element lazily.
    },
  };
  return playlist;
}
