import { normalizeSearchText } from "@nino/shared/search";
import candidates from "./catalog.json";

export type FavoriteCategory =
  | "anime"
  | "game"
  | "vtuber"
  | "actress"
  | "performer";

export type FavoriteCandidate = {
  id: string;
  category: FavoriteCategory | "custom";
  name: string;
  work?: string;
};

export const favoriteCategories: readonly {
  value: FavoriteCategory;
  label: string;
}[] = [
  { value: "anime", label: "アニメ" },
  { value: "game", label: "ゲーム" },
  { value: "vtuber", label: "VTuber" },
  { value: "actress", label: "女優" },
  { value: "performer", label: "成人作品出演者" },
];

// Fixed suggestions coexist with manually added names; both keep their original IDs when saved.
// IDs are stored explicitly in JSON: reordering or renaming candidates must not change them.
// Names and work titles are proper nouns and are never passed through translation.
export const favoriteCatalog: readonly FavoriteCandidate[] = candidates as FavoriteCandidate[];
const candidateById = new Map(favoriteCatalog.map((candidate) => [candidate.id, candidate]));

export function favoriteCategoryLabel(category: FavoriteCandidate["category"]): string {
  return favoriteCategories.find((item) => item.value === category)?.label ?? "";
}

const manualFavoritePrefix = "manual-v1:";

export function createManualFavoriteId(name: string): string {
  return `${manualFavoritePrefix}${encodeURIComponent(name.trim())}`;
}

export function findFavorite(id: string): FavoriteCandidate | undefined {
  const fixed = candidateById.get(id);
  if (fixed) return fixed;
  if (!id.trim()) return undefined;
  if (id.startsWith(manualFavoritePrefix)) {
    try {
      const name = decodeURIComponent(id.slice(manualFavoritePrefix.length));
      if (name.trim()) return { id, category: "custom", name };
    } catch {
      // Preserve unsupported/malformed stored IDs visibly instead of losing a registration.
    }
  }
  return { id, category: "custom", name: id };
}

export function favoriteDisplayName(id: string): string {
  const candidate = findFavorite(id);
  return candidate ? candidate.work ? `${candidate.name}（${candidate.work}）` : candidate.name : id;
}

export function resolveFavorites(ids: readonly string[]): FavoriteCandidate[] {
  return [...new Set(ids)].flatMap((id) => {
    const candidate = findFavorite(id);
    return candidate ? [candidate] : [];
  });
}

export function filterFavorites(query: string, category: FavoriteCategory | "all" = "all"): FavoriteCandidate[] {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  return favoriteCatalog.filter((candidate) => {
    if (category !== "all" && candidate.category !== category) return false;
    const text = normalizeSearchText(`${candidate.name} ${candidate.work ?? ""} ${favoriteCategoryLabel(candidate.category)}`);
    return terms.every((term) => text.includes(term));
  });
}
