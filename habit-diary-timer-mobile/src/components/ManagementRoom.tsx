import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View, type ImageSourcePropType } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DailyOrderWheel } from "@/components/DailyOrderWheel";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { managementDeadlineLabel, managementRemainingTime } from "@/components/managementTime";
import { managementRepository, type ManagementMode } from "@/repositories/roomRepository";
import { managementRouletteService, type ManagementRouletteDraw, type ManagementRouletteState } from "@/services/managementRouletteService";
import { MANAGEMENT_EXTENSION_MINUTES } from "@/services/managementRouletteStorage";
import { formatDateJa, toDateKey } from "@/utils/date";
import { useAppAudio } from "@/audio/AudioProvider";
import { findManagementMessage, formatConfiguredMessage, roomMessages } from "@/constants/messages";
import { formatError } from "@/utils/error";
import { customCommandService } from "@/services/customCommandService";

function managementModeLabel(mode: ManagementMode) { return mode === "release" ? "貞操帯なし" : "貞操帯あり"; }
function extensionLabel(minutes: number) {
  return minutes === 1440 ? "1日" : minutes === 300 ? "5時間" : minutes === 60 ? "1時間" : `${minutes}分`;
}
const managementWheelLabels = [
  ...MANAGEMENT_EXTENSION_MINUTES.map((minutes) => `＋${extensionLabel(minutes)}\n延長`),
  "⑦", "⑧", "⑨", "⑩", "⑪",
];

