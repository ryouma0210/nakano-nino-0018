import type { EnduranceMediaItem } from "./media";

/** A missing saved ID invalidates the whole resolution; never shorten or reshuffle a game. */
export function resolveEnduranceMedia(
  ids: readonly string[], available: readonly EnduranceMediaItem[],
): EnduranceMediaItem[] | null {
  const byId = new Map(available.map((item) => [item.id, item]));
  const ordered: EnduranceMediaItem[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) return null;
    ordered.push(item);
  }
  return ordered;
}
