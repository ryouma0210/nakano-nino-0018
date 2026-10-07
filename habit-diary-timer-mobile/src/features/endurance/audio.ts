import type { RoomAudioScene } from "../../audio/roomAudio";
import type { CountdownState } from "../sugoroku/countdown";
import type { EnduranceGame } from "./game";

type TimerGame = Pick<EnduranceGame, "preset" | "recovering"> | null;

export function getEnduranceTimerMode(game: TimerGame): "slide" | "recovery" | null {
  if (!game || game.preset === "game-6") return null;
  return game.recovering ? "recovery" : "slide";
}

export function getEnduranceAudioScene(
  game: TimerGame,
  active: boolean,
  slideStatus: CountdownState["status"],
  recoveryStatus: CountdownState["status"],
): RoomAudioScene | null {
  if (!active) return null;
  const mode = getEnduranceTimerMode(game);
  // Only the timer belonging to the current mode may enable room or video audio.
  if (mode === "recovery") return recoveryStatus === "running" ? "endurance-recovery" : null;
  return mode === "slide" && slideStatus === "running" ? "endurance" : null;
}
