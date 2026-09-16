import { Fragment, useCallback, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { AppText } from "./AppText";
import { Card } from "./Card";
import { PrimaryButton } from "./PrimaryButton";
import { useAppAudio } from "@/audio/AudioProvider";
import { translateText } from "@/i18n";
import { getDisplayController, type DisplayController, type DisplayState } from "@/services/displaySettingsService";

export function DesktopDisplaySettings() {
  return Platform.OS === "web" ? <WebDisplaySettings /> : null;
}

function WebDisplaySettings() {
  const { settings } = useAppAudio();
  const language = settings?.language ?? "ja";
  const controller = useRef<DisplayController | null>(null);
  const focused = useRef(false);
  const version = useRef(0);
  const changing = useRef(false);
  const [available, setAvailable] = useState(false);
  const [native, setNative] = useState(false);
  const [state, setState] = useState<DisplayState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const current = controller.current;
    if (!current || !focused.current) return;
    const request = ++version.current;
    try {
      const next = await current.read();
      if (!focused.current || request !== version.current) return;
      setState(next);
      setError((currentError) => currentError === "画面設定を読み込めませんでした。" ? null : currentError);
    } catch {
      if (focused.current && request === version.current) {
        setState(null);
        setError("画面設定を読み込めませんでした。");
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    const current = getDisplayController();
    controller.current = current;
    setAvailable(Boolean(current));
    setNative(current?.native ?? false);
    setSaving(changing.current);
    setError(null);
    setState(null);
    const unsubscribe = current?.subscribe(() => { void reload(); });
    void reload();
    return () => {
      focused.current = false;
      version.current += 1;
      unsubscribe?.();
    };
  }, [reload]));

  async function change(operation: () => Promise<unknown>) {
    if (changing.current || !state || !focused.current) return;
    changing.current = true;
    setSaving(true);
    setError(null);
    try {
      await operation();
      await reload();
    } catch {
      if (focused.current) setError("画面設定を変更できませんでした。");
    } finally {
      changing.current = false;
      if (focused.current) setSaving(false);
    }
  }

  if (!available) return null;
  return (
    <Card>
      <AppText variant="subtitle">画面表示</AppText>
      {!state ? (
        error ? <PrimaryButton title="再読み込み" tone="secondary" onPress={() => void reload()} />
          : <AppText variant="muted">読み込み中...</AppText>
      ) : (
        <>
          <View style={styles.row}>
            <AppText style={styles.label}>全画面表示</AppText>
            <Switch
              accessibilityLabel={translateText("全画面表示", language)}
              value={state.fullScreen}
              disabled={saving}
              onValueChange={(enabled) => void change(() => controller.current!.setFullScreen(enabled))}
            />
          </View>
          <AppText variant="muted">
            {native ? "F11キーでも切り替えできます。表示状態は次回起動時にも引き継ぎます。" : "Escキーでも全画面表示を終了できます。"}
          </AppText>
          {native ? (
            <>
              <View style={styles.row}>
                <AppText style={styles.label}>表示倍率</AppText>
                <View style={styles.zoomControls}>
                  {([-1, 1] as const).map((direction) => (
                    <Fragment key={direction}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={translateText(direction === -1 ? "縮小" : "拡大", language)}
                      disabled={saving || (direction === -1 ? state.zoom <= 0.75 : state.zoom >= 2)}
                      onPress={() => void change(() => controller.current!.setZoom!(state.zoom + direction * 0.1))}
                      style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed, (saving || (direction === -1 ? state.zoom <= 0.75 : state.zoom >= 2)) && styles.disabled]}
                    >
                      <AppText localize={false}>{direction === -1 ? "−" : "+"}</AppText>
                    </Pressable>
                    {direction === -1 ? <AppText style={styles.zoomValue} localize={false}>{Math.round(state.zoom * 100)}%</AppText> : null}
                    </Fragment>
                  ))}
                </View>
              </View>
              <PrimaryButton title="標準に戻す" tone="secondary" disabled={saving || Math.abs(state.zoom - 1) < 0.001} onPress={() => void change(() => controller.current!.setZoom!(1))} />
            </>
          ) : null}
        </>
      )}
      {error ? <AppText style={styles.error} accessibilityLiveRegion="polite">{error}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  label: { flex: 1, minWidth: 100 },
  zoomControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  zoomButton: { width: 44, height: 44, borderRadius: 6, borderWidth: 1, borderColor: "#a9d5f2", alignItems: "center", justifyContent: "center", backgroundColor: "#20212b" },
  zoomValue: { minWidth: 54, textAlign: "center", fontWeight: "800" },
  pressed: { backgroundColor: "#354457" },
  disabled: { opacity: 0.4 },
  error: { color: "#ffadb9" },
});
