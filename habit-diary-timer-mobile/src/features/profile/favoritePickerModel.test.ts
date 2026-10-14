import { describe, expect, it } from "vitest";
import { createManualFavoriteId, favoriteCatalog, favoriteDisplayName, type FavoriteCandidate } from "./catalog";
import { addManualFavorite, favoritePickerCandidates, favoritePickerSections } from "./favoritePickerModel";

describe("fixed and manual favorite picker", () => {
  it("always offers all 163 fixed suggestions alongside saved and new manual items, deduplicated by ID", () => {
    expect(favoritePickerCandidates([], [], "")).toEqual(favoriteCatalog);
    const manual = createManualFavoriteId("Sample Person");
    expect(favoritePickerCandidates(["anime-002", manual], ["anime-002"], "").map((candidate) => candidate.id))
      .toEqual([...favoriteCatalog.map((candidate) => candidate.id), manual]);
    const combined = favoritePickerCandidates([manual, "unknown-saved"], [manual, "anime-002", "unknown-saved"], "");
    expect(combined).toHaveLength(165);
    expect(new Set(combined.map((candidate) => candidate.id)).size).toBe(165);
    expect(combined.filter((candidate) => candidate.name === "ラム").map((candidate) => candidate.work))
      .toEqual(["うる星やつら", "Re:ゼロから始める異世界生活"]);
  });

  it("filters fixed categories while leaving manually added items available under all", () => {
    const manual = createManualFavoriteId("Sample Person");
    expect(favoritePickerCandidates([manual], [manual], "", "anime")).toHaveLength(70);
    expect(favoritePickerCandidates([manual], [manual], "", "actress")).toHaveLength(45);
    expect(favoritePickerCandidates([manual], [manual], "", "performer")).toHaveLength(48);
    expect(favoritePickerCandidates([manual], [manual], "sample", "anime")).toEqual([]);
    expect(favoritePickerCandidates([manual], [manual], "sample", "all").map((candidate) => candidate.id)).toEqual([manual]);
  });

  it("adds a trimmed name already selected while preserving existing registrations and input arrays", () => {
    const selected = ["actress-001"];
    const session = [...selected];
    const id = createManualFavoriteId("Sample Person");
    expect(addManualFavorite(" Sample Person ", selected, session)).toEqual({
      addedName: "Sample Person", selected: [...selected, id], candidateIds: [...session, id],
    });
    expect(selected).toEqual(["actress-001"]);
    expect(session).toEqual(selected);
  });

  it("rejects selected aliases after width and case normalization", () => {
    const id = createManualFavoriteId("Ｓａｍｐｌｅ Person");
    expect(addManualFavorite("sample person", [id], [id])).toEqual({ error: "この推しはすでに選択されています。" });
    expect(addManualFavorite("橋本環奈", ["actress-001"], ["actress-001"])).toEqual({ error: "この推しはすでに選択されています。" });
    const oldDisplayName = favoriteDisplayName("anime-002");
    expect(addManualFavorite(oldDisplayName.normalize("NFKC"), ["anime-002"], ["anime-002"]))
      .toEqual({ error: "この推しはすでに選択されています。" });
  });

  it("reselects an unchecked matching row without changing its name or ID", () => {
    const id = createManualFavoriteId("Sample Person");
    expect(addManualFavorite("ＳＡＭＰＬＥ ＰＥＲＳＯＮ", [], [id])).toEqual({
      addedName: "Sample Person", selected: [id], candidateIds: [id],
    });
    expect(addManualFavorite("橋本環奈", [], ["actress-001"])).toEqual({
      addedName: "橋本環奈", selected: ["actress-001"], candidateIds: ["actress-001"],
    });
  });

  it("selects a matching fixed suggestion by display name even if it has never been registered", () => {
    expect(addManualFavorite("橋本環奈", [], [])).toEqual({
      addedName: "橋本環奈", selected: ["actress-001"], candidateIds: ["actress-001"],
    });
    expect(addManualFavorite(favoriteDisplayName("anime-002"), [], [])).toEqual({
      addedName: "中野二乃", selected: ["anime-002"], candidateIds: ["anime-002"],
    });
    const manual = createManualFavoriteId("橋本環奈");
    expect(addManualFavorite("橋本環奈", [manual], [manual])).toEqual({ error: "この推しはすでに選択されています。" });
  });

  it("searches normalized registered names and preserves unknown saved IDs", () => {
    const ids = [createManualFavoriteId("Sample Person"), "old-favorite", "anime-002"];
    expect(favoritePickerCandidates(ids, ids, "ＳＡＭＰＬＥ　person").map((candidate) => candidate.id)).toEqual([ids[0]]);
    expect(favoritePickerCandidates(ids, ids, "OLD-FAVORITE").map((candidate) => candidate.name)).toEqual(["old-favorite"]);
    expect(favoritePickerCandidates(ids, ids, "五等分").map((candidate) => candidate.id)).toEqual([
      "anime-001", "anime-002", "anime-003", "anime-004", "anime-005",
    ]);
  });

  it("offers saved manual candidates after deselection and reopening with no active selection", () => {
    const saved = ["actress-001"];
    const added = createManualFavoriteId("Sample Person");
    expect(favoritePickerCandidates(saved, [...saved, added], "").map((candidate) => candidate.id)).toContain(added);
    const persistedCandidates = [added];
    expect(favoritePickerCandidates([], persistedCandidates, "sample").map((candidate) => candidate.id)).toEqual([added]);
    expect(addManualFavorite("ＳＡＭＰＬＥ ＰＥＲＳＯＮ", [], persistedCandidates)).toEqual({
      addedName: "Sample Person", selected: [added], candidateIds: [added],
    });
    expect(favoritePickerCandidates([], [], "")).toEqual(favoriteCatalog);
  });

  it("returns an input error for empty or malformed Unicode names without throwing", () => {
    expect(addManualFavorite("  ", [], [])).toEqual({ error: "名前を入力してください。" });
    expect(addManualFavorite("\ud800", [], [])).toEqual({ error: "名前を入力してください。" });
  });

  it("accepts the common field's 100-character limit and rejects longer names", () => {
    expect(addManualFavorite("A".repeat(100), [], [])).toMatchObject({ addedName: "A".repeat(100) });
    expect(addManualFavorite("A".repeat(101), [], [])).toEqual({ error: "100文字以内で入力してください。" });
  });
});

