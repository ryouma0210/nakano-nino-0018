import { useCallback, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppAudio } from "@/audio/AudioProvider";
import { useAppModal } from "@/components/AppModalProvider";
import { AppText } from "@/components/AppText";
import { LocalizedPressable } from "@/components/LocalizedPressable";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextField } from "@/components/TextField";
import { lightTheme } from "@/constants/theme";
import { translateText } from "@/i18n";
import {
  advanceCountdown, createCountdown, formatCountdown, parseCountdownDuration,
  pauseCountdown, resumeCountdown, startCountdown, type CountdownState,
} from "./countdown";

const DEFAULT_DURATION_MS = 60_000;

function TimerButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  const { playEffect } = useAppAudio();
  return (
    <LocalizedPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { playEffect("button"); onPress(); }}
      style={({ pressed }) => [styles.button, disabled && styles.disabledButton, pressed && !disabled && styles.pressedButton]}
    >
      <AppText style={styles.buttonText}>{title}</AppText>
    </LocalizedPressable>
  );
}

export function SugorokuTimer() {
  const { settings, playEffect } = useAppAudio();
  const language = settings?.language ?? "ja";
  const { showNotice } = useAppModal();
  const [minutes, setMinutes] = useState("1");
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [timer, setTimer] = useState(() => createCountdown(DEFAULT_DURATION_MS));
  const current = useRef(timer);
  const focused = useRef(false);
  const appState = useRef(AppState.currentState);

  const commit = useCallback((next: CountdownState) => {
    const previous = current.current;
    if (next === previous) return;
    // Update synchronously so a foreground callback and interval cannot notify twice.
    current.current = next;
    setTimer(next);
    if (previous.status === "running" && next.status === "complete" && focused.current &&
      appState.current !== "background" && appState.current !== "inactive") {
      setOpen(false);
      showNotice("時間になりました", "設定した時間が経過しました。");
    }
  }, [showNotice]);

  const tick = useCallback(() => {
    if (!focused.current || appState.current === "background" || appState.current === "inactive") return;
    commit(advanceCountdown(current.current, Date.now()));
  }, [commit]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    appState.current = AppState.currentState;
    tick();
    const interval = setInterval(tick, 200);
    const subscription = AppState.addEventListener("change", (state) => {
      appState.current = state;
      // The deadline keeps advancing while the app is in the background.
      if (state === "active") tick();
    });
    return () => {
      focused.current = false;
      clearInterval(interval);
      subscription.remove();
      // Leaving this screen pauses the timer and never opens a notice elsewhere.
      commit(pauseCountdown(current.current, Date.now()));
      setOpen(false);
    };
  }, [commit, tick]));

  function toggle() {
    const state = current.current;
    if (state.status === "running") {
      commit(pauseCountdown(state, Date.now()));
    } else if (state.status === "paused") {
      commit(resumeCountdown(state, Date.now()));
    } else {
      const duration = parseCountdownDuration(minutes);
      if (duration === null) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      commit(startCountdown(duration, Date.now()));
    }
  }

  function reset() {
    setInvalid(false);
    commit(createCountdown(parseCountdownDuration(minutes) ?? 0));
  }

  function changeMinutes(value: string) {
    setMinutes(value);
    setInvalid(false);
    commit(createCountdown(parseCountdownDuration(value) ?? 0));
  }

  const editable = timer.status === "idle" || timer.status === "complete";
  const remaining = timer.status === "idle" ? parseCountdownDuration(minutes) ?? 0 : timer.remainingMs;
  const display = formatCountdown(remaining);
  const showCountdown = timer.status === "running" || timer.status === "paused";
  const launcherTitle = `${translateText("タイマー", language)}${showCountdown ? ` ${display}` : ""}`;

  return (
    <>
      <LocalizedPressable
        testID="sugoroku-timer-button"
        accessibilityRole="button"
        accessibilityLabel={launcherTitle}
        onPress={() => { playEffect("button"); setInvalid(false); setOpen(true); }}
        style={({ pressed }) => [styles.launcher, pressed && styles.pressedButton]}
      >
        <AppText localize={false} numberOfLines={1} style={[styles.launcherText, showCountdown && styles.launcherCountdown]}>
          {launcherTitle}
        </AppText>
      </LocalizedPressable>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView style={styles.settingsScroll} contentContainerStyle={styles.settingsContent} keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.dialog}>
              <View style={styles.header}>
                <AppText variant="subtitle" accessibilityRole="header" style={styles.title}>タイマー</AppText>
                <AppText
                  localize={false}
                  accessibilityLabel={`${translateText("残り時間", language)} ${display}`}
                  style={styles.time}
                >{display}</AppText>
              </View>
              <TextField
                label="分設定"
                accessibilityLabel={translateText("タイマーの分", language)}
                keyboardType="number-pad"
                inputMode="numeric"
                value={minutes}
                maxLength={3}
                editable={editable}
                onChangeText={changeMinutes}
                selectTextOnFocus
              />
              {invalid ? <AppText accessibilityRole="alert" style={styles.error}>分は1〜999の整数で設定してください。</AppText> : null}
              <View style={styles.buttons}>
                <TimerButton title={timer.status === "running" ? "一時停止" : timer.status === "paused" ? "再開" : "開始"} onPress={toggle} />
                <TimerButton title="リセット" onPress={reset} />
              </View>
              <PrimaryButton title="閉じる" tone="secondary" onPress={() => setOpen(false)} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  launcher: { minHeight: 46, paddingHorizontal: 6, borderWidth: 1, borderColor: "#000", borderRadius: 4, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  launcherText: { maxWidth: "100%", color: "#111", fontWeight: "800", textAlign: "center", fontVariant: ["tabular-nums"] },
  launcherCountdown: { fontSize: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { flexShrink: 1, minWidth: 0 },
  time: { fontSize: 24, lineHeight: 30, fontWeight: "800", fontVariant: ["tabular-nums"] },
  buttons: { flexDirection: "row", gap: 6 },
  button: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 4, paddingVertical: 6, borderWidth: 1, borderColor: "#fff", borderRadius: 4, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  buttonText: { fontSize: 13, lineHeight: 18, fontWeight: "800", textAlign: "center" },
  disabledButton: { opacity: 0.45 },
  pressedButton: { opacity: 0.75 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)" },
  settingsScroll: { flex: 1 },
  settingsContent: { flexGrow: 1, padding: 24, alignItems: "center", justifyContent: "center" },
  dialog: { width: "100%", maxWidth: 360, gap: 16, padding: 20, borderWidth: 1, borderColor: "#fff", backgroundColor: "#080808" },
  error: { color: lightTheme.danger },
});
