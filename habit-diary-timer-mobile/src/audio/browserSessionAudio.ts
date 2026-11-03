/** A foreground player whose own stop/dispose cancels pending browser starts. */
export function createBrowserSessionAudio(
  uri: string,
  reportError: (error: unknown) => void,
  createAudio: () => HTMLAudioElement = () => new Audio(),
) {
  const media = createAudio();
  media.src = uri;
  media.preload = "auto";
  let generation = 0;
  let disposed = false;
  return {
    get volume() { return media.volume; },
    set volume(value: number) { media.volume = value; },
    get loop() { return media.loop; },
    set loop(value: boolean) { media.loop = value; },
    play() {
      if (disposed) return;
      const request = ++generation;
      try {
        // Expo's Web player discards this promise, making a normal pause an
        // uncaught rejection. Own this element so cancellation is observable.
        const pending = media.play();
        pending?.catch((error: unknown) => {
          const canceled = error instanceof Error && error.name === "AbortError" && (disposed || generation !== request);
          if (!canceled) reportError(error);
        });
      } catch (error) { reportError(error); }
    },
    pause() {
      generation += 1;
      if (!disposed) media.pause();
    },
    async seekTo(seconds: number) {
      if (!disposed) media.currentTime = seconds;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      media.pause();
      media.removeAttribute("src");
      media.load();
    },
  };
}
