export type LoopMediaMetadata = { title: string; artist: string };
export type LoopMediaSession = {
  activate: (metadata: LoopMediaMetadata, stop: () => void) => () => void;
  updateMetadata: (metadata: LoopMediaMetadata) => void;
};

type BrowserSession = Pick<MediaSession, "metadata" | "playbackState" | "setActionHandler" | "setPositionState">;
const actions: MediaSessionAction[] = ["pause", "stop", "play", "seekto", "seekbackward", "seekforward", "previoustrack", "nexttrack"];

/** Own the manual mix directly, so Expo cannot republish an individual clip's duration. */
export function createBrowserLoopMediaSession(
  session: BrowserSession | undefined,
  makeMetadata: ((metadata: LoopMediaMetadata) => MediaMetadata) | undefined,
): LoopMediaSession {
  let owner: { metadata: MediaMetadata } | undefined;
  const owns = (candidate: typeof owner) => !!session && !!candidate && candidate === owner && session.metadata === candidate.metadata;
  const setAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try { session?.setActionHandler(action, handler); } catch { /* Browser support varies by action. */ }
  };
  const clearPosition = () => {
    try { session?.setPositionState(); } catch { /* Older browsers have no position API. */ }
  };

  return {
    activate(metadata, stop) {
      if (!session || !makeMetadata) return () => {};
      const current = { metadata: makeMetadata(metadata) };
      owner = current;
      session.metadata = current.metadata;
      session.playbackState = "playing";
      const stopAll = () => { if (owns(current)) stop(); };
      actions.forEach((action) => setAction(action, action === "pause" || action === "stop" ? stopAll : null));
      // Empty position state lets browsers infer a finite duration from <audio>.
      // An unbounded live duration prevents that fallback without exposing clip time.
      try { session.setPositionState({ duration: Infinity, position: 0, playbackRate: 1 }); }
      catch { clearPosition(); }
      return () => {
        if (!owns(current)) return;
        owner = undefined;
        actions.forEach((action) => setAction(action, null));
        session.metadata = null;
        session.playbackState = "none";
        clearPosition();
      };
    },
    updateMetadata(metadata) {
      if (!session || !makeMetadata || !owns(owner)) return;
      owner!.metadata = makeMetadata(metadata);
      session.metadata = owner!.metadata;
    },
  };
}
