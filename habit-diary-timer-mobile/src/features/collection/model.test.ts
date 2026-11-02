import { describe, expect, it } from "vitest";
import { COLLECTION_SEEN_SETTING_KEY, contractCollectionKey, filterCollection, milestoneCollectionKey, parseCollectionSeenState, rewardCategory, rewardCollectionKey, titleCollectionKey, validateCollectionSeenSettings, type CollectionEntry } from "./model";
import type { RewardRedemption } from "../../repositories/rewardRepository";

const reward: RewardRedemption = { id: 1, reward_key: "voice", reward_name: "Voice", points_spent: 5000, reward_content: "saved content", file_uri: null, redeemed_at: "2026-11-02 12:00:00" };

describe("collection categories and item identity", () => {
  it.each([["outfit", "outfit"], ["video", "video"], ["voice", "voice"], ["outside-loss-memory", "memory"], ["praise", "message"], ["secret", "message"], ["legacy", "message"]])("maps %s to %s", (reward_key, expected) => {
    expect(rewardCategory({ reward_key })).toBe(expected);
  });

  it("treats reused IDs, later acquisitions, different contents and reset generations as separate items", () => {
    const old = rewardCollectionKey(reward, "");
    expect(rewardCollectionKey({ ...reward }, "")).toBe(old);
    expect(rewardCollectionKey({ ...reward, reward_name: "Translated name" }, "")).toBe(old);
    for (const changed of [
      { ...reward, redeemed_at: "2026-11-03 12:00:00" }, { ...reward, reward_content: "different" },
      { ...reward, reward_key: "video" }, { ...reward, file_uri: "another-asset" }, { ...reward, id: 2 },
    ]) expect(rewardCollectionKey(changed, "")).not.toBe(old);
    expect(rewardCollectionKey(reward, "2026-11-02 12:01:00")).not.toBe(old);
    expect(milestoneCollectionKey("points-100", "after-reset")).not.toBe(milestoneCollectionKey("points-100", ""));
    expect(contractCollectionKey("later")).not.toBe(contractCollectionKey("earlier"));
    expect(titleCollectionKey("name")).not.toBe(contractCollectionKey("name"));
  });

  it("combines category and unread filters without mutating the collection or forgetting hidden NEW items", () => {
    const entries: CollectionEntry[] = [
      { key: "old-message", category: "message" }, { key: "new-message", category: "message" },
      { key: "voice", category: "voice" }, { key: "video", category: "video" },
    ];
    const seen = new Set(["old-message", "video"]);
    expect(filterCollection(entries, "all", false, seen)).toEqual(entries);
    expect(filterCollection(entries, "message", false, seen).map((entry) => entry.key)).toEqual(["old-message", "new-message"]);
    expect(filterCollection(entries, "message", true, seen).map((entry) => entry.key)).toEqual(["new-message"]);
    expect(filterCollection(entries, "all", true, seen).map((entry) => entry.key)).toEqual(["new-message", "voice"]);
    expect(filterCollection(entries, "outfit", true, seen)).toEqual([]);
    expect(entries).toHaveLength(4);
    expect([...seen]).toEqual(["old-message", "video"]);
  });
});

describe("collection read-state backup validation", () => {
  it("accepts older backups with no collection state and current state", () => {
    expect(parseCollectionSeenState(null)).toBeNull();
    expect(() => validateCollectionSeenSettings([])).not.toThrow();
    const state = { version: 1, seen: [rewardCollectionKey(reward, ""), titleCollectionKey("A")] };
    expect(parseCollectionSeenState(JSON.stringify(state))).toEqual(state);
    expect(() => validateCollectionSeenSettings([{ setting_key: COLLECTION_SEEN_SETTING_KEY, setting_value: JSON.stringify(state) }])).not.toThrow();
  });
  it.each(["broken", "null", "[]", "{}", '{"version":2,"seen":[]}', '{"version":1,"seen":[1]}', '{"version":1,"seen":[""]}', '{"version":1,"seen":["a","a"]}'])("rejects invalid data without silently clearing it: %s", (raw) => {
    expect(() => parseCollectionSeenState(raw)).toThrow("コレクション");
  });
  it("rejects duplicate backup rows and non-string values", () => {
    const row = { setting_key: COLLECTION_SEEN_SETTING_KEY, setting_value: '{"version":1,"seen":[]}' };
    expect(() => validateCollectionSeenSettings([row, row])).toThrow("コレクション");
    expect(() => validateCollectionSeenSettings([{ ...row, setting_value: null }])).toThrow("コレクション");
  });
});