export function ManagementRoom({ mode, title, characterSource, onChangeMode }: {
  mode: ManagementMode; title: string; characterSource: ImageSourcePropType; onChangeMode?: () => void;
}) {
  const { settings } = useAppAudio();
  const [state, setState] = useState<ManagementRouletteState | null>(null);
  const stateRef = useRef<ManagementRouletteState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinId, setSpinId] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [rerollConfirmation, setRerollConfirmation] = useState(false);
  const [changeModeConfirmation, setChangeModeConfirmation] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const cycle = state?.cycle;
  const busy = rolling || spinning || loading;
  const playerName = settings?.playerName.trim() ?? "";
  const canRelease = Boolean(state && cycle?.is_active && state.day.endedAt && state.pendingTasks.length === 0 && Date.parse(state.deadlineAt) <= now);

  const applyState = useCallback((next: ManagementRouletteState | null) => {
    stateRef.current = next;
    setState(next);
    setNow(Date.now());
  }, []);

  const refresh = useCallback(() => {
    try {
      const active = managementRepository.active(mode);
      const next = active ? managementRouletteService.state(active) : null;
      applyState(next);
      setSelectedIndex(next?.day.draws.at(-1)?.candidateIndex ?? null);
      setLoading(false);
    } catch (error) { setErrorMessage(formatError(error)); setLoading(true); }
  }, [applyState, mode]);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    refresh();
    let previousTime = Date.now();
    const tick = () => {
      if (AppState.currentState === "background" || AppState.currentState === "inactive") return;
      const nextTime = Date.now();
      const snapshot = stateRef.current;
      if (toDateKey(new Date(previousTime)) !== toDateKey(new Date(nextTime)) ||
        (snapshot && previousTime < Date.parse(snapshot.deadlineAt) && nextTime >= Date.parse(snapshot.deadlineAt))) {
        busyRef.current = false;
        setSpinning(false);
        refresh();
      }
      previousTime = nextTime;
      setNow(nextTime);
    };
    const timer = setInterval(tick, 1000);
    const listener = AppState.addEventListener("change", (status) => {
      if (status === "active") { refresh(); tick(); }
      else {
        if (rollTimer.current) clearTimeout(rollTimer.current);
        rollTimer.current = null;
        busyRef.current = false;
        setRolling(false);
        setSpinning(false);
      }
    });
    return () => {
      setFocused(false);
      clearInterval(timer);
      listener.remove();
      if (rollTimer.current) clearTimeout(rollTimer.current);
      rollTimer.current = null;
      busyRef.current = false;
      setRolling(false);
      setSpinning(false);
    };
  }, [refresh]));

  useEffect(() => {
    if (!focused || !state || spinning || AppState.currentState === "background" || AppState.currentState === "inactive") return;
    try {
      const visible = [...state.day.draws, ...state.pendingTasks].flatMap((draw) => draw.kind === "task"
        ? [{ text: draw.instruction, customCommandId: draw.customCommandId, finalDay: false }] : []);
      if (showHistory) for (const day of state.days) for (const draw of day.draws) {
        if (draw.kind === "task") visible.push({ text: draw.instruction, customCommandId: draw.customCommandId, finalDay: false });
      }
      if (canRelease) visible.push({ text: state.finalInstruction, customCommandId: undefined, finalDay: true });
      customCommandService.markSeen(mode, visible);
    } catch (error) { setErrorMessage(formatError(error)); }
  }, [state, mode, spinning, showHistory, canRelease, focused]);

  function roll(replace = false) {
    if (busyRef.current || loading) return;
    busyRef.current = true;
    setRolling(true);
    const previousId = cycle?.id;
    rollTimer.current = setTimeout(() => {
      try {
        const dice = Math.floor(Math.random() * 6) + 1;
        const next = replace && previousId ? managementRepository.reroll(previousId, mode, dice) : managementRepository.roll(mode, dice);
        applyState(managementRouletteService.state(next));
        setSelectedIndex(null);
        setShowHistory(false);
      } catch (error) { setErrorMessage(formatError(error)); }
      finally { rollTimer.current = null; busyRef.current = false; setRolling(false); }
    }, 650);
  }

  function spin() {
    if (!cycle || !cycle.is_active || busyRef.current || busy || state?.day.endedAt) return;
    busyRef.current = true;
    try {
      const result = managementRouletteService.spin(cycle.id);
      // Save before the animation: closing the app cannot discard an outcome.
      applyState(result.state);
      setSelectedIndex(result.draw.candidateIndex);
      setSpinId((value) => value + 1);
      setSpinning(true);
      setShowHistory(false);
    } catch (error) { busyRef.current = false; setErrorMessage(formatError(error)); }
  }

  function update(action: () => ManagementRouletteState) {
    if (busy || busyRef.current) return;
    busyRef.current = true;
    try { applyState(action()); }
    catch (error) { setErrorMessage(formatError(error)); }
    finally { busyRef.current = false; }
  }

  function completeDraw(drawId: string) {
    if (cycle) update(() => managementRouletteService.completeDrawTask(cycle.id, drawId));
  }

  function finishManagement() {
    if (!cycle) return;
    update(() => {
      managementRouletteService.finishManagement(cycle.id);
      return managementRouletteService.state(cycle.id);
    });
  }

  function changeMode() {
    if (busy || busyRef.current) return;
    try {
      if (cycle) managementRepository.removeCycle(cycle.id);
      applyState(null);
      onChangeMode?.();
    } catch (error) { setErrorMessage(formatError(error)); }
  }

  const remaining = state ? managementRemainingTime(state.deadlineAt, now) : null;
  const currentDraws = state ? spinning ? state.day.draws.slice(0, -1) : state.day.draws : [];
  const carriedTasks = state?.pendingTasks.filter((draw) => !state.day.draws.some((todayDraw) => todayDraw.id === draw.id)) ?? [];

  return (
    <Screen>
      <PageTitle>{title}</PageTitle>
      {state && remaining ? <Card>
        <AppText variant="label">射精許可日</AppText>
        <AppText style={styles.deadline} localize={false}>{managementDeadlineLabel(state.deadlineAt)}</AppText>
        <AppText variant="label">残り時間</AppText>
        <AppText style={styles.countdown}>{`${remaining.days}日 ${remaining.clock}`}</AppText>
        <AppText variant="muted">許可日時に達し、その日の抽選と課題を終えると管理を完了できます。</AppText>
        {!cycle?.is_active ? <AppText style={styles.done}>管理完了</AppText> : null}
      </Card> : null}
      <RoomConversation characterSource={characterSource} roomName={title}
        lines={roomMessages.managementSession.lines} contractLines={roomMessages.managementSession.contractLines} />
      <Card>
        <AppText variant="label">選択中</AppText>
        <AppText variant="subtitle">{managementModeLabel(mode)}</AppText>
        {onChangeMode ? <PrimaryButton title="管理方法を選び直す" tone="secondary" disabled={busy}
          onPress={() => cycle ? setChangeModeConfirmation(true) : onChangeMode()} /> : null}
      </Card>
      {loading ? <Card><PrimaryButton title="再読み込み" tone="secondary" onPress={refresh} /></Card> : !state ? (
        <Card>
          <AppText variant="subtitle">射精管理期間を決める</AppText>
          <AppText>サイコロの目 × 3日間を初期期間にします。開始後のルーレットで時間が延長されます。</AppText>
          <AppText style={styles.dice}>{rolling ? "…" : "🎲"}</AppText>
          <PrimaryButton title={rolling ? "サイコロを振っています" : "サイコロを振る"} disabled={busy} onPress={() => roll()} />
        </Card>
      ) : <>
        {cycle?.is_active ? <Card>
          <AppText variant="subtitle">本日のルーレット</AppText>
          <AppText>{formatDateJa(state.day.date)}</AppText>
          <AppText>1日最低2回抽選し、当たった課題をすべて完了してから「本日を終了」を押してください。</AppText>
          <AppText>{`本日の抽選：${state.spinCount}回`}</AppText>
          {state.remainingSpins > 0 ? <AppText>{`あと${state.remainingSpins}回必要です。`}</AppText> : null}
          {!state.day.endedAt ? <>
            <DailyOrderWheel count={managementWheelLabels.length} labels={managementWheelLabels}
              completedIndices={Array.from({ length: managementWheelLabels.length }, (_, index) => index)}
              selectedIndex={selectedIndex} spinning={spinning} spinId={spinId}
              onSpinEnd={() => { busyRef.current = false; setSpinning(false); }} />
            <AppText variant="muted">⑦〜⑪：課題</AppText>
            <PrimaryButton title={spinning ? "ルーレットを回しています" : "ルーレットを回す"}
              tone="defeat" disabled={busy} onPress={spin} />
            <AppText variant="muted">2回目以降も、本日を終了するまでは追加で回せます。</AppText>
          </> : <AppText style={styles.done}>本日は完了済み</AppText>}
          {currentDraws.map((draw, index) => <DrawRow key={draw.id} draw={draw} number={index + 1}
            playerName={playerName} disabled={busy} onComplete={completeDraw} />)}
          {carriedTasks.length ? <AppText variant="label">前日までの未完了課題</AppText> : null}
          {carriedTasks.map((draw) => <DrawRow key={draw.id} draw={draw} playerName={playerName} disabled={busy} onComplete={completeDraw} />)}
          {!state.day.endedAt ? <PrimaryButton title="本日を終了" tone="save" disabled={busy || !state.canFinishDay}
            onPress={() => update(() => managementRouletteService.finishDay(state.cycle.id))} /> : null}
        </Card> : null}
        {canRelease ? <Card>
          <AppText variant="label">最終日の指示</AppText>
          <AppText style={styles.instruction}>{formatInstruction(state.finalInstruction, playerName)}</AppText>
          <PrimaryButton title="管理を完了" tone="save" disabled={busy} onPress={finishManagement} />
        </Card> : null}
        <Card>
          <AppText>{`初期期間：${state.cycle.dice * 3}日間`}</AppText>
          <AppText variant="muted">{formatDateJa(state.cycle.start_date)} ～ {formatDateJa(state.cycle.end_date)}</AppText>
          <PrimaryButton title={showHistory ? "進行ログを閉じる" : "進行ログを見る"} tone="secondary" disabled={busy} onPress={() => setShowHistory((shown) => !shown)} />
          {showHistory ? [...state.days].reverse().map((day) => <View key={day.date} style={styles.historyDay}>
            <AppText variant="label">{formatDateJa(day.date)} / {day.endedAt ? "完了" : "未完了"}</AppText>
            {day.draws.map((draw, index) => <DrawRow key={draw.id} draw={draw} number={index + 1} playerName={playerName} disabled={busy} />)}
          </View>) : null}
          <PrimaryButton title={rolling ? "サイコロを振っています" : "サイコロを振り直す"} tone="danger" disabled={busy}
            onPress={() => setRerollConfirmation(true)} />
        </Card>
      </>}
      <PrimaryButton title="ホームへ戻る" tone="secondary" onPress={() => router.replace("/(tabs)")} />
      <ConfirmModal visible={changeModeConfirmation} title="管理方法を選び直しますか？"
        message="現在選択している管理方法の期間・日別指示・完了記録・獲得ポイントを削除して、管理方法の選択へ戻ります。"
        confirmLabel="削除して選び直す" confirmTone="danger" onCancel={() => setChangeModeConfirmation(false)}
        onConfirm={() => { setChangeModeConfirmation(false); changeMode(); }} />
      <ConfirmModal visible={rerollConfirmation} title="サイコロを振り直しますか？"
        message="現在の管理期間と、この期間に記録された実績・完了記録はすべて削除されます。"
        confirmLabel="削除して振り直す" confirmTone="danger" onCancel={() => setRerollConfirmation(false)}
        onConfirm={() => { setRerollConfirmation(false); roll(true); }} />
      <ConfirmModal visible={Boolean(errorMessage)} title="射精管理の保存に失敗しました" message={errorMessage}
        confirmLabel="閉じる" showCancel={false} onCancel={() => setErrorMessage("")} onConfirm={() => setErrorMessage("")} />
    </Screen>
  );
}

