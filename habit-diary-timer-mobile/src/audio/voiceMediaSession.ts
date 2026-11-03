type Callbacks = {
  play(): void;
  pause(): void;
  stop(): void;
  next(): void;
  previous(): void;
};

export function createVoiceMediaSession(callbacks: Callbacks) {
  let metadata: MediaMetadata | null = null;
  const session = typeof navigator === "undefined" ? undefined : navigator.mediaSession;
  const actions: [MediaSessionAction, () => void][] = [
    ["play", callbacks.play], ["pause", callbacks.pause], ["stop", callbacks.stop],
    ["nexttrack", callbacks.next], ["previoustrack", callbacks.previous],
  ];
  const setAction = (action: MediaSessionAction, handler: (() => void) | null) => {
    try { session?.setActionHandler(action, handler); } catch { /* Optional browser API. */ }
  };
  const owns = () => !!session && !!metadata && session.metadata === metadata;
  function updateTitle(title: string) {
    if (!session || typeof MediaMetadata === "undefined") return;
    metadata = new MediaMetadata({ title, artist: "ボイス格納" });
    session.metadata = metadata;
  }
  return {
    activate(title: string) {
      if (!session) return;
      updateTitle(title);
      actions.forEach(([action, handler]) => setAction(action, () => { if (owns()) handler(); }));
      // Do not inherit seek handlers or the infinite duration of manual loops.
      ["seekto", "seekforward", "seekbackward"].forEach((action) => setAction(action as MediaSessionAction, null));
      try { session.setPositionState(); } catch { /* Optional browser API. */ }
      session.playbackState = "playing";
    },
    updateTitle(title: string) { if (owns()) updateTitle(title); },
    updatePlaying(playing: boolean) { if (owns()) session!.playbackState = playing ? "playing" : "paused"; },
    deactivate() {
      if (!owns()) return;
      actions.forEach(([action]) => setAction(action, null));
      session!.metadata = null;
      session!.playbackState = "none";
      metadata = null;
    },
  };
}
