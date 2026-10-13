import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerBuilderOptions, VideoPlayer } from "expo-video";
import { useAppVideoPlayer } from "./useAppVideoPlayer";

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" },
  audio: { shouldMixVideoAudio: false, loopAudioNames: [] as string[] },
  useVideoPlayer: vi.fn(),
  useLayoutEffect: vi.fn(),
}));
vi.mock("react", () => ({ useLayoutEffect: mocks.useLayoutEffect }));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-video", () => ({ useVideoPlayer: mocks.useVideoPlayer }));
vi.mock("./AudioProvider", () => ({ useAppAudio: () => mocks.audio }));

function makePlayer(initialMode = "auto") {
  let mode = initialMode;
  const changes: string[] = [];
  const player = {
    get audioMixingMode() { return mode; },
    set audioMixingMode(next: string) { changes.push(next); mode = next; },
    play: vi.fn(() => changes.push(`play:${mode}`)),
    pause: vi.fn(),
    release: vi.fn(),
    currentTime: 27,
    loop: false,
    muted: false,
    volume: 1,
  };
  return { player: player as unknown as VideoPlayer, changes };
}

function commit() {
  const [effect] = mocks.useLayoutEffect.mock.calls.at(-1)!;
  return effect();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.platform.OS = "android";
  mocks.audio.shouldMixVideoAudio = false;
  mocks.audio.loopAudioNames = [];
});

describe("video coexistence with app audio", () => {
  it("sets Android mixing before an initial setup starts playback and forwards Expo builder options", () => {
    const { player, changes } = makePlayer();
    mocks.audio.shouldMixVideoAudio = true;
    mocks.useVideoPlayer.mockImplementation((_source, setup) => { setup(player); return player; });
    const source = { uri: "local-video.mp4" };
    const builderOptions: PlayerBuilderOptions = {};
    const result = useAppVideoPlayer(source, (instance) => { instance.loop = true; instance.play(); }, builderOptions);
    expect(result).toBe(player);
    expect(mocks.useVideoPlayer).toHaveBeenCalledWith(source, expect.any(Function), builderOptions);
    expect(changes).toEqual(["mixWithOthers", "play:mixWithOthers"]);
    expect(player.loop).toBe(true);
    commit();
    expect(changes).toEqual(["mixWithOthers", "play:mixWithOthers"]);
  });

  it("tracks the shared audio policy on the same video without restarting or seeking it", () => {
    const { player, changes } = makePlayer();
    mocks.useVideoPlayer.mockReturnValue(player);
    const source = { uri: "local-video.mp4" };
    useAppVideoPlayer(source);
    commit();
    mocks.audio.shouldMixVideoAudio = true;
    expect(useAppVideoPlayer(source)).toBe(player);
    commit();
    useAppVideoPlayer(source);
    commit();
    expect(changes).toEqual(["mixWithOthers"]);
    mocks.audio.shouldMixVideoAudio = false;
    useAppVideoPlayer(source);
    expect(commit()).toBeUndefined();
    expect(changes).toEqual(["mixWithOthers", "auto"]);
    expect(player.currentTime).toBe(27);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.release).not.toHaveBeenCalled();
  });

  it("keeps mixing after manual loops stop while room audio remains, then restores auto after the room ends", () => {
    const { player, changes } = makePlayer();
    mocks.useVideoPlayer.mockReturnValue(player);
    mocks.audio.loopAudioNames = ["earLick"];
    mocks.audio.shouldMixVideoAudio = true;
    useAppVideoPlayer(123);
    commit();
    // The provider keeps the policy true for remaining room/session audio.
    mocks.audio.loopAudioNames = [];
    useAppVideoPlayer(123);
    commit();
    expect(changes).toEqual(["mixWithOthers"]);
    expect(player.audioMixingMode).toBe("mixWithOthers");
    mocks.audio.shouldMixVideoAudio = false;
    useAppVideoPlayer(123);
    commit();
    expect(changes).toEqual(["mixWithOthers", "auto"]);
    expect(player.pause).not.toHaveBeenCalled();
  });

  it("also configures a muted background video before playback so it cannot override an audible video's mixing mode", () => {
    const silent = makePlayer();
    const audible = makePlayer();
    mocks.audio.shouldMixVideoAudio = true;
    mocks.useVideoPlayer
      .mockImplementationOnce((_source, setup) => { setup(silent.player); return silent.player; })
      .mockImplementationOnce((_source, setup) => { setup(audible.player); return audible.player; });
    useAppVideoPlayer(123, (instance) => {
      instance.muted = true;
      instance.volume = 0;
      instance.loop = true;
      instance.play();
    });
    commit();
    useAppVideoPlayer(456, (instance) => instance.play());
    commit();
    expect(silent.changes).toEqual(["mixWithOthers", "play:mixWithOthers"]);
    expect(audible.changes).toEqual(["mixWithOthers", "play:mixWithOthers"]);
    expect(silent.player.muted).toBe(true);
    expect(silent.player.volume).toBe(0);
    expect(audible.player.muted).toBe(false);
    expect(audible.player.volume).toBe(1);
  });

  it("keeps Android's ordinary auto mode when no app audio needs coexistence", () => {
    const { player, changes } = makePlayer();
    mocks.useVideoPlayer.mockImplementation((_source, setup) => { setup(player); return player; });
    useAppVideoPlayer(123, (instance) => instance.play());
    commit();
    expect(changes).toEqual(["play:auto"]);
  });

  it.each(["ios", "web"])("preserves %s audio session behavior, including after the app audio policy changes", (platform) => {
    mocks.platform.OS = platform;
    const { player, changes } = makePlayer("doNotMix");
    mocks.audio.shouldMixVideoAudio = true;
    mocks.useVideoPlayer.mockImplementationOnce((_source, setup) => { setup(player); return player; });
    mocks.useVideoPlayer.mockReturnValue(player);
    useAppVideoPlayer(123, (instance) => instance.play());
    commit();
    mocks.audio.shouldMixVideoAudio = false;
    useAppVideoPlayer(123);
    commit();
    expect(changes).toEqual(["play:doNotMix"]);
    expect(player.audioMixingMode).toBe("doNotMix");
  });
});
