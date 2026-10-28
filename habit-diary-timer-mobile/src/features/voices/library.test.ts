import { describe, expect, it } from "vitest";
import { audioFileType, emptyVoiceLibrary, moveVoice, parseVoiceLibrary, reorderVoices, voiceDisplayName, voiceFolderName, voicesInScope, type VoiceMetadata } from "./library";

const first: VoiceMetadata = { id: "voice-first", fileName: "voice-first.mp3", name: "First", originalName: "first.mp3", size: 12, mimeType: "audio/mpeg", folderIds: [] };
const second: VoiceMetadata = { ...first, id: "voice-second", fileName: "voice-second.mp3", name: "Second" };
const third: VoiceMetadata = { ...first, id: "voice-third", fileName: "voice-third.mp3", name: "Third" };

describe("voice library metadata", () => {
  it("starts with an empty library and single-voice repeat", () => {
    expect(emptyVoiceLibrary()).toEqual({ version: 3, voices: [], mode: "one", folders: [], scope: "all" });
  });

  it("accepts audio MIME types and extension fallback without admitting arbitrary files", () => {
    expect(audioFileType("SAMPLE.MP3", "application/octet-stream")).toEqual({ extension: "mp3", mimeType: "audio/mpeg" });
    expect(audioFileType("sample.ogg", "application/ogg")).toEqual({ extension: "ogg", mimeType: "audio/ogg" });
    expect(audioFileType("sample", "audio/wav")).toEqual({ extension: "audio", mimeType: "audio/wav" });
    expect(audioFileType("sample.txt", "text/plain")).toBeNull();
    expect(audioFileType("sample.mp4", "video/mp4")).toBeNull();
  });

  it("trims display names and enforces nonempty bounded names", () => {
    expect(voiceDisplayName("  Morning voice  ")).toBe("Morning voice");
    expect(voiceDisplayName("a".repeat(100))).toHaveLength(100);
    expect(() => voiceDisplayName("  ")).toThrow("入力");
    expect(() => voiceDisplayName("a".repeat(101))).toThrow("100文字");
    expect(() => voiceDisplayName("first\u0000voice")).toThrow("使用できない文字");
  });

  it("retains order and original filenames while removing unrelated persisted properties", () => {
    const parsed = parseVoiceLibrary({ version: 1, mode: "all", voices: [{ ...second, uri: "blob:expired" }, first] });
    expect(parsed).toEqual({ version: 3, mode: "all", voices: [second, first], folders: [], scope: "all" });
    parsed.voices[0].name = "Changed";
    expect(second.name).toBe("Second");
  });

  it.each([
    null, [], { version: 2, mode: "one", voices: [] }, { version: 1, mode: "random", voices: [] },
    { version: 1, mode: "one", voices: [first, first] },
    ...[{ id: "../outside" }, { fileName: "../outside.mp3" }, { fileName: "voice-other.mp3" },
      { name: "" }, { originalName: "" }, { size: -1 }, { size: 0 }, { size: 1.2 }, { mimeType: "text/html" }]
      .map((patch) => ({ version: 1, mode: "one", voices: [{ ...first, ...patch }] })),
  ])("rejects corrupted or unsafe library metadata (%#)", (value) => {
    expect(() => parseVoiceLibrary(value)).toThrow("保存データが不正");
  });

  it("moves only the requested voice one place and leaves boundary moves unchanged", () => {
    const original = [first, second, third];
    expect(moveVoice(original, second.id, -1)).toEqual([second, first, third]);
    expect(moveVoice(original, second.id, 1)).toEqual([first, third, second]);
    expect(moveVoice(original, first.id, -1)).toEqual(original);
    expect(moveVoice(original, third.id, 1)).toEqual(original);
    expect(original).toEqual([first, second, third]);
    expect(() => moveVoice(original, "missing", 1)).toThrow("見つかりません");
    expect(() => moveVoice(original, first.id, 0 as never)).toThrow("不正");
  });

  it("migrates version 1 without changing source metadata or keeping unsupported folder fields", () => {
    const legacyVoice = { ...first, folderId: "folder-old" };
    const legacy = { version: 1, voices: [legacyVoice], mode: "all", folders: [{ id: "folder-old", name: "Old" }], scope: "folder-old" };
    expect(parseVoiceLibrary(legacy)).toEqual({ version: 3, voices: [first], mode: "all", folders: [], scope: "all" });
    expect(legacyVoice.folderId).toBe("folder-old");
    expect(legacy.version).toBe(1);
  });

  it("validates bounded folder names and clones version 3 folder memberships", () => {
    expect(voiceFolderName("  Morning  ")).toBe("Morning");
    expect(voiceFolderName("a".repeat(100))).toHaveLength(100);
    expect(() => voiceFolderName("  ")).toThrow("入力");
    expect(() => voiceFolderName("a".repeat(101))).toThrow("100文字");
    expect(() => voiceFolderName("bad\u0000name")).toThrow("使用できない文字");
    const source = { ...emptyVoiceLibrary(), folders: [{ id: "folder-morning", name: "Morning" }, { id: "folder-evening", name: "Evening" }],
      scope: "folder-morning", voices: [{ ...first, folderIds: ["folder-morning", "folder-evening"] }, second] };
    const parsed = parseVoiceLibrary(source);
    expect(parsed).toEqual(source);
    parsed.folders[0].name = "Changed";
    parsed.voices[0].folderIds.pop();
    expect(source.folders[0].name).toBe("Morning");
    expect(source.voices[0].folderIds).toEqual(["folder-morning", "folder-evening"]);
  });

  it.each([
    { scope: "folder-missing" }, { scope: "unknown" }, { scope: null }, { folders: null },
    { folders: [{ id: "voice-first", name: "Morning" }] },
    { folders: [{ id: "folder-first", name: "Morning" }, { id: "folder-first", name: "Evening" }] },
    { folders: [{ id: "folder-first", name: "Morning" }, { id: "folder-second", name: "  ＭＯＲＮＩＮＧ  " }] },
    { folders: [{ id: "folder-first", name: "" }] }, { folders: [{ id: "folder-first", name: "a".repeat(101) }] },
    { voices: [{ ...first, folderIds: ["folder-missing"] }] }, { voices: [{ ...first, folderIds: undefined }] },
  ])("rejects invalid version 3 folders, memberships, and scopes (%#)", (patch) => {
    expect(() => parseVoiceLibrary({ ...emptyVoiceLibrary(), ...patch })).toThrow("保存データが不正");
  });

  it("filters scopes and reorders only neighboring members without shifting unrelated voices", () => {
    const morning = { ...first, folderIds: ["folder-morning", "folder-evening"] };
    const evening = { ...second, folderIds: ["folder-evening"] };
    const otherMorning = { ...third, folderIds: ["folder-morning", "folder-evening"] };
    const unfiled = { ...first, id: "voice-unfiled" };
    const source = [morning, evening, unfiled, otherMorning];
    expect(voicesInScope(source, "all")).toEqual(source);
    expect(voicesInScope(source, "unfiled")).toEqual([unfiled]);
    expect(voicesInScope(source, "folder-morning")).toEqual([morning, otherMorning]);
    expect(voicesInScope(source, "folder-evening")).toEqual([morning, evening, otherMorning]);
    expect(moveVoice(source, morning.id, 1, "folder-morning")).toEqual([otherMorning, evening, unfiled, morning]);
    expect(voicesInScope(moveVoice(source, morning.id, 1, "folder-morning"), "folder-evening")).toEqual([otherMorning, evening, morning]);
    expect(moveVoice(source, otherMorning.id, -1, "folder-morning")).toEqual([otherMorning, evening, unfiled, morning]);
    expect(moveVoice(source, morning.id, -1, "folder-morning")).toEqual(source);
    expect(() => moveVoice(source, evening.id, 1, "folder-morning")).toThrow("見つかりません");
    expect(source).toEqual([morning, evening, unfiled, otherMorning]);
  });

  it("migrates version 2 memberships, scope and ordering without changing the input", () => {
    const folders = [{ id: "folder-morning", name: "Morning" }];
    const legacy = { version: 2, mode: "all", folders, scope: "folder-morning", voices: [
      { ...second, folderIds: undefined, folderId: null }, { ...first, folderIds: undefined, folderId: "folder-morning" },
    ] };
    expect(parseVoiceLibrary(legacy)).toEqual({ version: 3, mode: "all", folders, scope: "folder-morning", voices: [
      second, { ...first, folderIds: ["folder-morning"] },
    ] });
    expect(legacy.voices[1].folderId).toBe("folder-morning");
    expect(legacy.voices[1].folderIds).toBeUndefined();
    expect(legacy.version).toBe(2);
  });

  it.each([undefined, 123, "folder-missing"])("rejects invalid legacy memberships during version 2 migration (%#)", (folderId) => {
    expect(() => parseVoiceLibrary({ ...emptyVoiceLibrary(), version: 2, voices: [{ ...first, folderId }] })).toThrow("保存データが不正");
  });

  it.each([null, undefined, "folder-morning", [null], [123], ["folder-morning", "folder-morning"], ["folder-missing"], new Array(1)])(
    "rejects malformed, duplicate or dangling version 3 memberships (%#)", (folderIds) => {
      expect(() => parseVoiceLibrary({ ...emptyVoiceLibrary(), folders: [{ id: "folder-morning", name: "Morning" }],
        voices: [{ ...first, folderIds }] })).toThrow("保存データが不正");
    },
  );
});

