import type { RoomAudioScene } from "../../audio/roomAudio";
import { getCurrentTile, type SugorokuGame } from "./game";

export function getSugorokuAudioScene(game: SugorokuGame | null): RoomAudioScene {
  if (!game) return "sugoroku";
  const tile = getCurrentTile(game);
  if (tile.kind === "retire" || tile.kind === "penalty") return "sugoroku-penalty";
  if (tile.kind === "goal") return "sugoroku";
  if (tile.position !== null && (tile.position < 0 || tile.position >= 26)) return "sugoroku-zone";
  return "sugoroku";
}
