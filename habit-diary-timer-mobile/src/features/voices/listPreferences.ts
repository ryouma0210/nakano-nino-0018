export const VOICE_LIST_PREFERENCES_KEY = "voice-list-preferences:v1";
export type VoiceColumns = 1 | 2 | 3;

export function parseVoiceColumns(raw: string | null): VoiceColumns {
  let value: unknown;
  try { value = raw === null ? null : JSON.parse(raw); } catch { return 1; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return 1;
  const saved = value as Record<string, unknown>;
  return saved.version === 1 && (saved.columns === 1 || saved.columns === 2 || saved.columns === 3) ? saved.columns : 1;
}

type PreferenceStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

export function createVoiceListPreferenceStore(storage: PreferenceStorage) {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    async load() {
      await pending;
      return parseVoiceColumns(await storage.getItem(VOICE_LIST_PREFERENCES_KEY));
    },
    save(columns: VoiceColumns) {
      const payload = JSON.stringify({ version: 1, columns });
      const operation = pending.then(() => storage.setItem(VOICE_LIST_PREFERENCES_KEY, payload));
      pending = operation.catch(() => undefined);
      return operation;
    },
  };
}
