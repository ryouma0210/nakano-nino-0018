import { useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { timerRepository } from "@/repositories/timerRepository";
import { notificationService } from "@/services/notificationService";
import type { TimerPreset } from "@/types/models";
import { toDateTimeKey } from "@/utils/date";

export function useTimerController() {
  const [preset, setPreset] = useState<TimerPreset | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [pauseCount, setPauseCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = Boolean(startedAt && endsAt && !paused);

  useEffect(() => {
    if (!running || !endsAt) return undefined;
    intervalRef.current = setInterval(() => {
      const next = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000));
      setRemainingSeconds(next);
      if (next <= 0) {
        complete();
      }
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // complete() intentionally stays outside the dependency array to avoid resetting the active interval every tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, endsAt]);

  async function playDoneFeedback(currentPreset: TimerPreset) {
    if (currentPreset.vibration_enabled) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (currentPreset.sound_enabled) {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => undefined);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  async function start(nextPreset: TimerPreset) {
    const now = new Date();
    const end = new Date(now.getTime() + nextPreset.duration_seconds * 1000);
    setPreset(nextPreset);
    setStartedAt(now);
    setEndsAt(end);
    setRemainingSeconds(nextPreset.duration_seconds);
    setPaused(false);
    setPauseCount(0);
    await notificationService.scheduleTimerDone(nextPreset.name, nextPreset.duration_seconds);
  }

  function pause() {
    if (!running) return;
    setPaused(true);
    setPauseCount((count) => count + 1);
  }

  function resume() {
    if (!preset || !paused) return;
    setEndsAt(new Date(Date.now() + remainingSeconds * 1000));
    setPaused(false);
  }

  function reset() {
    setStartedAt(null);
    setEndsAt(null);
    setPaused(false);
    setRemainingSeconds(0);
    setPauseCount(0);
  }

  async function complete() {
    if (!preset || !startedAt) return;
    const endedAt = new Date();
    timerRepository.saveHistory({
      presetId: preset.id,
      timerName: preset.name,
      startedAt: toDateTimeKey(startedAt),
      endedAt: toDateTimeKey(endedAt),
      actualDurationSeconds: Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)),
      completionStatus: "completed",
      pauseCount,
      relatedHabitId: preset.related_habit_id,
    });
    await playDoneFeedback(preset);
    reset();
  }

  function addSeconds(seconds: number) {
    if (!endsAt) return;
    setEndsAt(new Date(endsAt.getTime() + seconds * 1000));
  }

  return { preset, running, paused, remainingSeconds, start, pause, resume, reset, complete, addSeconds };
}