describe("favorite category sections", () => {
  it("orders existing categories and keeps two-column rows within each section", () => {
    const candidates: FavoriteCandidate[] = [
      { id: "custom-one", category: "custom", name: "Custom One" },
      { id: "actress-one", category: "actress", name: "Actress One" },
      { id: "anime-one", category: "anime", name: "Anime One" },
      { id: "performer-one", category: "performer", name: "Performer One" },
      { id: "anime-two", category: "anime", name: "Anime Two" },
      { id: "anime-three", category: "anime", name: "Anime Three" },
    ];
    const sections = favoritePickerSections(candidates);
    expect(sections.map(({ key, title }) => [key, title])).toEqual([
      ["anime", "アニメ"], ["actress", "女優"], ["performer", "成人作品出演者"], ["custom", "手入力"],
    ]);
    expect(sections.map(({ data }) => data.map((row) => row.map(({ id }) => id)))).toEqual([
      [["anime-one", "anime-two"], ["anime-three"]], [["actress-one"]], [["performer-one"]], [["custom-one"]],
    ]);
    expect(candidates.map(({ id }) => id)).toEqual([
      "custom-one", "actress-one", "anime-one", "performer-one", "anime-two", "anime-three",
    ]);
  });

  it("shows only matching section headers while preserving saved custom choices after filtering", () => {
    const manual = createManualFavoriteId("Sample Person");
    const selected = [manual, "actress-001"];
    const saved = [...selected];
    expect(favoritePickerSections(favoritePickerCandidates(selected, saved, "", "actress")).map(({ key }) => key))
      .toEqual(["actress"]);
    expect(favoritePickerSections(favoritePickerCandidates(selected, saved, "sample")).map(({ key }) => key))
      .toEqual(["custom"]);
    expect(favoritePickerSections(favoritePickerCandidates(selected, saved, "no-matching-name"))).toEqual([]);
    const reopened = favoritePickerSections(favoritePickerCandidates([], saved, ""));
    expect(reopened.map(({ key }) => key)).toEqual(["anime", "actress", "performer", "custom"]);
    expect(reopened.at(-1)?.data.flat().map(({ id }) => id)).toEqual([manual]);
    expect(selected).toEqual([manual, "actress-001"]);
    expect(saved).toEqual(selected);
  });
});
