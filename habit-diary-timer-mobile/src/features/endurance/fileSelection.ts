import { MAX_CUSTOM_MEDIA } from "./game";

export type EnduranceFileSelection = {
  knownKeys: string[];
  selectedKeys: string[];
};

/** Remember unchecked files while selecting newly available files up to the limit. */
export function reconcileEnduranceFileSelection(
  previous: EnduranceFileSelection,
  availableKeys: readonly string[],
): EnduranceFileSelection {
  const knownKeys = [...new Set(availableKeys)];
  const available = new Set(knownKeys);
  const known = new Set(previous.knownKeys);
  const selectedKeys = [...new Set(previous.selectedKeys)]
    .filter((key) => available.has(key))
    .slice(0, MAX_CUSTOM_MEDIA);
  for (const key of knownKeys) {
    if (selectedKeys.length >= MAX_CUSTOM_MEDIA) break;
    if (!known.has(key) && !selectedKeys.includes(key)) selectedKeys.push(key);
  }
  return { knownKeys, selectedKeys };
}

export function toggleEnduranceFileSelection(
  previous: EnduranceFileSelection,
  key: string,
): EnduranceFileSelection {
  if (!previous.knownKeys.includes(key)) return previous;
  const selectedKeys = previous.selectedKeys.includes(key)
    ? previous.selectedKeys.filter((selected) => selected !== key)
    : previous.selectedKeys.length < MAX_CUSTOM_MEDIA
      ? [...previous.selectedKeys, key]
      : previous.selectedKeys;
  return { ...previous, selectedKeys };
}

/** Replace the selection with a uniformly sized, unbiased sample of all files. */
export function randomizeEnduranceFileSelection(
  previous: EnduranceFileSelection,
  random: () => number = Math.random,
): EnduranceFileSelection {
  const knownKeys = [...new Set(previous.knownKeys)];
  if (knownKeys.length === 0) return { knownKeys, selectedKeys: [] };

  const count = 1 + Math.floor(random() * Math.min(knownKeys.length, MAX_CUSTOM_MEDIA));
  const candidates = [...knownKeys];
  // Partial Fisher–Yates draws from the entire pool, including files past the
  // selection limit. Keep knownKeys intact so reopening preserves exclusions.
  for (let index = 0; index < count; index++) {
    const chosen = index + Math.floor(random() * (candidates.length - index));
    [candidates[index], candidates[chosen]] = [candidates[chosen], candidates[index]];
  }
  return { knownKeys, selectedKeys: candidates.slice(0, count) };
}
