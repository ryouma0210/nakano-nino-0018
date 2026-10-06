import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LocalizedPressable } from "@/components/LocalizedPressable";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import {
  arrangeFinishedBoard, chooseAssistedMove, chooseCpuMove, createGame, getLegalMoves, getScore, getTemptingMove, playMove, shouldShowTemptation,
  type Board, type Difficulty, type GameState,
} from "@/features/othello/game";
import { moveCoordinate, OthelloBoard } from "@/features/othello/OthelloBoard";
import { OthelloHistoryModal } from "@/features/othello/OthelloHistoryModal";
import { OthelloActionModal, type OthelloAction } from "@/features/othello/OthelloActionModal";
import { discardOthelloCurrent, loadOthello, saveOthelloCurrent, saveOthelloResult, type OthelloCurrent, type OthelloHistoryEntry } from "@/features/othello/storage";
import { getHardPressureCue, getOthelloAudioScene, HARD_PRESSURE_DIALOGUE_MS } from "@/features/othello/presentation";

const DIFFICULTIES: { value: Difficulty; title: string }[] = [
  { value: "easy", title: "イージー" },
  { value: "normal", title: "ノーマル" },
  { value: "hard", title: "ハード" },
];
const INVITATIONS = [
  "ここに打ってみない？ 気持ちよくなれるわよ♡",
  "このマス、気になるでしょう？ ほら、打てよ♡",
  "私のおすすめの場所は、こ・こ♡",
];
const TURN_DELAY_MS = 500;
const ACTION_DIALOGUE_MS = 1200;
const HARD_PRESSURE_MESSAGES = {
  single: "1個しか置けないね♡ちゃんと脳みそ働かしなさい♡",
  pass: "置ける場所・・・無くなったわね♡ふふ♡なんでかしら♡",
};
type Assistance = { kind: "manual" | "single"; game: GameState; move: number }
  | { kind: "fast"; intro: boolean; paused: boolean } | null;
type ActionTarget = { game: GameState; move: number } | null;

