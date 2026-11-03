import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { createVoiceListPreferenceStore, type VoiceColumns } from "./listPreferences";

const store = createVoiceListPreferenceStore(AsyncStorage);

export function useVoiceListPreferences() {
  const [columns, setColumns] = useState<VoiceColumns>(1);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<"load" | "save" | null>(null);
  const current = useRef<VoiceColumns>(1);
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
      setColumns(saved);
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

  const persist = useCallback(async (next: VoiceColumns) => {
    const request = ++version.current;
    setError(null);
    try { await store.save(next); }
    catch { if (mounted.current && request === version.current) setError("save"); }
  }, []);

  const update = useCallback((next: VoiceColumns) => {
    if (!ready.current) return;
    current.current = next;
    setColumns(next);
    void persist(next);
  }, [persist]);

  const retry = useCallback(() => {
    if (ready.current) void persist(current.current);
    else void load();
  }, [load, persist]);

  return { columns, hydrated, error, update, retry };
}
