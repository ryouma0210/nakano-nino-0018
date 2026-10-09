import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRecordFilterStore } from "./filterPersistence";
import { hasRecordFilters, recordFilterError, recordFiltersFromParams } from "./filters";

const noTypes: readonly string[] = [];

export function usePersistentRecordFilters(screen: string, allowedTypes: readonly string[] = noTypes, supportsTags = false) {
  const params = useLocalSearchParams();
  const route = recordFiltersFromParams(params);
  const routeKey = JSON.stringify(route);
  const lastRouteKey = useRef(routeKey);
  const [store] = useState(() => createRecordFilterStore(AsyncStorage,
    `nino-room:record-filters:${screen}:v1`, allowedTypes, supportsTags, route));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.load(); }, [store]);
  useEffect(() => {
    if (lastRouteKey.current === routeKey) return;
    lastRouteKey.current = routeKey;
    const next = JSON.parse(routeKey);
    if (next) store.applyRoute(next);
  }, [routeKey, store]);
  return { ...snapshot, update: store.update, clear: () => store.clear(),
    active: hasRecordFilters(snapshot.filters), error: recordFilterError(snapshot.filters) };
}
