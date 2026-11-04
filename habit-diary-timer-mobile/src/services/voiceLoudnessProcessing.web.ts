import {
  createVoiceLoudnessMeter, loudnessMessages, validateVoiceLoudnessTarget,
  voiceNormalizationGain, VOICE_SAMPLE_PEAK_CEILING, type VoiceLoudnessAnalysis,
} from "../features/voices/loudness";
import { encodeVoiceM4a } from "./voiceM4aEncoder.web";

// decodeAudioData materializes the whole PCM buffer. Limit this optional edit
// operation before decoding; ordinary imports/playback have no new size limit.
// Keep older normalized PCM16 WAVs editable as well as compressed input.
export const MAX_WEB_VOICE_PROCESSING_BYTES = 64 * 1024 * 1024;
export const MAX_WEB_VOICE_PROCESSING_SECONDS = 300;
const decodedSampleRate = 48000;
const chunkFrames = 32768;
// Compressed codecs may round the final packet to an AAC frame boundary.
const maximumDecodedSeconds = MAX_WEB_VOICE_PROCESSING_SECONDS + 0.1;
const maxDecodedSamples = decodedSampleRate * maximumDecodedSeconds * 2;
const unsupportedMessage = "この環境では音量の確認・調整を利用できません。";
const tooLargeMessage = "Web版の音量調整は、5分以内・64MB以下の音声に対応しています。";
const decodeFailureMessage = "この音声の音量を確認できませんでした。対応する音声形式か確認してください。";

export type VoiceNormalizationResult = {
  format: "m4a";
  blob: Blob;
  analysis: VoiceLoudnessAnalysis;
  targetLufs: number;
  appliedGainDb: number;
  peakLimited: boolean;
};

function checkCanceled(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error(loudnessMessages.canceled);
    error.name = "AbortError";
    throw error;
  }
}

async function yieldProcessing(signal?: AbortSignal) {
  checkCanceled(signal);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  checkCanceled(signal);
}

async function checkDuration(uri: string, signal?: AbortSignal): Promise<void> {
  checkCanceled(signal);
  if (typeof Audio === "undefined") throw new Error(unsupportedMessage);
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", canceled);
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("error", failed);
      audio.removeAttribute("src");
      audio.load();
      if (error) reject(error); else resolve();
    };
    const loaded = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) finish(new Error(decodeFailureMessage));
      else if (audio.duration > maximumDecodedSeconds) finish(new Error(tooLargeMessage));
      else finish();
    };
    const failed = () => finish(new Error(decodeFailureMessage));
    const canceled = () => {
      const error = new Error(loudnessMessages.canceled);
      error.name = "AbortError";
      finish(error);
    };
    const timeout = setTimeout(failed, 15000);
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", loaded);
    audio.addEventListener("error", failed);
    signal?.addEventListener("abort", canceled, { once: true });
    audio.src = uri;
    audio.load();
    if (signal?.aborted) canceled();
  });
}

async function readEncodedAudio(uri: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(uri, { signal });
  if (!response.ok) throw new Error(decodeFailureMessage);
  const advertisedLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_WEB_VOICE_PROCESSING_BYTES) {
    await response.body?.cancel();
    throw new Error(tooLargeMessage);
  }
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_WEB_VOICE_PROCESSING_BYTES) throw new Error(tooLargeMessage);
    return buffer;
  }
  const reader = response.body.getReader();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  try {
    for (;;) {
      checkCanceled(signal);
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > MAX_WEB_VOICE_PROCESSING_BYTES) throw new Error(tooLargeMessage);
      parts.push(new Uint8Array(item.value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result.buffer;
}

async function decodeVoice(uri: string, signal?: AbortSignal): Promise<AudioBuffer> {
  checkCanceled(signal);
  const contextConstructor = typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext
    : (globalThis as typeof globalThis & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!contextConstructor) throw new Error(unsupportedMessage);
  await checkDuration(uri, signal);
  const encoded = await readEncodedAudio(uri, signal);
  checkCanceled(signal);
  // Offline context requests no output device and never plays the selected file.
  // Browsers resample decodeAudioData to this rate; the M4A keeps that rate.
  const context = new contextConstructor(2, 1, decodedSampleRate);
  let decoded: AudioBuffer;
  try { decoded = await context.decodeAudioData(encoded); }
  catch { checkCanceled(signal); throw new Error(decodeFailureMessage); }
  checkCanceled(signal);
  if (decoded.numberOfChannels !== 1 && decoded.numberOfChannels !== 2) {
    throw new Error(loudnessMessages.unsupportedChannels);
  }
  if (decoded.duration > maximumDecodedSeconds || decoded.length * decoded.numberOfChannels > maxDecodedSamples) {
    throw new Error(tooLargeMessage);
  }
  if (decoded.length === 0) throw new Error(decodeFailureMessage);
  return decoded;
}

async function analyzeDecoded(decoded: AudioBuffer, signal?: AbortSignal): Promise<VoiceLoudnessAnalysis> {
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel));
  const meter = createVoiceLoudnessMeter(decoded.sampleRate, channels.length);
  for (let start = 0; start < decoded.length; start += chunkFrames) {
    await yieldProcessing(signal);
    meter.push(channels, start, Math.min(decoded.length, start + chunkFrames));
  }
  return meter.finish();
}

export async function analyzeVoiceAudio(uri: string, signal?: AbortSignal): Promise<VoiceLoudnessAnalysis> {
  return analyzeDecoded(await decodeVoice(uri, signal), signal);
}

export async function normalizeVoiceAudio(uri: string, targetLufs: number, signal?: AbortSignal): Promise<VoiceNormalizationResult> {
  validateVoiceLoudnessTarget(targetLufs);
  const decoded = await decodeVoice(uri, signal);
  const inputAnalysis = await analyzeDecoded(decoded, signal);
  const normalization = voiceNormalizationGain(inputAnalysis, targetLufs);
  let gain = normalization.gain;
  let peakLimited = normalization.peakLimited;
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel));
  for (let attempt = 0; attempt < 2; attempt++) {
    checkCanceled(signal);
    const blob = await encodeVoiceM4a(channels, decoded.sampleRate, gain, signal);
    const outputUri = URL.createObjectURL(blob);
    let analysis: VoiceLoudnessAnalysis;
    try {
      const output = await decodeVoice(outputUri, signal);
      if (output.numberOfChannels !== decoded.numberOfChannels || Math.abs(output.duration - decoded.duration) > 0.1) {
        throw new Error("圧縮後の音声を確認できませんでした。元の音声は変更していません。");
      }
      analysis = await analyzeDecoded(output, signal);
    } finally { URL.revokeObjectURL(outputUri); }
    if (analysis.integratedLufs === null) throw new Error(loudnessMessages.unmeasurable);
    // AAC can reconstruct peaks above its input. Re-encode once with additional
    // headroom, then report the actual compressed-file measurement.
    if (attempt === 0 && analysis.samplePeak > VOICE_SAMPLE_PEAK_CEILING + 1 / 32768) {
      gain *= VOICE_SAMPLE_PEAK_CEILING * 0.98 / analysis.samplePeak;
      peakLimited = true;
      continue;
    }
    if (analysis.samplePeak > VOICE_SAMPLE_PEAK_CEILING + 1 / 32768) throw new Error("圧縮後の音量を安全に調整できませんでした。目標音量を下げてお試しください。");
    checkCanceled(signal);
    return { format: "m4a", blob, analysis, targetLufs, appliedGainDb: 20 * Math.log10(gain), peakLimited };
  }
  throw new Error("M4A音声を作成できませんでした。もう一度お試しください。");
}
