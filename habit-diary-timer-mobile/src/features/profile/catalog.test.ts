import { describe, expect, it } from "vitest";
import { createManualFavoriteId, favoriteCatalog, favoriteCategories, favoriteCategoryLabel, favoriteDisplayName, filterFavorites, findFavorite, resolveFavorites } from "./catalog";

describe("favorite catalog", () => {
  it("populates every category with unique IDs and no duplicates within a work", () => {
    expect(favoriteCategories.map(({ value }) => value)).toEqual(["anime", "game", "vtuber", "actress", "performer"]);
    for (const { value } of favoriteCategories) {
      expect(favoriteCatalog.some((item) => item.category === value)).toBe(true);
    }
    expect(new Set(favoriteCatalog.map((item) => item.id)).size).toBe(favoriteCatalog.length);
    expect(new Set(favoriteCatalog.map((item) => `${item.category}:${item.name}:${item.work ?? ""}`)).size).toBe(favoriteCatalog.length);
    expect(favoriteCatalog.every((item) => favoriteCategories.some((category) => category.value === item.category))).toBe(true);
    expect(favoriteCatalog.every((item) => item.id.trim() && item.name.trim())).toBe(true);
    expect(favoriteCatalog.filter((item) => ["anime", "game", "vtuber"].includes(item.category))
      .every((item) => item.work?.trim())).toBe(true);
  });

  it("keeps legacy saved IDs resolvable and anchors expanded candidates to their stored IDs", () => {
    for (const [category, count] of Object.entries({ anime: 70, actress: 45, performer: 48 })) {
      for (let number = 1; number <= count; number++) {
        const id = `${category}-${String(number).padStart(3, "0")}`;
        expect(findFavorite(id)).toMatchObject({ id, category });
      }
    }
    const anchors = [
      { id: "anime-002", category: "anime", name: "中野二乃", work: "五等分の花嫁" },
      { id: "anime-295", category: "anime", name: "上杉らいは", work: "五等分の花嫁" },
      { id: "anime-071", category: "anime", name: "高木さん", work: "からかい上手の高木さん" },
      { id: "anime-077", category: "anime", name: "ロキシー・ミグルディア", work: "無職転生" },
      { id: "game-001", category: "game", name: "カスミ", work: "ポケットモンスター" },
      { id: "game-087", category: "game", name: "蛍", work: "原神" },
      { id: "game-147", category: "game", name: "三月なのか", work: "崩壊：スターレイル" },
      { id: "game-187", category: "game", name: "アスナ", work: "ブルーアーカイブ" },
      { id: "vtuber-001", category: "vtuber", name: "ときのそら", work: "ホロライブ" },
      { id: "vtuber-042", category: "vtuber", name: "月ノ美兎", work: "にじさんじ" },
      { id: "vtuber-089", category: "vtuber", name: "花芽すみれ", work: "ぶいすぽっ！" },
      { id: "actress-001", category: "actress", name: "橋本環奈" },
      { id: "performer-001", category: "performer", name: "三上悠亜" },
    ];
    for (const candidate of anchors) expect(findFavorite(candidate.id)).toEqual(candidate);
  });

  it("distinguishes the two Ram characters and registers the corrected character", () => {
    const ram = favoriteCatalog.filter((item) => item.name === "ラム");
    expect(ram.map((item) => item.work)).toEqual(["うる星やつら", "Re:ゼロから始める異世界生活"]);
    expect(ram[0].id).not.toBe(ram[1].id);
    expect(favoriteCatalog.find((item) => item.name === "玉葉妃")?.work).toBe("薬屋のひとりごと");
    expect(favoriteCatalog.some((item) => item.name === "壬氏")).toBe(false);
  });

  it("keeps same-named characters distinct across works and categories", () => {
    expect(favoriteCatalog.filter((item) => item.name === "アスナ")).toEqual([
      { id: "anime-052", category: "anime", name: "アスナ", work: "ソードアート・オンライン" },
      { id: "game-014", category: "game", name: "アスナ", work: "ポケットモンスター" },
      { id: "game-187", category: "game", name: "アスナ", work: "ブルーアーカイブ" },
    ]);
    expect(favoriteCatalog.filter((item) => item.name === "イオリ" && item.work === "ブルーアーカイブ"))
      .toEqual([{ id: "game-201", category: "game", name: "イオリ", work: "ブルーアーカイブ" }]);
  });

  it("searches names, works and categories with normalized width and case", () => {
    expect(filterFavorites("ｊＵＬＩＡ").map((item) => item.name)).toEqual(["Julia"]);
    expect(filterFavorites("ｏｎｅ　ｐｉｅｃｅ").map((item) => item.name)).toHaveLength(5);
    expect(filterFavorites("ラム ゼロ").map((item) => item.work)).toEqual(["Re:ゼロから始める異世界生活"]);
    expect(filterFavorites("女優", "anime")).toEqual([]);
    expect(filterFavorites("  ", "actress")).toHaveLength(45);
    expect(filterFavorites("原神 蛍", "game").map((item) => item.id)).toEqual(["game-087"]);
    expect(filterFavorites("月ノ にじ", "vtuber").map((item) => item.id)).toEqual(["vtuber-042"]);
    expect(filterFavorites("ｖＴＵＢＥＲ")).toEqual(favoriteCatalog.filter((item) => item.category === "vtuber"));
    expect(filterFavorites("ゲーム")).toEqual(favoriteCatalog.filter((item) => item.category === "game"));
    expect(filterFavorites("原神", "vtuber")).toEqual([]);
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
