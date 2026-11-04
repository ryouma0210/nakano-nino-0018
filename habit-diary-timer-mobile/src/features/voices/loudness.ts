/** ITU-R BS.1770 K weighting and EBU R 128 integrated (gated) loudness. */
export type VoiceLoudnessAnalysis = {
  integratedLufs: number | null;
  /** Linear sample peak, not an oversampled true-peak measurement. */
  samplePeak: number;
  duration: number;
  sampleRate: number;
  channels: number;
};

export const MIN_VOICE_LUFS = -30;
export const MAX_VOICE_LUFS = -20;
export const DEFAULT_VOICE_LUFS = -20;
export const VOICE_SAMPLE_PEAK_CEILING = 10 ** (-1 / 20);

export const loudnessMessages = {
  invalidTarget: "目標音量は−30〜−20 LUFSの整数で指定してください。",
  invalidAudio: "音声データを読み取れませんでした。",
  unsupportedChannels: "音量調整はモノラル・ステレオの音声に対応しています。",
  unmeasurable: "音声が短すぎるか、無音に近いため音量を調整できません。",
  canceled: "音量の処理をキャンセルしました。",
} as const;

export function validateVoiceLoudnessTarget(value: number): number {
  if (!Number.isInteger(value) || value < MIN_VOICE_LUFS || value > MAX_VOICE_LUFS) {
    throw new Error(loudnessMessages.invalidTarget);
  }
  return value;
}

type Coefficients = { b0: number; b1: number; b2: number; a1: number; a2: number };

function kWeightingCoefficients(sampleRate: number): [Coefficients, Coefficients] {
  // The bilinear forms reproduce the BS.1770 48 kHz reference coefficients
  // while retaining the same response at other supported sampling rates.
  const shelfK = Math.tan(Math.PI * 1681.974450955533 / sampleRate);
  const shelfQ = 0.7071752369554196;
  const highGain = 10 ** (3.999843853973347 / 20);
  const bandGain = highGain ** 0.4996667741545416;
  const shelfDenominator = 1 + shelfK / shelfQ + shelfK * shelfK;
  const shelf: Coefficients = {
    b0: (highGain + bandGain * shelfK / shelfQ + shelfK * shelfK) / shelfDenominator,
    b1: 2 * (shelfK * shelfK - highGain) / shelfDenominator,
    b2: (highGain - bandGain * shelfK / shelfQ + shelfK * shelfK) / shelfDenominator,
    a1: 2 * (shelfK * shelfK - 1) / shelfDenominator,
    a2: (1 - shelfK / shelfQ + shelfK * shelfK) / shelfDenominator,
  };
  const highPassK = Math.tan(Math.PI * 38.13547087602444 / sampleRate);
  const highPassQ = 0.5003270373238773;
  const highPassDenominator = 1 + highPassK / highPassQ + highPassK * highPassK;
  // The RLB numerator deliberately remains [1, -2, 1], as in BS.1770.
  const highPass: Coefficients = {
    b0: 1, b1: -2, b2: 1,
    a1: 2 * (highPassK * highPassK - 1) / highPassDenominator,
    a2: (1 - highPassK / highPassQ + highPassK * highPassK) / highPassDenominator,
  };
  return [shelf, highPass];
}

class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(private readonly coefficients: Coefficients) {}

  process(input: number) {
    const c = this.coefficients;
    const output = c.b0 * input + c.b1 * this.x1 + c.b2 * this.x2 - c.a1 * this.y1 - c.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }
}

export type VoiceLoudnessMeter = {
  push(channels: readonly Float32Array[], start?: number, end?: number): void;
  finish(): VoiceLoudnessAnalysis;
};

