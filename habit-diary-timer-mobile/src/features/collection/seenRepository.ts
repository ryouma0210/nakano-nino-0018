import { execute, queryOne, transaction } from "@/database/client";
import { toDateTimeKey } from "@/utils/date";
import { COLLECTION_SEEN_SETTING_KEY, collectionSeenDataError, parseCollectionSeenState, type CollectionEntry, type CollectionSeenState } from "./model";

function load() {
  return parseCollectionSeenState(queryOne<{ setting_value: string }>(
    "SELECT setting_value FROM app_settings WHERE setting_key=?", [COLLECTION_SEEN_SETTING_KEY],
  )?.setting_value ?? null);
}

function save(state: CollectionSeenState) {
  execute(`INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
  [COLLECTION_SEEN_SETTING_KEY, JSON.stringify(state), toDateTimeKey()]);
}

export const collectionSeenRepository = {
  /** Nothing is marked read by opening this screen, including on the first visit. */
  sync(): CollectionSeenState {
    let state!: CollectionSeenState;
    transaction(() => {
      const current = load();
      state = current ?? { version: 1, seen: [] };
      if (!current) save(state);
    });
    return state;
  },

  markSeen(entries: readonly CollectionEntry[], keys: readonly string[]): CollectionSeenState {
    const available = new Set(entries.map((entry) => entry.key));
    if (keys.some((key) => !available.has(key))) throw new Error(collectionSeenDataError);
    let state!: CollectionSeenState;
    transaction(() => {
      const current = load();
      if (!current) throw new Error(collectionSeenDataError);
      state = { version: 1, seen: [...new Set([...current.seen, ...keys])] };
      if (state.seen.length !== current.seen.length) save(state);
    });
    return state;
  },

  pointsResetAt() {
    return queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key='points_reset_at'",
    )?.setting_value ?? "";
  },
};
