import { describe, expect, it } from "vitest";
import { createManualFavoriteId, favoriteCatalog, favoriteCategories, favoriteCategoryLabel, favoriteDisplayName, filterFavorites, findFavorite, resolveFavorites } from "./catalog";

describe("favorite catalog", () => {
  it("keeps all supplied candidates with unique stable IDs and no duplicates within a work", () => {
    expect(favoriteCategories.map(({ value }) => favoriteCatalog.filter((item) => item.category === value).length))
      .toEqual([70, 45, 48]);
    expect(new Set(favoriteCatalog.map((item) => item.id)).size).toBe(163);
    expect(new Set(favoriteCatalog.map((item) => `${item.category}:${item.name}:${item.work ?? ""}`)).size).toBe(163);
    expect(favoriteCatalog.every((item) => favoriteCategories.some((category) => category.value === item.category))).toBe(true);
    expect(favoriteCatalog.filter((item) => item.category === "anime").every((item) => item.work)).toBe(true);
  });

  it("distinguishes the two Ram characters and registers the corrected character", () => {
    const ram = favoriteCatalog.filter((item) => item.name === "ラム");
    expect(ram.map((item) => item.work)).toEqual(["うる星やつら", "Re:ゼロから始める異世界生活"]);
    expect(ram[0].id).not.toBe(ram[1].id);
    expect(favoriteCatalog.find((item) => item.name === "玉葉妃")?.work).toBe("薬屋のひとりごと");
    expect(favoriteCatalog.some((item) => item.name === "壬氏")).toBe(false);
  });

  it("searches names, works and categories with normalized width and case", () => {
    expect(filterFavorites("ｊＵＬＩＡ").map((item) => item.name)).toEqual(["Julia"]);
    expect(filterFavorites("ｏｎｅ　ｐｉｅｃｅ").map((item) => item.name)).toHaveLength(5);
    expect(filterFavorites("ラム ゼロ").map((item) => item.work)).toEqual(["Re:ゼロから始める異世界生活"]);
    expect(filterFavorites("女優", "anime")).toEqual([]);
    expect(filterFavorites("  ", "actress")).toHaveLength(45);
  });

  it("resolves rankings in the selected order and preserves unknown registrations without repeated IDs", () => {
    expect(resolveFavorites(["anime-002", "missing", "actress-001", "anime-002"]))
      .toEqual([findFavorite("anime-002"), { id: "missing", category: "custom", name: "missing" }, findFavorite("actress-001")]);
  });

  it("round-trips trimmed manual names without normalizing their spelling or Unicode", () => {
    const name = "  Ｓａｍｐｌｅ Person / 雪 & 花 % 🐾  ";
    const id = createManualFavoriteId(name);
    expect(id).toBe(`manual-v1:${encodeURIComponent(name.trim())}`);
    expect(findFavorite(id)).toEqual({ id, category: "custom", name: name.trim() });
    expect(favoriteDisplayName(id)).toBe(name.trim());
    expect(favoriteCategoryLabel("custom")).toBe("");
    expect(resolveFavorites([id, "anime-002", id]).map((candidate) => candidate.name)).toEqual([name.trim(), "中野二乃"]);
  });

  it("keeps malformed or future stored IDs visible rather than silently dropping them", () => {
    for (const id of ["manual-v1:%not-encoded", "manual-v1:", "manual-v2:future", "retired-catalog-id"]) {
      expect(findFavorite(id)).toEqual({ id, category: "custom", name: id });
    }
    expect(findFavorite("")).toBeUndefined();
    expect(resolveFavorites(["", " "])).toEqual([]);
  });
});