export function createVoiceLoudnessMeter(sampleRate: number, channelCount: number): VoiceLoudnessMeter {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new Error(loudnessMessages.invalidAudio);
  }
  if (channelCount !== 1 && channelCount !== 2) throw new Error(loudnessMessages.unsupportedChannels);
  const coefficients = kWeightingCoefficients(sampleRate);
  const filters = Array.from({ length: channelCount }, () => coefficients.map((stage) => new Biquad(stage)));
  const blockLength = Math.round(sampleRate * 0.4);
  const hopLength = Math.round(sampleRate * 0.1);
  const ring = new Float64Array(blockLength);
  const blockEnergies: number[] = [];
  let energySum = 0;
  let frames = 0;
  let peak = 0;

  return {
    push(channels, start = 0, end = channels[0]?.length ?? 0) {
      if (channels.length !== channelCount || !Number.isInteger(start) || !Number.isInteger(end)
        || start < 0 || end < start || channels.some((channel) => channel.length < end)) {
        throw new Error(loudnessMessages.invalidAudio);
      }
      for (let frame = start; frame < end; frame++) {
        let energy = 0;
        for (let channel = 0; channel < channelCount; channel++) {
          const sample = channels[channel][frame];
          if (!Number.isFinite(sample)) throw new Error(loudnessMessages.invalidAudio);
          peak = Math.max(peak, Math.abs(sample));
          const filtered = filters[channel][1].process(filters[channel][0].process(sample));
          energy += filtered * filtered;
        }
        const position = frames % blockLength;
        energySum += energy - ring[position];
        ring[position] = energy;
        frames++;
        if (frames >= blockLength && (frames - blockLength) % hopLength === 0) {
          blockEnergies.push(Math.max(0, energySum / blockLength));
        }
      }
    },
    finish() {
      const absoluteGate = 10 ** ((-70 + 0.691) / 10);
      const absoluteBlocks = blockEnergies.filter((energy) => energy > absoluteGate);
      let integratedLufs: number | null = null;
      if (absoluteBlocks.length > 0) {
        const mean = absoluteBlocks.reduce((sum, energy) => sum + energy, 0) / absoluteBlocks.length;
        const gate = Math.max(absoluteGate, mean / 10);
        const included = absoluteBlocks.filter((energy) => energy > gate);
        if (included.length > 0) {
          integratedLufs = -0.691 + 10 * Math.log10(included.reduce((sum, energy) => sum + energy, 0) / included.length);
        }
      }
      return { integratedLufs, samplePeak: peak, duration: frames / sampleRate, sampleRate, channels: channelCount };
    },
  };
}

export function analyzeVoicePcm(channels: readonly Float32Array[], sampleRate: number): VoiceLoudnessAnalysis {
  if (channels.some((channel) => channel.length !== channels[0].length)) throw new Error(loudnessMessages.invalidAudio);
  const meter = createVoiceLoudnessMeter(sampleRate, channels.length);
  meter.push(channels);
  return meter.finish();
}

export function voiceNormalizationGain(analysis: VoiceLoudnessAnalysis, targetLufs: number) {
  validateVoiceLoudnessTarget(targetLufs);
  if (analysis.integratedLufs === null || !Number.isFinite(analysis.integratedLufs)
    || !Number.isFinite(analysis.samplePeak) || analysis.samplePeak <= 0) {
    throw new Error(loudnessMessages.unmeasurable);
  }
  const requested = 10 ** ((targetLufs - analysis.integratedLufs) / 20);
  const gain = Math.min(requested, VOICE_SAMPLE_PEAK_CEILING / analysis.samplePeak);
  return { gain, appliedGainDb: 20 * Math.log10(gain), peakLimited: gain < requested - 1e-10 };
}

export function voiceWaveHeader(frames: number, sampleRate: number, channels: number): ArrayBuffer {
  const bytes = frames * channels * 2;
  if (!Number.isSafeInteger(frames) || frames < 0 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000
    || (channels !== 1 && channels !== 2) || bytes > 0xffffffff - 36) throw new Error(loudnessMessages.invalidAudio);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  function text(offset: number, value: string) {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  }
  text(0, "RIFF");
  view.setUint32(4, bytes + 36, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, bytes, true);
  return header;
}