function formatInstruction(instruction: string, playerName: string) {
  const message = findManagementMessage(instruction);
  return message ? formatConfiguredMessage(message, playerName) : instruction;
}

function DrawRow({ draw, number, playerName, disabled, onComplete }: {
  draw: ManagementRouletteDraw; number?: number; playerName: string; disabled: boolean; onComplete?: (id: string) => void;
}) {
  return <View style={styles.draw}>
    {number != null ? <AppText variant="label">{`${number}回目`}</AppText> : <AppText variant="label">{formatDateJa(toDateKey(new Date(draw.drawnAt)))}</AppText>}
    {draw.kind === "extension" ? <AppText>{`＋${extensionLabel(draw.minutes)} 延長`}</AppText> : <>
      <AppText localize={!draw.customCommandId} style={styles.instruction}>
        {draw.customCommandId ? draw.instruction : formatInstruction(draw.instruction, playerName)}
      </AppText>
      {draw.completedAt ? <AppText style={styles.done}>完了</AppText> : onComplete ?
        <PrimaryButton title="課題完了" tone="save" disabled={disabled} onPress={() => onComplete(draw.id)} /> : <AppText>未完了</AppText>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  deadline: { fontSize: 21, lineHeight: 30, fontWeight: "900", color: "#ff9bc7" },
  countdown: { fontSize: 26, lineHeight: 36, fontWeight: "900", fontVariant: ["tabular-nums"] },
  dice: { fontSize: 58, lineHeight: 76, textAlign: "center", padding: 12 },
  instruction: { fontSize: 18, lineHeight: 28, fontWeight: "700" },
  done: { color: "#a5d875", fontWeight: "800" },
  draw: { borderTopWidth: 1, borderTopColor: "#555", paddingTop: 12, gap: 8 },
  historyDay: { gap: 12, padding: 12, borderWidth: 1, borderColor: "#888", borderRadius: 8 },
});
