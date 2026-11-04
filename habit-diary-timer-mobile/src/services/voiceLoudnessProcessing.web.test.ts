import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeVoicePcm, voiceWaveHeader, VOICE_SAMPLE_PEAK_CEILING } from "../features/voices/loudness";
import { analyzeVoiceAudio, MAX_WEB_VOICE_PROCESSING_BYTES, normalizeVoiceAudio } from "./voiceLoudnessProcessing.web";

const encodeVoiceM4a = vi.hoisted(() => vi.fn());
vi.mock("./voiceM4aEncoder.web", () => ({ encodeVoiceM4a }));

let metadataDuration = 1;
let channels: Float32Array[];
let encodedChannels: Float32Array[];
let encodingGainFactor = 0.97;
let forcedEncodedPeak: number | undefined;
let failDecode = false;
let decodeCalls = 0;
let fetchAudio: ReturnType<typeof vi.fn>;
const mediaPlayers: FakeAudio[] = [];
const objectUrls = new Map<string, Blob>();

class FakeAudio extends EventTarget {
  src = "";
  preload = "";
  duration = metadataDuration;
  play = vi.fn();
  constructor() { super(); mediaPlayers.push(this); }
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
  load() { if (this.src) queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata"))); }
}

class FakeOfflineAudioContext {
  async decodeAudioData(encoded: ArrayBuffer) {
    decodeCalls++;
    if (failDecode) throw new Error("decode failed");
    const decoded = new Uint8Array(encoded)[0] === 9 ? encodedChannels : channels;
    return {
      numberOfChannels: decoded.length, length: decoded[0].length,
      duration: decoded[0].length / 48000, sampleRate: 48000,
      getChannelData: (index: number) => decoded[index],
    };
  }
}

beforeEach(() => {
  metadataDuration = 1;
  failDecode = false;
  decodeCalls = 0;
  encodingGainFactor = 0.97;
  forcedEncodedPeak = undefined;
  objectUrls.clear();
  mediaPlayers.length = 0;
  channels = [Float32Array.from({ length: 48000 }, (_, frame) => 0.01 * Math.sin(2 * Math.PI * 1000 * frame / 48000))];
  encodeVoiceM4a.mockReset().mockImplementation(async (source: Float32Array[], _sampleRate: number, gain: number) => {
    // Deliberately alter PCM like a lossy codec: the service must measure the
    // decoded result instead of returning a pre-compression estimate.
    encodedChannels = source.map((channel) => Float32Array.from(channel, (sample) => sample * gain * encodingGainFactor));
    if (forcedEncodedPeak !== undefined) encodedChannels[0][24000] = forcedEncodedPeak;
    return new Blob([new Uint8Array([9, 2, 3])], { type: "audio/mp4" });
  });
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (!(blob instanceof Blob)) throw new Error("Expected an encoded Blob");
    const uri = `blob:encoded-${objectUrls.size}`;
    objectUrls.set(uri, blob);
    return uri;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((uri) => { objectUrls.delete(uri); });
  fetchAudio = vi.fn(async (uri: string) => new Response(objectUrls.get(uri) ?? new Uint8Array([1, 2, 3]), { status: 200 }));
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
  vi.stubGlobal("fetch", fetchAudio);
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("on-demand browser voice loudness processing", () => {
  it("analyzes only the requested audio and never starts playback", async () => {
    expect(fetchAudio).not.toHaveBeenCalled();
    const result = await analyzeVoiceAudio("blob:chosen-voice");
    expect(result.integratedLufs).toBeCloseTo(-43.0, 1);
    expect(fetchAudio).toHaveBeenCalledExactlyOnceWith("blob:chosen-voice", { signal: undefined });
    expect(mediaPlayers[0].play).not.toHaveBeenCalled();
    expect(mediaPlayers[0].src).toBe("");
  });

  it("normalizes to the selected target and reports the measured compressed result", async () => {
    const result = await normalizeVoiceAudio("blob:chosen-voice", -25);
    expect(result.format).toBe("m4a");
    expect(result.blob.type).toBe("audio/mp4");
    expect(result.targetLufs).toBe(-25);
    expect(result.peakLimited).toBe(false);
    const measurement = analyzeVoicePcm(encodedChannels, 48000);
    expect(measurement).toEqual(result.analysis);
    expect(measurement.integratedLufs!).toBeCloseTo(-25 + 20 * Math.log10(encodingGainFactor), 3);
    expect(decodeCalls).toBe(2);
    expect(encodeVoiceM4a).toHaveBeenCalledOnce();
    expect(objectUrls.size).toBe(0);
  });

  it("reports the lower achieved loudness when a peak limits amplification", async () => {
    channels[0][24000] = 0.99;
    const result = await normalizeVoiceAudio("blob:quiet-with-spike", -20);
    expect(result.peakLimited).toBe(true);
    expect(result.analysis.integratedLufs!).toBeLessThan(-30);
    expect(result.analysis.samplePeak).toBeLessThanOrEqual(VOICE_SAMPLE_PEAK_CEILING + 1 / 32768);
  });

  it("preserves both stereo channels in the M4A", async () => {
    channels.push(new Float32Array(48000));
    const result = await normalizeVoiceAudio("blob:stereo", -30);
    expect(result.analysis.channels).toBe(2);
    expect(encodedChannels[1].every((sample) => sample === 0)).toBe(true);
  });

  it("re-encodes once when compression reconstructs a peak above the ceiling", async () => {
    channels[0][24000] = 0.99;
    encodingGainFactor = 1.1;
    const result = await normalizeVoiceAudio("blob:overshoot", -20);
    expect(encodeVoiceM4a).toHaveBeenCalledTimes(2);
    expect(result.peakLimited).toBe(true);
    expect(result.analysis.samplePeak).toBeLessThanOrEqual(VOICE_SAMPLE_PEAK_CEILING + 1 / 32768);
    expect(result.analysis).toEqual(analyzeVoicePcm(encodedChannels, 48000));
    expect(objectUrls.size).toBe(0);
  });

  it("rejects an output still above the ceiling after retry and releases both temporary URLs", async () => {
    forcedEncodedPeak = 0.95;
    await expect(normalizeVoiceAudio("blob:unsafe-encoder", -20)).rejects.toThrow("目標音量を下げて");
    expect(encodeVoiceM4a).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(objectUrls.size).toBe(0);
  });

  it("rejects compression that changes channel count and releases the output URL", async () => {
    channels.push(new Float32Array(48000));
    encodeVoiceM4a.mockImplementation(async () => {
      encodedChannels = [channels[0]];
      return new Blob([new Uint8Array([9])], { type: "audio/mp4" });
    });
    await expect(normalizeVoiceAudio("blob:stereo", -30)).rejects.toThrow("圧縮後の音声を確認できません");
    expect(objectUrls.size).toBe(0);
  });

  it("checks target bounds before loading or decoding audio", async () => {
    await expect(normalizeVoiceAudio("blob:voice", 20)).rejects.toThrow("−30〜−20");
    expect(fetchAudio).not.toHaveBeenCalled();
    expect(decodeCalls).toBe(0);
  });

  it("rejects excessive duration and encoded size before allocating decoded PCM", async () => {
    metadataDuration = 301;
    await expect(analyzeVoiceAudio("blob:long")).rejects.toThrow("5分以内");
    expect(fetchAudio).not.toHaveBeenCalled();
    metadataDuration = 1;
    fetchAudio.mockResolvedValue(new Response(new Uint8Array([1]), { headers: { "content-length": String(MAX_WEB_VOICE_PROCESSING_BYTES + 1) } }));
    await expect(analyzeVoiceAudio("blob:large")).rejects.toThrow("64MB以下");
    expect(decodeCalls).toBe(0);
  });

  it("allows a maximum-duration saved stereo WAV through the encoded-size precheck for re-editing", async () => {
    metadataDuration = 300;
    const header = voiceWaveHeader(48000 * 300, 48000, 2);
    const fileSize = new DataView(header).getUint32(4, true) + 8;
    // The decoder is mocked; only the previously rejecting size/duration
    // prechecks are exercised, without retaining a 58 MB test fixture.
    fetchAudio.mockResolvedValue(new Response(header, { headers: { "content-length": String(fileSize) } }));
    await expect(analyzeVoiceAudio("blob:previous-normalized-wav")).resolves.toMatchObject({ channels: 1 });
    expect(decodeCalls).toBe(1);
  });

  it("rejects silence and malformed decodes without producing a replacement file", async () => {
    channels = [new Float32Array(48000)];
    await expect(normalizeVoiceAudio("blob:silence", -20)).rejects.toThrow("無音に近い");
    failDecode = true;
    await expect(analyzeVoiceAudio("blob:bad")).rejects.toThrow("音量を確認できません");
  });

  it("honors cancellation before decode and between processing chunks", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(analyzeVoiceAudio("blob:voice", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchAudio).not.toHaveBeenCalled();
    const processing = new AbortController();
    const pending = normalizeVoiceAudio("blob:voice", -20, processing.signal);
    setTimeout(() => processing.abort(), 0);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
