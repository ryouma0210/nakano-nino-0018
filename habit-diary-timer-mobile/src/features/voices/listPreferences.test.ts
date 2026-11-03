import { describe, expect, it, vi } from "vitest";
import { createVoiceListPreferenceStore, parseVoiceColumns, VOICE_LIST_PREFERENCES_KEY } from "./listPreferences";

describe("voice list column preferences", () => {
  it.each([1, 2, 3])("restores %s columns without persisting search or deletion selections", (columns) => {
    expect(parseVoiceColumns(JSON.stringify({ version: 1, columns, search: "private", selected: ["one"] }))).toBe(columns);
  });
  it.each([null, "{", "null", "[]", '{"version":2,"columns":3}', '{"version":1,"columns":"2"}', '{"version":1,"columns":10}'])
    ("falls back to one column for invalid preferences: %s", (raw) => { expect(parseVoiceColumns(raw)).toBe(1); });
  it("loads from a voice-only key without writing defaults", async () => {
    const storage = { getItem: vi.fn().mockResolvedValue('{"version":1,"columns":2}'), setItem: vi.fn() };
    expect(await createVoiceListPreferenceStore(storage).load()).toBe(2);
    expect(storage.getItem).toHaveBeenCalledWith(VOICE_LIST_PREFERENCES_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("serializes quick changes and reloads the latest saved value", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let saved: string | null = null;
    let calls = 0;
    const store = createVoiceListPreferenceStore({
      getItem: async () => saved,
      setItem: async (_key, value) => { if (++calls === 1) await pending; saved = value; },
    });
    const first = store.save(2); const second = store.save(3); const reloaded = store.load();
    release();
    await Promise.all([first, second]);
    expect(await reloaded).toBe(3);
    expect(JSON.parse(saved!)).toEqual({ version: 1, columns: 3 });
  });
  it("propagates a storage error and permits retry", async () => {
    const setItem = vi.fn().mockRejectedValueOnce(new Error("full")).mockResolvedValue(undefined);
    const store = createVoiceListPreferenceStore({ getItem: vi.fn().mockResolvedValue(null), setItem });
    await expect(store.save(2)).rejects.toThrow("full");
    await expect(store.save(2)).resolves.toBeUndefined();
  });
});
