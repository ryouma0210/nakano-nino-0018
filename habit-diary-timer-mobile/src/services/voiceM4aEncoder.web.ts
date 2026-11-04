import { AudioSample, AudioSampleSource, BufferTarget, canEncodeAudio, Mp4OutputFormat, Output, Quality } from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";
import { loudnessMessages } from "../features/voices/loudness";

const framesPerChunk = 32768;
const failureMessage = "M4A音声を作成できませんでした。もう一度お試しください。";
let fallbackRegistered = false;

function checkCanceled(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error(loudnessMessages.canceled);
    error.name = "AbortError";
    throw error;
  }
}

async function ensureAacEncoder(sampleRate: number, numberOfChannels: number, quality: Quality) {
  const nativeAvailable = await canEncodeAudio("aac", { sampleRate, numberOfChannels, quality, fullCodecString: "mp4a.40.2" }).catch(() => false);
  if (!nativeAvailable) {
    // The static import lets Metro package the embedded worker/WASM offline.
    // Registration and codec initialization happen only for manual encoding.
    if (!fallbackRegistered) { registerAacEncoder(); fallbackRegistered = true; }
  }
}

/** Encode an audio-only MP4 (M4A), preserving channel order and sample timing. */
export async function encodeVoiceM4a(channels: readonly Float32Array[], sampleRate: number, gain: number, signal?: AbortSignal): Promise<Blob> {
  checkCanceled(signal);
  const frames = channels[0]?.length ?? 0;
  if ((channels.length !== 1 && channels.length !== 2) || frames === 0 || channels.some((channel) => channel.length !== frames)
    || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || !Number.isFinite(gain) || gain <= 0) {
    throw new Error(loudnessMessages.invalidAudio);
  }
  const quality = new Quality({ bitrate: channels.length === 1 ? 64000 : 128000, bitrateMode: "constant" });
  await ensureAacEncoder(sampleRate, channels.length, quality);
  checkCanceled(signal);
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const source = new AudioSampleSource({ codec: "aac", fullCodecString: "mp4a.40.2", quality });
  output.addAudioTrack(source);
  try {
    checkCanceled(signal);
    await output.start();
    for (let start = 0; start < frames; start += framesPerChunk) {
      checkCanceled(signal);
      // Yield before each chunk so cancel and UI events remain responsive.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      checkCanceled(signal);
      const count = Math.min(framesPerChunk, frames - start);
      const pcm = new Float32Array(count * channels.length);
      for (let frame = 0; frame < count; frame++) {
        for (let channel = 0; channel < channels.length; channel++) {
          const value = channels[channel][start + frame] * gain;
          if (!Number.isFinite(value) || Math.abs(value) > 1) throw new Error(loudnessMessages.invalidAudio);
          pcm[frame * channels.length + channel] = value;
        }
      }
      const sample = new AudioSample({ data: pcm, format: "f32", numberOfChannels: channels.length, sampleRate, timestamp: start / sampleRate });
      try { await source.add(sample); }
      finally { sample.close(); }
    }
    checkCanceled(signal);
    await output.finalize();
    checkCanceled(signal);
    if (!target.buffer || target.buffer.byteLength === 0) throw new Error(failureMessage);
    return new Blob([target.buffer], { type: "audio/mp4" });
  } catch (error) {
    checkCanceled(signal);
    console.warn("Could not encode voice M4A", error);
    throw new Error(failureMessage);
  } finally {
    // Close only between awaited codec operations. Concurrent cancel during
    // the fallback worker's initialization can terminate it before its pending
    // initialization response arrives, leaving source.add() unresolved.
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => {});
  }
}
