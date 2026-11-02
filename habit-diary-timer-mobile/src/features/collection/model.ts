import type { RewardRedemption } from "../../repositories/rewardRepository";

export const collectionCategories = [
  { key: "all", label: "すべて" },
  { key: "message", label: "メッセージ" },
  { key: "title", label: "称号" },
  { key: "outfit", label: "衣装" },
  { key: "video", label: "動画" },
  { key: "voice", label: "ボイス" },
  { key: "memory", label: "回想" },
  { key: "contract", label: "契約" },
] as const;

export type CollectionCategory = typeof collectionCategories[number]["key"];
export type CollectionEntry = { key: string; category: Exclude<CollectionCategory, "all"> };

export function rewardCategory(reward: Pick<RewardRedemption, "reward_key">): CollectionEntry["category"] {
  switch (reward.reward_key) {
    case "outfit": return "outfit";
    case "video": return "video";
    case "voice": return "voice";
    case "outside-loss-memory": return "memory";
    default: return "message";
  }
}

// IDs can be reused after a partial reset, and legacy rewards have no UUID.
// Include acquisition identity and the reset generation, not mutable UI labels.
export function rewardCollectionKey(reward: RewardRedemption, pointsResetAt: string) {
  return JSON.stringify(["reward", pointsResetAt, reward.id, reward.reward_key, reward.redeemed_at, reward.reward_content, reward.file_uri]);
}

export const titleCollectionKey = (name: string) => JSON.stringify(["title", name]);
export const milestoneCollectionKey = (id: string, pointsResetAt: string) => JSON.stringify(["milestone", pointsResetAt, id]);
export const contractCollectionKey = (signedAt: string) => JSON.stringify(["contract", signedAt]);

export function filterCollection(entries: readonly CollectionEntry[], category: CollectionCategory, onlyNew: boolean, seen: ReadonlySet<string>) {
  return entries.filter((entry) => (category === "all" || entry.category === category) && (!onlyNew || !seen.has(entry.key)));
}

export const COLLECTION_SEEN_SETTING_KEY = "collection-seen:v1";
export const collectionSeenDataError = "コレクションの確認状態を読み込めませんでした。";
export type CollectionSeenState = { version: 1; seen: string[] };

export function parseCollectionSeenState(raw: string | null): CollectionSeenState | null {
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(collectionSeenDataError); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(collectionSeenDataError);
  const state = value as CollectionSeenState;
  if (state.version !== 1 || !Array.isArray(state.seen)
    || !state.seen.every((key) => typeof key === "string" && key.length > 0)
    || new Set(state.seen).size !== state.seen.length) throw new Error(collectionSeenDataError);
  return { version: 1, seen: [...state.seen] };
}

/** This record is part of app_settings and therefore travels with saved games. */
export function validateCollectionSeenSettings(rows: Record<string, unknown>[]) {
  const matches = rows.filter((row) => row.setting_key === COLLECTION_SEEN_SETTING_KEY);
  if (matches.length > 1) throw new Error(collectionSeenDataError);
  for (const row of matches) {
    if (typeof row.setting_value !== "string") throw new Error(collectionSeenDataError);
    parseCollectionSeenState(row.setting_value);
  }
}
