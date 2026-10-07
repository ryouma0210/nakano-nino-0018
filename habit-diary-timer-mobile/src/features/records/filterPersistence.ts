import { emptyRecordFilters, sanitizeRecordFilters, type RecordFilters } from "./filters";

type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };
type Snapshot = { filters: RecordFilters; ready: boolean; storageError: string };

/** Hydration never writes defaults, and edits made during loading take precedence. */
export function createRecordFilterStore(
  storage: Storage, key: string, allowedTypes: readonly string[], supportsTags: boolean,
  initialRoute: Partial<RecordFilters> | null = null,
) {
  let route = initialRoute;
  let edits: Partial<RecordFilters> = {};
  let snapshot: Snapshot = { filters: sanitizeRecordFilters(route, allowedTypes, supportsTags), ready: false, storageError: "" };
  let loadPromise: Promise<void> | null = null;
  let writeQueue = Promise.resolve();
  const listeners = new Set<() => void>();
  const emit = (next: Snapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
  const save = () => {
    const serialized = JSON.stringify(snapshot.filters);
    writeQueue = writeQueue.then(async () => {
      try {
        await storage.setItem(key, serialized);
        if (snapshot.storageError) emit({ ...snapshot, storageError: "" });
      } catch {
        emit({ ...snapshot, storageError: "検索条件を保存できませんでした。この画面では引き続き検索できます。" });
      }
    });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load() {
      if (loadPromise) return loadPromise;
      loadPromise = (async () => {
        let saved: unknown = null;
        let storageError = "";
        try {
          const serialized = await storage.getItem(key);
          if (serialized) saved = JSON.parse(serialized);
        } catch {
          storageError = "前回の検索条件を読み込めませんでした。条件を入力して検索できます。";
        }
        const base = route ?? saved;
        const filters = sanitizeRecordFilters({ ...sanitizeRecordFilters(base, allowedTypes, supportsTags), ...edits }, allowedTypes, supportsTags);
        emit({ filters, ready: true, storageError });
        if (route || Object.keys(edits).length > 0) save();
        edits = {};
      })();
      return loadPromise;
    },
    update(patch: Partial<RecordFilters>) {
      if (!snapshot.ready) edits = { ...edits, ...patch };
      emit({ ...snapshot, filters: sanitizeRecordFilters({ ...snapshot.filters, ...patch }, allowedTypes, supportsTags) });
      if (snapshot.ready) save();
    },
    applyRoute(next: Partial<RecordFilters>) {
      route = next;
      edits = {};
      emit({ ...snapshot, filters: sanitizeRecordFilters(next, allowedTypes, supportsTags) });
      if (snapshot.ready) save();
    },
    clear() {
      this.update(emptyRecordFilters);
    },
    flush: () => writeQueue,
  };
}
