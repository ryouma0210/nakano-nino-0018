import { describe, expect, it } from "vitest";
import { createManualFavoriteId, favoriteCatalog, favoriteDisplayName } from "./catalog";
import { addManualFavorite, favoritePickerCandidates } from "./favoritePickerModel";

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
      addedName: "Sample Person", selected: [...selected, id], sessionCandidates: [...session, id],
    });
    expect(selected).toEqual(["actress-001"]);
    expect(session).toEqual(selected);
  });

  it("rejects selected aliases after width and case normalization", () => {
    const id = createManualFavoriteId("Ｓａｍｐｌｅ Person");
    expect(addManualFavorite("sample person", [id], [id])).toEqual({ error: "このオカズはすでに選択されています。" });
    expect(addManualFavorite("橋本環奈", ["actress-001"], ["actress-001"])).toEqual({ error: "このオカズはすでに選択されています。" });
    const oldDisplayName = favoriteDisplayName("anime-002");
    expect(addManualFavorite(oldDisplayName.normalize("NFKC"), ["anime-002"], ["anime-002"]))
      .toEqual({ error: "このオカズはすでに選択されています。" });
  });

  it("reselects an unchecked matching row without changing its name or ID", () => {
    const id = createManualFavoriteId("Sample Person");
    expect(addManualFavorite("ＳＡＭＰＬＥ ＰＥＲＳＯＮ", [], [id])).toEqual({
      addedName: "Sample Person", selected: [id], sessionCandidates: [id],
    });
    expect(addManualFavorite("橋本環奈", [], ["actress-001"])).toEqual({
      addedName: "橋本環奈", selected: ["actress-001"], sessionCandidates: ["actress-001"],
    });
  });

  it("selects a matching fixed suggestion by display name even if it has never been registered", () => {
    expect(addManualFavorite("橋本環奈", [], [])).toEqual({
      addedName: "橋本環奈", selected: ["actress-001"], sessionCandidates: ["actress-001"],
    });
    expect(addManualFavorite(favoriteDisplayName("anime-002"), [], [])).toEqual({
      addedName: "中野二乃", selected: ["anime-002"], sessionCandidates: ["anime-002"],
    });
    const manual = createManualFavoriteId("橋本環奈");
    expect(addManualFavorite("橋本環奈", [manual], [manual])).toEqual({ error: "このオカズはすでに選択されています。" });
  });

  it("searches normalized registered names and preserves unknown saved IDs", () => {
    const ids = [createManualFavoriteId("Sample Person"), "old-favorite", "anime-002"];
    expect(favoritePickerCandidates(ids, ids, "ＳＡＭＰＬＥ　person").map((candidate) => candidate.id)).toEqual([ids[0]]);
    expect(favoritePickerCandidates(ids, ids, "OLD-FAVORITE").map((candidate) => candidate.name)).toEqual(["old-favorite"]);
    expect(favoritePickerCandidates(ids, ids, "五等分").map((candidate) => candidate.id)).toEqual([
      "anime-001", "anime-002", "anime-003", "anime-004", "anime-005",
    ]);
  });

  it("retains unchecked rows only within their modal session", () => {
    const saved = ["actress-001"];
    const added = createManualFavoriteId("Sample Person");
    expect(favoritePickerCandidates(saved, [...saved, added], "").map((candidate) => candidate.id)).toContain(added);
    // A reopened modal seeds its session from saved selections, discarding unsaved additions.
    expect(favoritePickerCandidates(saved, saved, "")).toEqual(favoriteCatalog);
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
