import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useAppAudio } from "@/audio/AudioProvider";
import { useVoiceLibrary } from "@/audio/VoiceLibraryProvider";
import { DEFAULT_VOICE_LUFS, MAX_VOICE_LUFS, MIN_VOICE_LUFS, type VoiceLoudnessAnalysis } from "@/features/voices/loudness";
import type { StoredVoice } from "@/services/voiceStorageService";
import { translateText } from "@/i18n";
import { AppText } from "./AppText";
import { PrimaryButton } from "./PrimaryButton";

type Props = {
  voice: StoredVoice;
  disabled?: boolean;
  onBusyChange?(busy: boolean): void;
};

/** A new voice gets a new form, so a previous voice's result cannot be reused. */
export function VoiceLoudnessDetails(props: Props) {
  return <LoudnessForm key={props.voice.id} {...props} />;
}

function LoudnessForm({ voice, disabled = false, onBusyChange }: Props) {
  const library = useVoiceLibrary();
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const t = (text: string) => translateText(text, language);
  const [analysis, setAnalysis] = useState<VoiceLoudnessAnalysis | null>(() => voice.loudness?.analysis ?? null);
  const [targetLufs, setTargetLufs] = useState(() => voice.loudness?.targetLufs ?? DEFAULT_VOICE_LUFS);
  const [stage, setStage] = useState<"analyzing" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedTarget, setSavedTarget] = useState<number | null>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const locked = disabled || library.loading || library.busy || stage !== null;
  const measuredLufs = analysis?.integratedLufs;
  const measurable = typeof measuredLufs === "number" && Number.isFinite(measuredLufs);
  const peakLimited = savedTarget !== null && measurable && measuredLufs < savedTarget - 0.2;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pending.current) {
        pending.current = false;
        busyCallback.current?.(false);
      }
    };
  }, []);

  async function perform(action: "analyzing" | "saving") {
    if (locked || pending.current || (action === "saving" && !measurable)) return;
    pending.current = true;
    setStage(action);
    setError(null);
    setSavedTarget(null);
    busyCallback.current?.(true);
    try {
      const result = action === "analyzing"
        ? await library.analyzeVoice(voice.id)
        : await library.normalizeVoice(voice.id, targetLufs);
      if (mounted.current) {
        setAnalysis(result);
        if (action === "saving") setSavedTarget(targetLufs);
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && cause.message ? cause.message
        : action === "analyzing" ? "ボイスの音量を確認できませんでした。" : "ボイスの音量を保存できませんでした。");
    } finally {
      if (pending.current) {
        pending.current = false;
        busyCallback.current?.(false);
      }
      if (mounted.current) setStage(null);
    }
  }

  const current = analysis === null ? t("未確認") : measurable ? `${measuredLufs.toFixed(1)} LUFS` : t("測定不可");
  return <View style={styles.section} testID="voice-loudness-details">
    <AppText variant="subtitle">音量調整</AppText>
    <AppText localize={false} testID="voice-loudness-summary" accessibilityLiveRegion="polite">
      {`${t("現在：")} ${current} ／ ${t("目標：")} ${targetLufs} LUFS`}
    </AppText>
    <PrimaryButton title="音量を確認" tone="secondary" disabled={locked}
      onPress={() => void perform("analyzing")} testID="voice-loudness-analyze" />
    <View style={styles.targetRow}>
      <TargetButton label="−1" accessibilityLabel={t("目標を1 LUFS下げる")}
        disabled={locked || targetLufs <= MIN_VOICE_LUFS} onPress={() => setTargetLufs((value) => Math.max(MIN_VOICE_LUFS, value - 1))}
        testID="voice-loudness-target-down" />
      <AppText localize={false} style={styles.targetValue} testID="voice-loudness-target">{`${targetLufs} LUFS`}</AppText>
      <TargetButton label="＋1" accessibilityLabel={t("目標を1 LUFS上げる")}
        disabled={locked || targetLufs >= MAX_VOICE_LUFS} onPress={() => setTargetLufs((value) => Math.min(MAX_VOICE_LUFS, value + 1))}
        testID="voice-loudness-target-up" />
    </View>
    <AppText variant="muted">目標は−30〜−20 LUFSで選べます。−20に近いほど大きくなります。</AppText>
    <AppText variant="muted">調整した音声はM4A（AAC）形式で圧縮保存します。モノラルは64kbps、ステレオは128kbpsです。容量は元の音声によって変わります。</AppText>
    <PrimaryButton title="音量を調整して保存" tone="save" disabled={locked || !measurable}
      onPress={() => void perform("saving")} testID="voice-loudness-save" />
    <AppText variant="muted">保存すると、格納した音声を調整後の音声に置き換えます。取り込み元のファイルは変更しません。</AppText>
    {stage ? <View style={styles.progress} accessibilityLiveRegion="polite" testID="voice-loudness-progress">
      <ActivityIndicator color="#fff" />
      <AppText>{stage === "analyzing" ? "音量を確認中..." : "音量を調整して保存中..."}</AppText>
    </View> : null}
    {analysis !== null && !measurable ? <AppText variant="muted" testID="voice-loudness-unmeasurable">音量を測定できないため、この音声は調整できません。</AppText> : null}
    {savedTarget !== null ? <AppText variant="muted" accessibilityLiveRegion="polite" testID="voice-loudness-saved">
      {peakLimited ? "音割れを避けるため、目標より小さい音量で保存しました。" : "音量を調整して保存しました。"}
    </AppText> : null}
    {error ? <AppText accessibilityRole="alert" style={styles.error} testID="voice-loudness-error">{error}</AppText> : null}
  </View>;
}

function TargetButton({ label, accessibilityLabel, disabled, onPress, testID }: {
  label: string; accessibilityLabel: string; disabled: boolean; onPress(): void; testID: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} testID={testID}
    style={({ pressed }) => [styles.targetButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <AppText localize={false} style={styles.targetButtonText}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  section: { gap: 12, borderTopWidth: 1, borderTopColor: "#52728e", paddingTop: 14 },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  targetValue: { flex: 1, textAlign: "center", fontWeight: "800" },
  targetButton: { minWidth: 58, minHeight: 44, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#fff", borderRadius: 4, backgroundColor: "#194770" },
  targetButtonText: { fontWeight: "800" },
  progress: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  error: { color: "#ff8b91" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
