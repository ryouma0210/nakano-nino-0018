type LoopPlayer = {
  loop: boolean;
  volume: number;
  pause: () => void;
  play: () => void;
  seekTo: (seconds: number) => Promise<void>;
};

export function createLoopPlayback(players: readonly LoopPlayer[]) {
  const requests = new Map<LoopPlayer, number>();

  const invalidate = (player: LoopPlayer) => {
    const request = (requests.get(player) ?? 0) + 1;
    requests.set(player, request);
    return request;
  };
  const cancelPending = () => { players.forEach(invalidate); };
  const pauseAndReset = (player: LoopPlayer) => {
    player.pause();
    player.seekTo(0).catch(console.error);
  };

  return {
    cancelPending,
    stop(player?: LoopPlayer) {
      const stoppedPlayers = player ? [player] : players;
      stoppedPlayers.forEach((stopped) => {
        invalidate(stopped);
        pauseAndReset(stopped);
      });
    },
    play(player: LoopPlayer, volume: number) {
      const currentRequest = invalidate(player);
      player.pause();
      player.loop = true;
      player.volume = volume;
      player.seekTo(0).then(() => {
        // Stopping or replaying this loop invalidates only its pending start.
        if (requests.get(player) === currentRequest) player.play();
      }).catch(console.error);
    },
  };
}
