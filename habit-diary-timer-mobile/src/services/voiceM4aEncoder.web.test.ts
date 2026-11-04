import { BlobSource, Input, MP4 } from "mediabunny";
import { describe, expect, it, vi } from "vitest";
import { encodeVoiceM4a } from "./voiceM4aEncoder.web";

function sine(sampleRate: number, frequency: number, seconds = 2) {
  return Float32Array.from({ length: sampleRate * seconds }, (_, frame) => 0.1 * Math.sin(2 * Math.PI * frequency * frame / sampleRate));
}

describe("offline AAC-LC/M4A encoding", () => {
  // These tests run the packaged WASM fallback, not a mocked codec. They verify
  // real MP4 boxes and AAC track metadata without an external encoder/network.
  it.each([1, 2])("writes a compressed AAC-LC MP4 retaining %i channels", async (channelCount) => {
    const channels = Array.from({ length: channelCount }, (_, channel) => sine(48000, channel === 0 ? 440 : 880));
    const blob = await encodeVoiceM4a(channels, 48000, 1);
    expect(blob.type).toBe("audio/mp4");
    const header = new TextDecoder().decode(await blob.slice(4, 8).arrayBuffer());
    expect(header).toBe("ftyp");
    expect(blob.size).toBeLessThan(channels[0].length * channelCount * 2 / 4);
    const input = new Input({ source: new BlobSource(blob), formats: [MP4] });
    try {
      const track = await input.getPrimaryAudioTrack();
      expect(track).not.toBeNull();
      expect(await track!.getCodec()).toBe("aac");
      expect(await track!.getCodecParameterString()).toBe("mp4a.40.2");
      expect(await track!.getNumberOfChannels()).toBe(channelCount);
      expect(await track!.getSampleRate()).toBe(48000);
      expect(Math.abs(await input.computeDuration() - 2)).toBeLessThan(0.1);
    } finally { input.dispose(); }
  }, 30000);

  it("rejects invalid channel shapes before creating an encoder", async () => {
    await expect(encodeVoiceM4a([], 48000, 1)).rejects.toThrow();
    await expect(encodeVoiceM4a([sine(48000, 440), new Float32Array(2)], 48000, 1)).rejects.toThrow();
    await expect(encodeVoiceM4a([sine(48000, 440)], 48000, Infinity)).rejects.toThrow();
  });

  it("honors cancellation before starting and while feeding PCM", async () => {
    const canceled = new AbortController();
    canceled.abort();
    await expect(encodeVoiceM4a([sine(48000, 440)], 48000, 1, canceled.signal)).rejects.toMatchObject({ name: "AbortError" });
    const active = new AbortController();
    const pending = encodeVoiceM4a([sine(48000, 440, 5)], 48000, 1, active.signal);
    setTimeout(() => active.abort(), 10);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  }, 30000);

  it("rejects nonfinite samples instead of creating corrupted audio", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pcm = sine(48000, 440);
      pcm[0] = NaN;
      await expect(encodeVoiceM4a([pcm], 48000, 1)).rejects.toThrow("M4A音声を作成できません");
    } finally { warn.mockRestore(); }
  });
});