export default function OthelloScreen() {
  const { playEffect, setRoomAudioScene } = useAppAudio();
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [game, setGame] = useState<GameState | null>(null);
  const [pressureAcknowledged, setPressureAcknowledged] = useState<GameState | null>(null);
  const [active, setActive] = useState(false);
  const [dialog, setDialog] = useState<"restart" | "leave" | "surrender" | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<OthelloHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [resumable, setResumable] = useState<OthelloCurrent | null>(null);
  const [progressStatus, setProgressStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [transitioning, setTransitioning] = useState(false);
  const transitionRef = useRef(false);
  const progressVersion = useRef(0);
  const [match, setMatch] = useState<{ id: string; startedAt: string } | null>(null);
  const [finishReason, setFinishReason] = useState<"completed" | "surrender">("completed");
  const [showFinalPosition, setShowFinalPosition] = useState(false);
  const [temptation, setTemptation] = useState<{ board: Board; index: number } | null>(null);
  const [assistance, setAssistance] = useState<Assistance>(null);
  const assistanceRef = useRef<Assistance>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget>(null);
  const actionTargetRef = useRef<ActionTarget>(null);
  const currentGame = useRef(game);
  const activeRef = useRef(false);
  const jobVersion = useRef(0);
  const historyVersion = useRef(0);
  const saving = useRef(false);
  const pendingResult = useRef<OthelloHistoryEntry | null>(null);

  const updateAssistance = useCallback((value: Assistance) => {
    assistanceRef.current = value;
    setAssistance(value);
  }, []);
  const updateActionTarget = useCallback((value: ActionTarget) => {
    actionTargetRef.current = value;
    setActionTarget(value);
  }, []);

  const refreshHistory = useCallback(async () => {
    const version = ++historyVersion.current;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const next = await loadOthello();
      if (version === historyVersion.current) {
        setHistory(next.history);
        setResumable(next.current);
      }
    } catch {
      if (version === historyVersion.current) setHistoryError(true);
    } finally {
      if (version === historyVersion.current) setHistoryLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshHistory();
    return () => { historyVersion.current += 1; };
  }, [refreshHistory]));

  const persistResult = useCallback(async (entry: OthelloHistoryEntry) => {
    if (saving.current) return;
    saving.current = true;
    setSaveStatus("saving");
    try {
      const next = await saveOthelloResult(entry);
      setHistory(next);
      setHistoryError(false);
      setSaveStatus("saved");
      setResumable(null);
      pendingResult.current = null;
    } catch {
      setSaveStatus("error");
    } finally {
      saving.current = false;
    }
  }, []);

  useEffect(() => {
    if (game?.status !== "finished" || !match || saveStatus !== "idle" || saving.current) return;
    const count = getScore(game.board);
    const entry: OthelloHistoryEntry = pendingResult.current ?? {
      ...match, completedAt: new Date(Math.max(Date.now(), Date.parse(match.startedAt))).toISOString(), difficulty,
      humanCount: count.black, cpuCount: count.white,
      result: game.winner === 1 ? "win" : game.winner === -1 ? "loss" : "draw",
      reason: finishReason,
    };
    pendingResult.current = entry;
    void persistResult(entry);
  }, [difficulty, finishReason, game, match, persistResult, saveStatus]);

  const commit = useCallback((next: GameState | null) => {
    // A ref closes the gap before React re-renders, including rapid double taps.
    currentGame.current = next;
    setGame(next);
    setTemptation(null);
    if (next?.status !== "playing" || assistanceRef.current?.kind !== "fast") updateAssistance(null);
  }, [updateAssistance]);

  const progressSnapshot = useMemo<OthelloCurrent | null>(() => game?.status === "playing" && match ? {
    ...match, difficulty, game,
    assistance: assistance?.kind === "fast" ? { kind: "fast", paused: assistance.paused }
      : assistance && assistance.game === game ? { kind: assistance.kind, move: assistance.move } : null,
  } : null, [assistance, difficulty, game, match]);

  const persistProgress = useCallback(async (snapshot: OthelloCurrent) => {
    const version = ++progressVersion.current;
    setProgressStatus("saving");
    try {
      await saveOthelloCurrent(snapshot);
      if (version === progressVersion.current) setProgressStatus("saved");
      return true;
    } catch {
      if (version === progressVersion.current) setProgressStatus("error");
      return false;
    }
  }, []);

  useEffect(() => {
    if (progressSnapshot) void persistProgress(progressSnapshot);
  }, [persistProgress, progressSnapshot]);

  useFocusEffect(useCallback(() => {
    const updateActivity = (state: string | null) => {
      const available = state !== "background" && state !== "inactive";
      if (activeRef.current === available) return;
      activeRef.current = available;
      jobVersion.current += 1;
      setActive(available);
    };
    updateActivity(AppState.currentState);
    const subscription = AppState.addEventListener("change", updateActivity);
    return () => {
      activeRef.current = false;
      jobVersion.current += 1;
      subscription.remove();
      setActive(false);
      setDialog(null);
      setHistoryOpen(false);
      updateActionTarget(null);
    };
  }, [updateActionTarget]));

  const pressureCue = useMemo(() => getHardPressureCue(game, difficulty), [difficulty, game]);
  const pressurePending = pressureCue !== null && pressureAcknowledged !== game;

  useEffect(() => {
    if (!pressurePending || !active || transitioning || progressStatus !== "saved" || dialog !== null
      || historyOpen || actionTarget !== null || (assistance?.kind === "fast" && assistance.paused)) return;
    const snapshot = game;
    const timeout = setTimeout(() => {
      if (activeRef.current && !transitionRef.current && currentGame.current === snapshot) setPressureAcknowledged(snapshot);
    }, HARD_PRESSURE_DIALOGUE_MS);
    return () => clearTimeout(timeout);
  }, [actionTarget, active, assistance, dialog, game, historyOpen, pressurePending, progressStatus, transitioning]);

  useEffect(() => {
    const version = ++jobVersion.current;
    if (!active || pressurePending || transitioning || progressStatus !== "saved" || dialog !== null || historyOpen || actionTarget !== null || game?.status !== "playing") return;
    const snapshot = game;
    const isCpuTurn = snapshot.turn === -1;
    if (assistance?.kind === "manual" || (assistance?.kind === "fast" && assistance.paused)) return;
    if (!assistance && !isCpuTurn && !shouldShowTemptation(snapshot.board, difficulty)) return;

    // Yield to render the turn label before bounded, local game-tree search.
    const timeout = setTimeout(() => {
      const isCurrent = () => activeRef.current && version === jobVersion.current && currentGame.current === snapshot && assistanceRef.current === assistance;
      if (!isCurrent()) return;
      if (assistance?.kind === "single") {
        if (assistance.game === snapshot && getLegalMoves(snapshot.board, 1).includes(assistance.move)) commit(playMove(snapshot, assistance.move));
      } else if (assistance?.kind === "fast") {
        const move = chooseAssistedMove(snapshot);
        if (move !== null && isCurrent()) {
          if (assistance.intro) updateAssistance({ ...assistance, intro: false });
          commit(playMove(snapshot, move));
        }
      } else if (isCpuTurn) {
        const move = chooseCpuMove(snapshot.board, difficulty);
        if (move !== null && isCurrent()) commit(playMove(snapshot, move));
      } else {
        const move = getTemptingMove(snapshot.board, difficulty);
        if (move !== null && isCurrent()) setTemptation({ board: snapshot.board, index: move });
      }
    }, assistance?.kind === "single" || (assistance?.kind === "fast" && assistance.intro)
      ? ACTION_DIALOGUE_MS : assistance?.kind === "fast" ? TURN_DELAY_MS / 2 : isCpuTurn ? TURN_DELAY_MS : 80);

    return () => {
      clearTimeout(timeout);
      jobVersion.current += 1;
    };
  }, [active, actionTarget, assistance, commit, dialog, difficulty, game, historyOpen, pressurePending, progressStatus, transitioning, updateAssistance]);

  const legalMoves = useMemo(() => {
    if (game?.status !== "playing" || game.turn !== 1 || !active || pressurePending || transitioning || progressStatus !== "saved" || dialog !== null || historyOpen || actionTarget !== null || assistance?.kind === "fast") return [];
    const moves = getLegalMoves(game.board, 1);
    return assistance && assistance.game === game ? moves.filter((move) => move === assistance.move) : moves;
  }, [active, actionTarget, assistance, dialog, game, historyOpen, pressurePending, progressStatus, transitioning]);
  const score = game ? getScore(game.board) : null;
  const fixedMove = assistance && assistance.kind !== "fast" && assistance.game === game ? assistance.move : null;
  const temptingMove = fixedMove !== null && legalMoves.includes(fixedMove) ? fixedMove
    : temptation !== null && temptation.board === game?.board && legalMoves.includes(temptation.index) ? temptation.index : null;
  const finished = game?.status === "finished";
  const displayedBoard = useMemo(() => game && finished && !showFinalPosition ? arrangeFinishedBoard(game.board) : game?.board, [finished, game, showFinalPosition]);
  const difficultyTitle = DIFFICULTIES.find((item) => item.value === difficulty)!.title;
  const resultPending = finished && saveStatus !== "saved";
  const audioScene = getOthelloAudioScene(game, difficulty, active, temptingMove);
  const actionMessage = assistance?.kind === "manual" ? "どこ握っているのかしら・・・？ｗほら♡モタモタしているから♡置く場所ここしかないわよ♡"
    : assistance?.kind === "single" ? "あーあ♡負けちゃった♡仕方ないわね♡アンタのその手は忙しいみたいだから、私が代わりに置いてあげるね♡"
      : assistance?.kind === "fast" ? assistance.paused ? "少し休憩ね。再開すると続きを進めるわ。" : "アンタはそこで、指くわえて見てなさい。出したらダメよ。" : null;

  useFocusEffect(useCallback(() => {
    setRoomAudioScene(audioScene);
    return () => setRoomAudioScene(null);
  }, [audioScene, setRoomAudioScene]));

  function start() {
    if (currentGame.current !== null || historyLoading || historyError || transitionRef.current) return;
    if (resumable) { openDialog("restart"); return; }
    jobVersion.current += 1;
    const startedAt = new Date().toISOString();
    setMatch({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`, startedAt });
    setFinishReason("completed");
    setShowFinalPosition(false);
    setSaveStatus("idle");
    pendingResult.current = null;
    commit(createGame());
  }

  function resume() {
    if (!resumable || currentGame.current !== null || historyLoading || historyError || transitionRef.current) return;
    jobVersion.current += 1;
    setMatch({ id: resumable.id, startedAt: resumable.startedAt });
    setDifficulty(resumable.difficulty);
    setFinishReason("completed");
    setShowFinalPosition(false);
    setSaveStatus("idle");
    pendingResult.current = null;
    commit(resumable.game);
    const control = resumable.assistance;
    updateAssistance(control?.kind === "fast" ? { kind: "fast", intro: false, paused: true }
      : control ? { ...control, game: resumable.game } : null);
    setResumable(null);
  }

  function humanMove(index: number) {
    const snapshot = currentGame.current;
    const control = assistanceRef.current;
    if (!activeRef.current || pressurePending || transitionRef.current || progressStatus !== "saved" || dialog !== null || historyOpen || actionTargetRef.current !== null || snapshot?.status !== "playing" || snapshot.turn !== 1 || !getLegalMoves(snapshot.board, 1).includes(index)) return;
    if (control?.kind === "single" || control?.kind === "fast" || (control?.kind === "manual" && (control.game !== snapshot || control.move !== index))) return;
    jobVersion.current += 1;
    playEffect("button");
    commit(playMove(snapshot, index));
  }

  function openDialog(value: "restart" | "leave" | "surrender") {
    jobVersion.current += 1;
    setDialog(value);
  }

  function openActionMenu() {
    const snapshot = currentGame.current;
    if (!activeRef.current || assistanceRef.current !== null || actionTargetRef.current !== null || snapshot !== game || snapshot?.status !== "playing" || snapshot.turn !== 1 || temptingMove === null) return;
    jobVersion.current += 1;
    updateActionTarget({ game: snapshot, move: temptingMove });
  }

  function selectAction(action: OthelloAction) {
    const target = actionTargetRef.current;
    if (!activeRef.current || !target || target.game !== currentGame.current || target.game.status !== "playing" || !getLegalMoves(target.game.board, 1).includes(target.move)) return;
    jobVersion.current += 1;
    updateActionTarget(null);
    updateAssistance(action === "fast" ? { kind: "fast", intro: true, paused: false } : { kind: action, game: target.game, move: target.move });
  }

  function toggleFastPlay() {
    const control = assistanceRef.current;
    if (control?.kind !== "fast") return;
    jobVersion.current += 1;
    updateAssistance({ ...control, paused: !control.paused });
  }

  async function chooseAgain() {
    if (resultPending || transitionRef.current) return;
    transitionRef.current = true;
    setTransitioning(true);
    jobVersion.current += 1;
    try {
      const id = currentGame.current?.status === "playing" ? match?.id : resumable?.id;
      if (id) await discardOthelloCurrent(id);
      progressVersion.current += 1;
      setResumable(null);
      setProgressStatus("idle");
      setDialog(null);
      setMatch(null);
      commit(null);
    } catch {
      setProgressStatus("error");
      setDialog(null);
    } finally {
      transitionRef.current = false;
      setTransitioning(false);
    }
  }

  async function saveAndLeave() {
    if (transitionRef.current || !progressSnapshot) return;
    transitionRef.current = true;
    setTransitioning(true);
    jobVersion.current += 1;
    if (await persistProgress(progressSnapshot)) {
      activeRef.current = false;
      setActive(false);
      setDialog(null);
      router.replace("/(tabs)/games");
    } else setDialog(null);
    transitionRef.current = false;
    setTransitioning(false);
  }

  function leave() {
    if (resultPending) return;
    if (game?.status === "playing") openDialog("leave");
    else router.replace("/(tabs)/games");
  }

  const status = finished
    ? game.winner === 1 ? "あなたの勝ち" : game.winner === -1 ? "私の勝ち" : "引き分け"
    : game?.turn === 1 ? "あなたの番です" : "私の番です";
  const finalDialogue = finished ? game.winner === 1 ? "あなたの勝ちね。次は私も負けないから。"
    : game.winner === -1 ? "私の勝ちね♡負け犬♡ざぁ～こ♡ざぁ～こ♡ほら、ソレ限界なんでしょ？紫の石の数見ながら、負け汁漏らせｗ"
      : "引き分けね。次の勝負で決着をつけましょう。" : null;

  return (
    <Screen desktopLayout="single">
      <View style={styles.container}>
        <AppText variant="title" accessibilityRole="header">オセロ</AppText>
        {historyError ? <Card><AppText>オセロのセーブデータを読み込めませんでした。</AppText><PrimaryButton title="再読み込み" tone="secondary" onPress={() => { void refreshHistory(); }} /></Card> : null}
        {progressStatus === "error" ? <Card><AppText>対局を保存できませんでした。再試行してください。</AppText><PrimaryButton title="保存を再試行" onPress={() => { if (progressSnapshot) void persistProgress(progressSnapshot); else void refreshHistory(); }} /></Card> : null}
        {game === null ? (
          <Card>
            {resumable ? <>
              <AppText variant="subtitle">途中の対局があります</AppText>
              <AppText>{DIFFICULTIES.find((item) => item.value === resumable.difficulty)!.title}</AppText>
              <PrimaryButton title="続きから" tone="defeat" disabled={historyLoading || historyError || transitioning} onPress={resume} />
            </> : null}
            <AppText variant="subtitle">二乃様の強さ</AppText>
            <View style={styles.difficulties}>
              {DIFFICULTIES.map((item) => (
                <LocalizedPressable
                  key={item.value}
                  testID={`othello-difficulty-${item.value}`}
                  accessibilityRole="radio"
                  accessibilityLabel={item.title}
                  accessibilityState={{ checked: item.value === difficulty }}
                  aria-checked={item.value === difficulty}
                  onPress={() => { playEffect("button"); setDifficulty(item.value); }}
                  style={({ pressed }) => [styles.difficulty, item.value === difficulty && styles.selectedDifficulty, pressed && styles.pressed]}
                >
                  <AppText style={[styles.difficultyText, item.value === difficulty && styles.selectedDifficultyText]}>{item.title}</AppText>
                </LocalizedPressable>
              ))}
            </View>
            <AppText>あなたが白、二乃様が紫。あなたからどうぞ。</AppText>
            <PrimaryButton title={resumable ? "新しく対局する" : "対局開始"} tone="defeat" disabled={historyLoading || historyError || transitioning} onPress={start} />
          </Card>
        ) : (
          <>
            <Card style={styles.scoreCard}>
              <View style={styles.scoreRow}>
                <View style={styles.scoreSide}>
                  <AppText style={styles.playerLabel}>あなた（白）</AppText>
                  <View style={styles.scoreValue}><View style={[styles.scoreStone, styles.whiteStone]} /><AppText localize={false} testID="othello-human-score" style={styles.scoreNumber}>{score!.black}</AppText></View>
                </View>
                <View style={styles.scoreDivider} />
                <View style={styles.scoreSide}>
                  <AppText style={styles.playerLabel}>二乃様（紫）</AppText>
                  <View style={styles.scoreValue}><View style={[styles.scoreStone, styles.purpleStone]} /><AppText localize={false} testID="othello-cpu-score" style={styles.scoreNumber}>{score!.white}</AppText></View>
                </View>
              </View>
              <View style={styles.turnRow}>
                <AppText testID="othello-status" accessibilityLiveRegion="polite" style={[styles.status, finished && styles.finishedStatus]}>{status}</AppText>
                <AppText variant="muted">{difficultyTitle}</AppText>
              </View>
              {!finished && game.turn === -1 && !pressurePending ? <AppText variant="muted">考え中…</AppText> : null}
              {game.passedPlayer !== null && !finished ? <AppText accessibilityLiveRegion="polite" style={styles.passNotice}>{game.passedPlayer === 1 ? "あなたは打てるマスがないため、パスしました。" : "私は打てるマスがないため、パスしました。"}</AppText> : null}
              {finished ? <AppText variant="muted">{finishReason === "surrender" ? "降参により、あなたの敗北です。" : "両者とも打てなくなったため、対局終了です。"}</AppText> : null}
              {finalDialogue ? <AppText testID="othello-result-dialogue" accessibilityLiveRegion="polite">{finalDialogue}</AppText> : null}
              {pressureCue ? <AppText testID="othello-pressure-dialogue" accessibilityLiveRegion="polite" style={styles.passNotice}>{HARD_PRESSURE_MESSAGES[pressureCue]}</AppText> : null}
            </Card>

            {finished ? <AppText variant="muted">{showFinalPosition ? "対局終了時の盤面" : "色ごとに整列した駒"}</AppText> : null}
            <OthelloBoard board={displayedBoard!} legalMoves={legalMoves} temptingMove={temptingMove} lastMove={finished && !showFinalPosition ? null : game.lastMove} interactive={!pressurePending && assistance?.kind !== "single" && assistance?.kind !== "fast"} onMove={humanMove} />
            {finished ? <PrimaryButton title={showFinalPosition ? "駒を整列して表示" : "対局終了時の盤面を見る"} tone="secondary" onPress={() => setShowFinalPosition((value) => !value)} /> : null}

            {temptingMove !== null ? (
              <Card style={styles.invitation}>
                <View style={styles.invitationHeader}>
                  <AppText style={styles.invitationTitle}>誘惑マス</AppText>
                  <AppText localize={false} testID="othello-temptation-coordinate" style={styles.invitationCoordinate}>{moveCoordinate(temptingMove)}</AppText>
                </View>
                {!actionMessage ? <AppText>{INVITATIONS[(64 - score!.empty) % INVITATIONS.length]}</AppText> : null}
              </Card>
            ) : null}
            {actionMessage ? <Card style={styles.invitation}>
              <AppText testID="othello-action-dialogue" accessibilityLiveRegion="polite">{actionMessage}</AppText>
              {assistance?.kind === "fast" ? <>
                <AppText testID="othello-fast-status" variant="muted">{assistance.paused ? "自動対局を一時停止中" : "2倍速で自動対局中"}</AppText>
                <PrimaryButton title={assistance.paused ? "自動対局を再開" : "自動対局を一時停止"} tone="secondary" onPress={toggleFastPlay} />
              </> : null}
            </Card> : null}
            {temptingMove !== null && assistance === null ? <PrimaryButton title="降参する" tone="defeat" onPress={openActionMenu} /> : null}

            {finished && saveStatus === "saving" ? <AppText variant="muted">プレイ履歴を保存中…</AppText> : null}
            {finished && saveStatus === "saved" ? <AppText variant="muted">プレイ履歴に保存しました。</AppText> : null}
            {finished && saveStatus === "error" ? <Card><AppText>プレイ履歴を保存できませんでした。再試行してください。</AppText><PrimaryButton title="保存を再試行" onPress={() => { if (pendingResult.current) void persistResult(pendingResult.current); }} /></Card> : null}
            {!finished && progressStatus !== "error" ? <AppText variant="muted">{progressStatus === "saved" ? "対局を自動保存しました。" : "対局を保存中…"}</AppText> : null}

            <PrimaryButton title={finished ? "もう一度" : "やり直す"} tone="defeat" disabled={resultPending || transitioning} onPress={finished ? () => { void chooseAgain(); } : () => openDialog("restart")} />
          </>
        )}
        <Card>
          <PrimaryButton title={rulesOpen ? "遊び方を閉じる" : "遊び方を見る"} tone="secondary" onPress={() => setRulesOpen((value) => !value)} />
        </Card>
        {rulesOpen ? (
          <Card>
            <AppText>あなたの白から交互に、相手の石を自分の石で挟めるマスに打ちます。挟んだ石は自分の色になります。</AppText>
            <AppText>点のあるマスに打てます。打てるマスがなければ自動でパスし、両者とも打てなくなると終了です。</AppText>
            <AppText>最後に石の多い方が勝ちです。</AppText>
          </Card>
        ) : null}
        <Card>
          <PrimaryButton title="プレイ履歴を表示する" tone="secondary" onPress={() => { jobVersion.current += 1; setHistoryOpen(true); }} />
        </Card>
        <PrimaryButton title="ゲーム部屋へ戻る" tone="secondary" disabled={resultPending || transitioning} onPress={leave} />
      </View>
      <OthelloHistoryModal visible={historyOpen} history={history} loading={historyLoading} failed={historyError} onRetry={() => { void refreshHistory(); }} onClose={() => setHistoryOpen(false)} />
      <OthelloActionModal
        visible={actionTarget !== null}
        coordinate={actionTarget ? moveCoordinate(actionTarget.move) : ""}
        onSelect={selectAction}
        onClose={() => updateActionTarget(null)}
        onSurrender={() => {
          if (!actionTargetRef.current || actionTargetRef.current.game !== currentGame.current) return;
          updateActionTarget(null);
          openDialog("surrender");
        }}
      />
      <ConfirmModal
        visible={dialog !== null}
        title={dialog === "surrender" ? "降参しますか？" : dialog === "leave" ? "対局を保存して戻りますか？" : "対局をやり直しますか？"}
        message={dialog === "surrender" ? "この対局をあなたの敗北として、プレイ履歴に記録します。" : dialog === "leave" ? "盤面と手番を保存します。次回は「続きから」で再開できます。" : "途中の対局を削除して、強さを選び直します。"}
        confirmLabel={dialog === "surrender" ? "敗北する" : dialog === "leave" ? "ゲーム部屋へ戻る" : "やり直す"}
        confirmTone={dialog === "surrender" ? "danger" : dialog === "restart" ? "defeat" : "primary"}
        onCancel={() => { if (!transitionRef.current) setDialog(null); }}
        onConfirm={() => {
          if (dialog === "surrender") {
            const snapshot = currentGame.current;
            if (snapshot?.status !== "playing") return;
            jobVersion.current += 1;
            setFinishReason("surrender");
            setDialog(null);
            commit({ ...snapshot, status: "finished", turn: null, winner: -1, passedPlayer: null });
          } else if (dialog === "leave") {
            void saveAndLeave();
          } else void chooseAgain();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", maxWidth: 480, alignSelf: "center", gap: 14 },
  difficulties: { flexDirection: "row", gap: 8 },
  difficulty: { flex: 1, minWidth: 0, minHeight: 46, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#999", borderRadius: 4, backgroundColor: "#151515" },
  selectedDifficulty: { borderColor: "#ff91c7", backgroundColor: "#ff91c7" },
  difficultyText: { fontWeight: "800", textAlign: "center" },
  selectedDifficultyText: { color: "#181018" },
  pressed: { opacity: 0.7 },
  scoreCard: { gap: 10 },
  scoreRow: { flexDirection: "row", gap: 12 },
  scoreSide: { flex: 1, minWidth: 0, gap: 5, alignItems: "center" },
  playerLabel: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  scoreDivider: { width: 1, backgroundColor: "#555" },
  scoreValue: { flexDirection: "row", gap: 10, alignItems: "center" },
  scoreNumber: { fontSize: 26, lineHeight: 32, fontWeight: "800", fontVariant: ["tabular-nums"] },
  scoreStone: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: "#999" },
  purpleStone: { backgroundColor: "#a855f7", borderColor: "#e9c8ff" },
  whiteStone: { backgroundColor: "#f5f3eb" },
  turnRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  status: { flex: 1, minWidth: 0, fontWeight: "800" },
  finishedStatus: { color: "#ff9cce" },
  passNotice: { color: "#f1d89b", fontSize: 13, lineHeight: 20 },
  invitation: { borderColor: "#ff91c7", backgroundColor: "#25131e" },
  invitationHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  invitationTitle: { color: "#ffb6dc", fontWeight: "800" },
  invitationCoordinate: { color: "#fff", fontSize: 20, lineHeight: 26, fontWeight: "800" },
});
