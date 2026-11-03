import { normalizeSearchText } from "@nino/shared/search";
import type { StoredVoice } from "./library";

/** Filter an already scoped queue without reordering or changing playback. */
export function filterVoicesByName(voices: readonly StoredVoice[], search: string): StoredVoice[] {
  const query = normalizeSearchText(search).trim();
  if (!query) return [...voices];
  return voices.filter((voice) => normalizeSearchText(voice.name).includes(query)
    || normalizeSearchText(voice.originalName).includes(query));
}

/** Delete only currently visible selections, never IDs hidden by a filter. */
export function selectedVisibleVoices(voices: readonly StoredVoice[], selected: ReadonlySet<string>): StoredVoice[] {
  return voices.filter((voice) => selected.has(voice.id));
}
