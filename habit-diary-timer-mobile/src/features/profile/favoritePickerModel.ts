import { normalizeSearchText } from "@nino/shared/search";
import { createManualFavoriteId, favoriteCatalog, favoriteCategories, favoriteDisplayName, findFavorite, resolveFavorites, type FavoriteCandidate, type FavoriteCategory } from "./catalog";

const fixedCandidateIds = favoriteCatalog.map((candidate) => candidate.id);

export function favoritePickerCandidates(
  selected: readonly string[],
  candidateIds: readonly string[],
  query: string,
  category: FavoriteCategory | "all" = "all",
): FavoriteCandidate[] {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  return resolveFavorites([...fixedCandidateIds, ...candidateIds, ...selected]).filter((candidate) => {
    if (category !== "all" && candidate.category !== category) return false;
    const displayName = normalizeSearchText(favoriteDisplayName(candidate.id));
    return terms.every((term) => displayName.includes(term));
  });
}

export type FavoritePickerSection = {
  key: FavoriteCandidate["category"];
  title: string;
  data: FavoriteCandidate[][];
};

export function favoritePickerSections(candidates: readonly FavoriteCandidate[]): FavoritePickerSection[] {
  const groups = new Map<FavoriteCandidate["category"], FavoriteCandidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.category) ?? [];
    group.push(candidate);
    groups.set(candidate.category, group);
  }
  return [...favoriteCategories, { value: "custom" as const, label: "手入力" }].flatMap(({ value, label }) => {
    const group = groups.get(value);
    if (!group?.length) return [];
    const rows: FavoriteCandidate[][] = [];
    for (let index = 0; index < group.length; index += 2) rows.push(group.slice(index, index + 2));
    return [{ key: value, title: label, data: rows }];
  });
}

export type AddManualFavoriteResult = {
  addedName: string;
  selected: string[];
  candidateIds: string[];
} | { error: string };

export function addManualFavorite(
  input: string,
  selected: readonly string[],
  candidateIds: readonly string[],
): AddManualFavoriteResult {
  const name = input.trim();
  if (!name) return { error: "名前を入力してください。" };
  if (name.length > 100) return { error: "100文字以内で入力してください。" };
  const normalized = normalizeSearchText(name);
  const sameDisplayName = (id: string) => normalizeSearchText(favoriteDisplayName(id)).trim() === normalized;
  if (selected.some(sameDisplayName)) return { error: "この推しはすでに選択されています。" };
  let id: string;
  try {
    // Re-select matching saved/fixed suggestions instead of adding an alias of the same display name.
    id = [...candidateIds, ...fixedCandidateIds].find(sameDisplayName) ?? createManualFavoriteId(name);
  } catch {
    return { error: "名前を入力してください。" };
  }
  return {
    addedName: findFavorite(id)?.name ?? name,
    selected: [...selected, id],
    candidateIds: [...new Set([...candidateIds, id])],
  };
}
