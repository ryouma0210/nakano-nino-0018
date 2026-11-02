import { useRef, useState } from "react";
import type { VoiceSeekBarProps } from "./VoiceSeekBar.types";

/** A native range input supplies keyboard, touch, and screen-reader semantics on Web. */
export function VoiceSeekBar({ position, duration, disabled, label, onSeek }: VoiceSeekBarProps) {
  const dragging = useRef(false);
  const draftRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const enabled = !disabled && duration > 0;
  function cancel() { dragging.current = false; draftRef.current = null; setDraft(null); }
  function commit() {
    const next = draftRef.current;
    cancel();
    if (enabled && next !== null) onSeek(next);
  }
  return <input type="range" min={0} max={Math.max(0, duration)} step={1}
    value={Math.max(0, Math.min(duration, draft ?? position))} disabled={!enabled}
    aria-label={label} data-testid="voice-seek-bar"
    style={{ display: "block", width: "100%", minWidth: 0, height: 44, margin: 0, accentColor: "#87c6ff", cursor: enabled ? "pointer" : "default" }}
    onPointerDown={(event) => {
      if (!enabled) return;
      dragging.current = true;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Optional pointer capture. */ }
    }}
    onChange={(event) => {
      const next = Number(event.currentTarget.value);
      if (dragging.current) { draftRef.current = next; setDraft(next); }
      else if (enabled) onSeek(next);
    }}
    onPointerUp={commit} onPointerCancel={cancel} onBlur={commit}
  />;
}
