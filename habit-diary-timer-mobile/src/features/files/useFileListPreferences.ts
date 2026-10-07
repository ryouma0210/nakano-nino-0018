import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileListPreferenceStore, DEFAULT_FILE_LIST_PREFERENCES, type FileListPreferences } from "./fileListPreferences";

const store = createFileListPreferenceStore(AsyncStorage);

export function useFileListPreferences() {
  const [preferences, setPreferences] = useState({ ...DEFAULT_FILE_LIST_PREFERENCES });
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<"load" | "save" | null>(null);
  const current = useRef(preferences);
  const ready = useRef(false);
  const mounted = useRef(false);
  const version = useRef(0);
  const invalidate = useCallback(() => { version.current++; }, []);

  const load = useCallback(async () => {
    const request = ++version.current;
    setError(null);
    try {
      const saved = await store.load();
      if (!mounted.current || request !== version.current) return;
      current.current = saved;
      ready.current = true;
      setPreferences(saved);
      setHydrated(true);
    } catch {
      if (mounted.current && request === version.current) setError("load");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; invalidate(); };
  }, [invalidate, load]);

  const persist = useCallback(async (next: FileListPreferences) => {
    const request = ++version.current;
    setError(null);
    try { await store.save(next); }
    catch {
      if (mounted.current && request === version.current) setError("save");
    }
  }, []);

  const update = useCallback((patch: Partial<FileListPreferences>) => {
    // Never persist the initial defaults before the user's saved preferences load.
    if (!ready.current) return;
    const next = { ...current.current, ...patch };
    current.current = next;
    setPreferences(next);
    void persist(next);
  }, [persist]);

  const retry = useCallback(() => {
    if (ready.current) void persist(current.current);
    else void load();
  }, [load, persist]);

  return { preferences, hydrated, error, update, retry };
}
