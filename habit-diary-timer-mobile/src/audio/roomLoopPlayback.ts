type RoomPlayer = {
  loop: boolean;
  pause(): void;
  play(): void;
  seekTo(seconds: number): Promise<void>;
};

/** The room owns disposal; a pause only suspends playback, never seeks. */
export function createRoomLoopPlayback(player: RoomPlayer) {
  let generation = 0;
  let initialized = false;
  return {
    async setPaused(paused: boolean) {
      const request = ++generation;
      player.pause();
      if (paused) return;
      player.loop = true;
      if (!initialized) {
        await player.seekTo(0);
        if (generation !== request) return;
        initialized = true;
      }
      if (generation === request) player.play();
    },
    // Cleanup may follow the native hook releasing its player. Invalidate
    // pending initialization without calling that released player again.
    cancelPending() { generation += 1; },
  };
}
