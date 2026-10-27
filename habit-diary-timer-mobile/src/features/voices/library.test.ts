import { describe, expect, it } from "vitest";
import { audioFileType, emptyVoiceLibrary, moveVoice, parseVoiceLibrary, voiceDisplayName, voiceFolderName, voicesInScope, type VoiceMetadata } from "./library";

const first: VoiceMetadata = { id: "voice-first", fileName: "voice-first.mp3", name: "First", originalName: "first.mp3", size: 12, mimeType: "audio/mpeg", folderId: null };
const second: VoiceMetadata = { ...first, id: "voice-second", fileName: "voice-second.mp3", name: "Second" };
const third: VoiceMetadata = { ...first, id: "voice-third", fileName: "voice-third.mp3", name: "Third" };

describe("voice library metadata", () => {
  it("starts with an empty library and single-voice repeat", () => {
    expect(emptyVoiceLibrary()).toEqual({ version: 2, voices: [], mode: "one", folders: [], scope: "all" });
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
    expect(parsed).toEqual({ version: 2, mode: "all", voices: [second, first], folders: [], scope: "all" });
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
    expect(parseVoiceLibrary(legacy)).toEqual({ version: 2, voices: [first], mode: "all", folders: [], scope: "all" });
    expect(legacyVoice.folderId).toBe("folder-old");
    expect(legacy.version).toBe(1);
  });

  it("validates bounded folder names and accepts a version 2 library with membership and scope", () => {
    expect(voiceFolderName("  Morning  ")).toBe("Morning");
    expect(voiceFolderName("a".repeat(100))).toHaveLength(100);
    expect(() => voiceFolderName("  ")).toThrow("入力");
    expect(() => voiceFolderName("a".repeat(101))).toThrow("100文字");
    expect(() => voiceFolderName("bad\u0000name")).toThrow("使用できない文字");
    const source = { ...emptyVoiceLibrary(), folders: [{ id: "folder-morning", name: "Morning" }],
      scope: "folder-morning", voices: [{ ...first, folderId: "folder-morning" }, second] };
    const parsed = parseVoiceLibrary(source);
    expect(parsed).toEqual(source);
    parsed.folders[0].name = "Changed";
    expect(source.folders[0].name).toBe("Morning");
  });

  it.each([
    { scope: "folder-missing" }, { scope: "unknown" }, { scope: null }, { folders: null },
    { folders: [{ id: "voice-first", name: "Morning" }] },
    { folders: [{ id: "folder-first", name: "Morning" }, { id: "folder-first", name: "Evening" }] },
    { folders: [{ id: "folder-first", name: "Morning" }, { id: "folder-second", name: "  ＭＯＲＮＩＮＧ  " }] },
    { folders: [{ id: "folder-first", name: "" }] }, { folders: [{ id: "folder-first", name: "a".repeat(101) }] },
    { voices: [{ ...first, folderId: "folder-missing" }] }, { voices: [{ ...first, folderId: undefined }] },
  ])("rejects invalid version 2 folders, memberships, and scopes (%#)", (patch) => {
    expect(() => parseVoiceLibrary({ ...emptyVoiceLibrary(), ...patch })).toThrow("保存データが不正");
  });

  it("filters scopes and reorders only neighboring members without shifting unrelated voices", () => {
    const morning = { ...first, folderId: "folder-morning" };
    const evening = { ...second, folderId: "folder-evening" };
    const otherMorning = { ...third, folderId: "folder-morning" };
    const unfiled = { ...first, id: "voice-unfiled" };
    const source = [morning, evening, unfiled, otherMorning];
    expect(voicesInScope(source, "all")).toEqual(source);
    expect(voicesInScope(source, "unfiled")).toEqual([unfiled]);
    expect(voicesInScope(source, "folder-morning")).toEqual([morning, otherMorning]);
    expect(moveVoice(source, morning.id, 1, "folder-morning")).toEqual([otherMorning, evening, unfiled, morning]);
    expect(moveVoice(source, otherMorning.id, -1, "folder-morning")).toEqual([otherMorning, evening, unfiled, morning]);
    expect(moveVoice(source, morning.id, -1, "folder-morning")).toEqual(source);
    expect(() => moveVoice(source, evening.id, 1, "folder-morning")).toThrow("見つかりません");
    expect(source).toEqual([morning, evening, unfiled, otherMorning]);
  });
});
