import { describe, expect, it } from "vitest";
import {
  analyzeVoicePcm, createVoiceLoudnessMeter, validateVoiceLoudnessTarget,
  voiceNormalizationGain, voiceWaveHeader, VOICE_SAMPLE_PEAK_CEILING,
} from "./loudness";

function tone(frequency: number, amplitude: number, seconds: number, sampleRate: number) {
  return Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, frame) => amplitude * Math.sin(2 * Math.PI * frequency * frame / sampleRate));
}

describe("voice integrated loudness", () => {
  it.each([
    // Independent FFmpeg 8.1.2 reference: aevalsrc=A*sin(2*PI*f*t), ebur128=metadata=1.
    { rate: 48000, frequency: 1000, expected: -23.010 },
    { rate: 44100, frequency: 50, expected: -27.642 },
  ])("matches the reference K weighting at $rate Hz / $frequency Hz", ({ rate, frequency, expected }) => {
    const result = analyzeVoicePcm([tone(frequency, 0.1, 3, rate)], rate);
    expect(result.integratedLufs).not.toBeNull();
    expect(Math.abs(result.integratedLufs! - expected)).toBeLessThan(0.02);
    expect(result.samplePeak).toBeCloseTo(0.1, 4);
    expect(result.duration).toBe(3);
  });

  it("sums stereo energy without silently converting mono to dual-mono", () => {
    const pcm = tone(1000, 0.1, 1, 48000);
    const mono = analyzeVoicePcm([pcm], 48000);
    const stereo = analyzeVoicePcm([pcm, pcm], 48000);
    expect(stereo.integratedLufs! - mono.integratedLufs!).toBeCloseTo(10 * Math.log10(2), 8);
    expect(stereo.channels).toBe(2);
  });

  it("keeps state across arbitrary streaming chunks", () => {
    const pcm = tone(200, 0.05, 2, 44100);
    const expected = analyzeVoicePcm([pcm], 44100);
    const meter = createVoiceLoudnessMeter(44100, 1);
    for (let start = 0; start < pcm.length; start += 997) meter.push([pcm], start, Math.min(start + 997, pcm.length));
    expect(meter.finish()).toEqual(expected);
  });

  it("gates sustained quiet sections instead of diluting speech by their duration", () => {
    const rate = 48000;
    const loud = tone(1000, 0.1, 3, rate);
    const source = new Float32Array(rate * 9);
    source.set(loud);
    source.set(tone(1000, 0.0001, 6, rate), loud.length);
    const baseline = analyzeVoicePcm([loud], rate).integratedLufs!;
    const integrated = analyzeVoicePcm([source], rate).integratedLufs!;
    // Boundary windows retain the actual transition; the 6 seconds of silence
    // would lower an ungated average by almost 5 LU.
    expect(Math.abs(integrated - baseline)).toBeLessThan(0.3);
  });

  it("reports no integrated reading for silence and incomplete 400 ms windows", () => {
    expect(analyzeVoicePcm([new Float32Array(48000)], 48000).integratedLufs).toBeNull();
    expect(analyzeVoicePcm([tone(1000, 0.1, 0.399, 48000)], 48000).integratedLufs).toBeNull();
    expect(analyzeVoicePcm([tone(1000, 0.000001, 1, 48000)], 48000).integratedLufs).toBeNull();
    expect(analyzeVoicePcm([tone(1000, 0.1, 0.4, 48000)], 48000).integratedLufs).not.toBeNull();
  });

  it("discards the incomplete trailing gate but still measures its sample peak", () => {
    const pcm = tone(1000, 0.1, 0.4, 48000);
    const withTail = new Float32Array(22000);
    withTail.set(pcm);
    withTail[21999] = 0.9;
    const original = analyzeVoicePcm([pcm], 48000);
    const result = analyzeVoicePcm([withTail], 48000);
    expect(result.integratedLufs).toBe(original.integratedLufs);
    expect(result.samplePeak).toBeCloseTo(0.9);
  });

  it("rejects malformed samples and unsupported channel configurations", () => {
    expect(() => analyzeVoicePcm([new Float32Array([NaN])], 48000)).toThrow();
    expect(() => analyzeVoicePcm([new Float32Array([Infinity])], 48000)).toThrow();
    expect(() => analyzeVoicePcm([], 48000)).toThrow();
    expect(() => analyzeVoicePcm([new Float32Array(2), new Float32Array(3)], 48000)).toThrow();
    expect(() => createVoiceLoudnessMeter(48000, 6)).toThrow();
    expect(() => createVoiceLoudnessMeter(0, 1)).toThrow();
  });

  it("accepts only integral targets from -30 to -20 LUFS", () => {
    for (let target = -30; target <= -20; target++) expect(validateVoiceLoudnessTarget(target)).toBe(target);
    for (const target of [-31, -19, 20, 30, -25.5, NaN, Infinity]) expect(() => validateVoiceLoudnessTarget(target)).toThrow();
  });

  it("computes the target gain but prioritizes sample-peak headroom", () => {
    const measured = analyzeVoicePcm([tone(1000, 0.01, 1, 48000)], 48000);
    const normal = voiceNormalizationGain(measured, -20);
    expect(measured.integratedLufs! + normal.appliedGainDb).toBeCloseTo(-20);
    expect(normal.peakLimited).toBe(false);
    const limited = voiceNormalizationGain({ ...measured, samplePeak: 0.99 }, -20);
    expect(limited.gain * 0.99).toBeCloseTo(VOICE_SAMPLE_PEAK_CEILING);
    expect(limited.peakLimited).toBe(true);
    expect(() => voiceNormalizationGain({ ...measured, integratedLufs: null }, -20)).toThrow();
  });

  it("can stay near -27 LUFS across higher targets when a brief peak has no headroom", () => {
    const rate = 48000;
    const pcm = tone(1000, 0.0631, 3, rate);
    pcm[rate] = VOICE_SAMPLE_PEAK_CEILING;
    const measured = analyzeVoicePcm([pcm], rate);
    expect(measured.integratedLufs!).toBeCloseTo(-27, 1);

    for (const target of [-25, -20]) {
      const normalization = voiceNormalizationGain(measured, target);
      const output = Float32Array.from(pcm, (sample) => sample * normalization.gain);
      const saved = analyzeVoicePcm([output], rate);
      expect(normalization.peakLimited).toBe(true);
      expect(normalization.appliedGainDb).toBeCloseTo(0, 5);
      expect(saved.integratedLufs!).toBeCloseTo(measured.integratedLufs!, 5);
      expect(saved.samplePeak).toBeLessThanOrEqual(VOICE_SAMPLE_PEAK_CEILING + 1e-7);
    }

    // Lowering the target still works: this is a peak ceiling, not a frozen meter.
    const quieter = voiceNormalizationGain(measured, -30);
    expect(quieter.peakLimited).toBe(false);
    const attenuated = Float32Array.from(pcm, (sample) => sample * quieter.gain);
    expect(analyzeVoicePcm([attenuated], rate).integratedLufs!).toBeCloseTo(-30, 5);
  });

  it("writes a correctly sized little-endian PCM16 WAV header", () => {
    const header = voiceWaveHeader(48000, 48000, 2);
    const view = new DataView(header);
    expect(new TextDecoder().decode(header.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(192036);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(192000);
    expect(() => voiceWaveHeader(0xffffffff, 48000, 2)).toThrow();
  });
});
