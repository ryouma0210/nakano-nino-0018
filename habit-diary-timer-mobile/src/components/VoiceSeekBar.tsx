import { useRef, useState } from "react";
import { StyleSheet, View, type GestureResponderEvent } from "react-native";
import type { VoiceSeekBarProps } from "./VoiceSeekBar.types";

export function VoiceSeekBar({ position, duration, disabled, label, onSeek }: VoiceSeekBarProps) {
  const [width, setWidth] = useState(0);
  const [draft, setDraft] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const enabled = !disabled && duration > 0;
  const value = Math.max(0, Math.min(duration, draft ?? position));
  const percent = duration > 0 ? value / duration * 100 : 0;
  function update(event: GestureResponderEvent) {
    if (!enabled || width <= 0) return;
    const next = Math.max(0, Math.min(1, event.nativeEvent.locationX / width)) * duration;
    draftRef.current = next;
    setDraft(next);
  }
  function cancel() { draftRef.current = null; setDraft(null); }
  return <View accessible accessibilityRole="adjustable" accessibilityLabel={label}
    accessibilityState={{ disabled: !enabled }} accessibilityValue={{ min: 0, max: Math.max(0, duration), now: value }}
    accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
    onAccessibilityAction={(event) => {
      if (!enabled) return;
      const delta = event.nativeEvent.actionName === "increment" ? 15 : event.nativeEvent.actionName === "decrement" ? -15 : 0;
      if (delta) onSeek(Math.max(0, Math.min(duration, position + delta)));
    }}
    testID="voice-seek-bar" style={[styles.touch, !enabled && styles.disabled]}
    onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    onStartShouldSetResponder={() => enabled}
    onResponderGrant={update} onResponderMove={update}
    onResponderTerminationRequest={() => false} onResponderTerminate={cancel}
    onResponderRelease={() => { const next = draftRef.current; cancel(); if (enabled && next !== null) onSeek(next); }}>
    <View pointerEvents="none" style={styles.rail}>
      <View style={[styles.fill, { width: `${percent}%` }]} />
      <View style={[styles.thumb, { left: `${percent}%` }]} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  touch: { minHeight: 44, justifyContent: "center", paddingHorizontal: 0, marginHorizontal: 9 },
  rail: { height: 6, borderRadius: 3, backgroundColor: "#34485a" },
  fill: { height: 6, borderRadius: 3, backgroundColor: "#87c6ff" },
  thumb: { position: "absolute", width: 18, height: 18, top: -6, marginLeft: -9, borderRadius: 9, backgroundColor: "#c1e3ff" },
  disabled: { opacity: 0.4 },
});
