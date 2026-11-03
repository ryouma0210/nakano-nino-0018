import { describe, expect, it } from "vitest";
import type { StoredVoice } from "./library";
import { filterVoicesByName, selectedVisibleVoices } from "./list";
import { voicesInScope } from "./library";

function voice(id: string, name: string, originalName = `${id}.wav`, folderIds: string[] = []): StoredVoice {
  return { id, name, originalName, folderIds, uri: `file:///${id}`, size: 12 };
}

describe("voice name search and visible selections", () => {
  const voices = [voice("one", "Morning", "Original Ａ.WAV", ["person"]), voice("two", "夜のボイス", "Bedtime.mp3"), voice("three", "ＭＯＲＮＩＮＧ 2", "third.wav")];
  it("matches renamed labels and original filenames without altering order or data", () => {
    expect(filterVoicesByName(voices, "morning").map(({ id }) => id)).toEqual(["one", "three"]);
    expect(filterVoicesByName(voices, " ＯＲＩＧＩＮＡＬ a.wav ")).toEqual([voices[0]]);
    expect(filterVoicesByName(voices, "夜")).toEqual([voices[1]]);
    expect(voices[0].originalName).toBe("Original Ａ.WAV");
  });
  it("keeps folder scope independent and returns an empty list for no matches", () => {
    expect(filterVoicesByName(voicesInScope(voices, "person"), "morning")).toEqual([voices[0]]);
    expect(filterVoicesByName(voicesInScope(voices, "person"), "bedtime")).toEqual([]);
    expect(filterVoicesByName(voices, "　 ")).toEqual(voices);
  });
  it("excludes stale and hidden selection IDs from the deletion snapshot", () => {
    const selected = new Set(["one", "two", "missing"]);
    expect(selectedVisibleVoices(filterVoicesByName(voices, "morning"), selected)).toEqual([voices[0]]);
    expect(selectedVisibleVoices([], selected)).toEqual([]);
    expect([...selected]).toEqual(["one", "two", "missing"]);
  });
});
