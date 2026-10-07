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
