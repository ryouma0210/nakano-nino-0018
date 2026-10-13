import { normalizeSearchText } from "@nino/shared/search";
import { createManualFavoriteId, favoriteCatalog, favoriteDisplayName, findFavorite, resolveFavorites, type FavoriteCandidate, type FavoriteCategory } from "./catalog";

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
  if (selected.some(sameDisplayName)) return { error: "このオカズはすでに選択されています。" };
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
