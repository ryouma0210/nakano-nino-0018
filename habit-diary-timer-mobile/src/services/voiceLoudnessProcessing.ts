import type { VoiceLoudnessAnalysis } from "../features/voices/loudness";
import { validateVoiceLoudnessTarget } from "../features/voices/loudness";

type NativeProcessor = {
  analyze(uri: string, operationId: string): Promise<VoiceLoudnessAnalysis>;
  normalizeM4a?(uri: string, targetLufs: number, operationId: string): Promise<{ uri: string; format: "m4a"; analysis: VoiceLoudnessAnalysis }>;
  cancel(operationId: string): void;
};
let sequence = 0;

async function process<T>(operation: (processor: NativeProcessor, id: string) => Promise<T>, signal?: AbortSignal, requiresM4a = false): Promise<T> {
  // Synchronous require keeps Metro's module in the bundle without initializing
  // native bindings during imports, backups or ordinary voice playback.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Native bindings are only needed for explicit processing.
  const { requireOptionalNativeModule }: typeof import("expo-modules-core") = require("expo-modules-core");
  const processor = requireOptionalNativeModule<NativeProcessor>("VoiceLoudness");
  if (!processor || (requiresM4a && typeof processor.normalizeM4a !== "function")) {
    throw new Error("音量の確認・調整には、対応版のアプリをインストールしてください。");
  }
  if (signal?.aborted) throw new Error("音量の処理をキャンセルしました。");
  const id = `voice-loudness-${Date.now()}-${sequence++}`;
  const cancel = () => processor.cancel(id);
  signal?.addEventListener("abort", cancel, { once: true });
  try { return await operation(processor, id); }
  catch (error) {
    if (signal?.aborted) throw new Error("音量の処理をキャンセルしました。");
    // Keep native details in the device log, while showing a localized message.
    console.warn("Voice loudness processing failed", error);
    throw new Error("音量を処理できませんでした。音声形式・長さ・空き容量を確認してください。");
  } finally { signal?.removeEventListener("abort", cancel); }
}

export function analyzeVoiceAudio(uri: string, signal?: AbortSignal): Promise<VoiceLoudnessAnalysis> {
  return process((processor, id) => processor.analyze(uri, id), signal);
}

export function normalizeVoiceAudio(uri: string, targetLufs: number, signal?: AbortSignal): Promise<{ uri: string; format: "m4a"; analysis: VoiceLoudnessAnalysis }> {
  validateVoiceLoudnessTarget(targetLufs);
  return process((processor, id) => processor.normalizeM4a!(uri, targetLufs, id), signal, true);
}