describe("atomic voice ordering", () => {
  const morning = { ...first, folderIds: ["folder-morning", "folder-evening"] };
  const evening = { ...second, folderIds: ["folder-evening"] };
  const otherMorning = { ...third, folderIds: ["folder-morning", "folder-evening"] };
  const unfiled = { ...first, id: "voice-unfiled", fileName: "voice-unfiled.mp3" };
  const otherUnfiled = { ...first, id: "voice-other-unfiled", fileName: "voice-other-unfiled.mp3" };
  const source = [morning, unfiled, evening, otherMorning, otherUnfiled];

  it("accepts a complete global permutation without mutating the source or memberships", () => {
    const ids = [otherUnfiled.id, otherMorning.id, evening.id, unfiled.id, morning.id];
    const result = reorderVoices(source, ids);
    expect(result).toEqual([otherUnfiled, otherMorning, evening, unfiled, morning]);
    expect(source).toEqual([morning, unfiled, evening, otherMorning, otherUnfiled]);
    expect(ids).toEqual([otherUnfiled.id, otherMorning.id, evening.id, unfiled.id, morning.id]);
    expect(result[1]).toBe(otherMorning);
    expect(result[4].folderIds).toEqual(["folder-morning", "folder-evening"]);
  });

  it("replaces only named-folder slots and shares their new order with overlapping folders", () => {
    const result = reorderVoices(source, [otherMorning.id, morning.id], "folder-morning");
    expect(result).toEqual([otherMorning, unfiled, evening, morning, otherUnfiled]);
    expect(voicesInScope(result, "folder-evening")).toEqual([otherMorning, evening, morning]);
    expect(result[1]).toBe(unfiled);
    expect(result[2]).toBe(evening);
    expect(result[4]).toBe(otherUnfiled);
  });

  it("replaces only unfiled slots and accepts exact empty and singleton orders", () => {
    expect(reorderVoices(source, [otherUnfiled.id, unfiled.id], "unfiled")).toEqual([morning, otherUnfiled, evening, otherMorning, unfiled]);
    expect(reorderVoices([morning], [morning.id], "folder-morning")).toEqual([morning]);
    expect(reorderVoices([morning], [], "unfiled")).toEqual([morning]);
    expect(reorderVoices([], [])).toEqual([]);
  });

  it.each([
    null, undefined, morning.id, [], [morning.id], [morning.id, morning.id], [morning.id, "voice-missing"],
    [morning.id, evening.id], [morning.id, otherMorning.id, evening.id], [null, otherMorning.id],
    [123, otherMorning.id], Object.assign(new Array(2), { 0: morning.id }),
  ])("rejects a malformed or non-exact scoped permutation (%#)", (ids) => {
    expect(() => reorderVoices(source, ids as string[], "folder-morning")).toThrow("順序変更を開き直して");
    expect(source).toEqual([morning, unfiled, evening, otherMorning, otherUnfiled]);
  });

  it("rejects a previously complete order after scope membership changes", () => {
    const oldOrder = [otherMorning.id, morning.id];
    const removed = source.map((voice) => voice.id === morning.id ? { ...voice, folderIds: ["folder-evening"] } : voice);
    expect(() => reorderVoices(removed, oldOrder, "folder-morning")).toThrow("順序変更を開き直して");
    const added = [...source, { ...unfiled, id: "voice-added", folderIds: ["folder-morning"] }];
    expect(() => reorderVoices(added, oldOrder, "folder-morning")).toThrow("順序変更を開き直して");
  });
});
