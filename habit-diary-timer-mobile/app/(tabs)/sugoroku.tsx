import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { useAppModal } from "@/components/AppModalProvider";
import { SugorokuArtwork, SugorokuMapModal } from "@/features/sugoroku/SugorokuArtwork";
import { SugorokuDice } from "@/features/sugoroku/SugorokuDice";
import { SugorokuRules } from "@/features/sugoroku/SugorokuRules";
import { SugorokuTimer } from "@/features/sugoroku/SugorokuTimer";
import { SugorokuLogModal } from "@/features/sugoroku/SugorokuLogModal";
import { getSugorokuAudioScene } from "@/features/sugoroku/audio";
import { getSugorokuInstruction } from "@/features/sugoroku/instructions";
import {
  chooseRoute, completeEvent, createGame, failGame, getCurrentTile, getDefeatTile,
  getDiceMovementRule, getDisplayedDiceResult, getRemainingSpaces, retireGame, rollDice,
  getTileRuleDescription, ROUTE_TILES, type SugorokuGame,
} from "@/features/sugoroku/game";
import { loadSugoroku, saveSugoroku, type SugorokuSave } from "@/features/sugoroku/storage";

type DiceRollStage = "rolling" | "result" | "rule" | "adjusting" | "committing";
type DiceRollPreview = {
  value: number;
  adjustedValue: number;
  rule: ReturnType<typeof getDiceMovementRule>;
  stage: DiceRollStage;
};
type ActiveDiceRoll = DiceRollPreview & { next: SugorokuGame; generation: number };

function GameResult({ game }: { game: SugorokuGame }) {
  if (game.outcome === "goal-1" || game.outcome === "goal-2") {
    return <AppText style={[styles.resultLabel, styles.resultSuccess]}>{game.outcome === "goal-1" ? "ゴール①をクリア" : "ゴール②をクリア"}</AppText>;
  }
  const defeatTile = getDefeatTile(game);
  return (
    <>
      <AppText style={[styles.resultLabel, styles.resultFailure]}>未達成</AppText>
      <AppText variant="muted" style={styles.resultFailure}>{`敗北コース：${game.extended ? "ハードモード" : "通常モード"}`}</AppText>
      {defeatTile ? <AppText variant="muted" style={styles.resultFailure}>{`敗北マス：${defeatTile.label}`}</AppText> : null}
      <AppText variant="muted" style={styles.resultFailure}>{`残りマス：${getRemainingSpaces(game)}`}</AppText>
      {game.penaltyPoints !== null ? <AppText variant="muted" style={styles.resultFailure}>{`ペナルティ：${game.penaltyPoints}`}</AppText> : null}
    </>
  );
}

function PlayHistoryModal({ visible, history, onClose, onViewLog }: {
  visible: boolean;
  history: readonly SugorokuGame[];
  onClose: () => void;
  onViewLog: (game: SugorokuGame) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        style={[
          styles.historyModal,
          {
            paddingTop: Math.max(12, insets.top),
            paddingBottom: Math.max(12, insets.bottom),
            paddingLeft: Math.max(16, insets.left),
            paddingRight: Math.max(16, insets.right),
          },
        ]}
      >
        <View style={styles.historyContent}>
          <View style={styles.historyHeader}>
            <AppText variant="subtitle" accessibilityRole="header" style={styles.historyTitle}>プレイ履歴</AppText>
            <PrimaryButton title="閉じる" tone="secondary" onPress={onClose} />
          </View>
          <AppText variant="muted">終了したゲームを新しい順に１００件まで保存します。</AppText>
          <FlatList
            style={styles.historyList}
            data={history.slice(0, 100)}
            keyExtractor={(entry) => entry.id}
            renderItem={({ item }) => {
              const date = new Date(item.completedAt ?? item.startedAt);
              return (
                <View style={styles.historyRow}>
                  <AppText style={styles.historyDate}>{`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`}</AppText>
                  <GameResult game={item} />
                  <PrimaryButton title="進行ログを見る" tone="secondary" onPress={() => onViewLog(item)} />
                </View>
              );
            }}
            ListEmptyComponent={<AppText variant="muted">まだプレイ履歴はありません。</AppText>}
          />
        </View>
      </View>
    </Modal>
  );
}

export default function SugorokuScreen() {
  const { showError } = useAppModal();
  const { setRoomAudioScene } = useAppAudio();
  const [saved, setSaved] = useState<SugorokuSave | null>(null);
  const [game, setGame] = useState<SugorokuGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [logGame, setLogGame] = useState<SugorokuGame | null>(null);
  const logFromHistory = useRef(false);
  const [exitAction, setExitAction] = useState<"retire" | "fail" | null>(null);
  const [movementNotice, setMovementNotice] = useState<{ message: string } | null>(null);
  const [rollPreview, setRollPreview] = useState<DiceRollPreview | null>(null);
  const [tileSummaryWidth, setTileSummaryWidth] = useState(0);
  const activeRoll = useRef<ActiveDiceRoll | null>(null);
  const focused = useRef(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const pendingSave = useRef<Promise<SugorokuSave> | null>(null);
  const audioScene = loading || loadFailed ? null : getSugorokuAudioScene(game);

  useFocusEffect(useCallback(() => {
    setRoomAudioScene(audioScene);
    return () => setRoomAudioScene(null);
  }, [audioScene, setRoomAudioScene]));

  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    setLoadFailed(false);
    setExitAction(null);
    setShowMap(false);
    setShowHistory(false);
    setLogGame(null);
    logFromHistory.current = false;
    setMovementNotice(null);
    activeRoll.current = null;
    setRollPreview(null);
    try {
      // A focus reload must not race the save from the previous screen visit.
      await pendingSave.current?.catch(() => undefined);
      const next = await loadSugoroku();
      if (!focused.current || generation.current !== version) return;
      setSaved(next);
      setGame(next.current);
    } catch (error) {
      if (!focused.current || generation.current !== version) return;
      setLoadFailed(true);
      showError("すごろくを読み込めませんでした", error);
    } finally {
      if (focused.current && generation.current === version) {
        setSaving(false);
        setLoading(false);
      }
    }
  }, [showError]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void refresh();
    return () => {
      focused.current = false;
      generation.current += 1;
      activeRoll.current = null;
      setRollPreview(null);
      setMovementNotice(null);
      setShowMap(false);
      setShowHistory(false);
      setLogGame(null);
      logFromHistory.current = false;
    };
  }, [refresh]));

  useEffect(() => {
    if (!movementNotice) return;
    const timer = setTimeout(() => setMovementNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [movementNotice]);

  useEffect(() => {
    // Let the original face settle before announcing and animating its rule.
    const stage = rollPreview?.stage;
    if (stage !== "result" && stage !== "rule") return;
    const roll = activeRoll.current;
    if (!roll) return;
    const timer = setTimeout(() => {
      if (activeRoll.current !== roll || !focused.current || roll.generation !== generation.current || roll.stage !== stage) return;
      roll.stage = stage === "result" ? "rule" : "adjusting";
      setRollPreview({ ...roll });
    }, stage === "result" ? 650 : 700);
    return () => clearTimeout(timer);
  }, [rollPreview]);

  async function persist(next: SugorokuGame, movementMessage: string | null = null) {
    if (busy.current || loading || loadFailed || !focused.current) return;
    busy.current = true;
    setSaving(true);
    setMovementNotice(null);
    const version = generation.current;
    const operation = saveSugoroku(next);
    pendingSave.current = operation;
    try {
      const snapshot = await operation;
      if (focused.current && generation.current === version) {
        setSaved(snapshot);
        setGame(next);
        if (movementMessage) setMovementNotice({ message: movementMessage });
      }
    } catch (error) {
      if (focused.current && generation.current === version) showError("すごろくを保存できませんでした", error);
    } finally {
      busy.current = false;
      if (pendingSave.current === operation) pendingSave.current = null;
      if (focused.current && generation.current === version) setSaving(false);
    }
  }

  function advance(action: (current: SugorokuGame) => SugorokuGame, announceRuleMovement = false) {
    if (!game || busy.current || activeRoll.current || loading || loadFailed) return;
    const next = action(game);
    if (next === game) return;
    const movedByRule = announceRuleMovement && game.phase === "event" && next.position !== game.position;
    const destination = movedByRule ? getCurrentTile(next) : null;
    const movementMessage = destination
      ? destination.id === "start"
        ? "マスのルールにより、スタートへ移動しました。"
        : `マスのルールにより、${destination.id}マス目へ移動しました。`
      : null;
    void persist(next, movementMessage);
  }

  function startDiceRoll() {
    if (!game || busy.current || activeRoll.current || loading || loadFailed || !focused.current) return;
    if (game.phase !== "ready" && game.phase !== "penalty-roll") return;
    // Pick the result once. The changing faces during the animation are decorative.
    const value = Math.floor(Math.random() * 6) + 1;
    const next = rollDice(game, value);
    const roll: ActiveDiceRoll = {
      next, value, adjustedValue: getDisplayedDiceResult(next) ?? value,
      rule: getDiceMovementRule(game), generation: generation.current, stage: "rolling",
    };
    activeRoll.current = roll;
    setMovementNotice(null);
    setRollPreview({ ...roll });
  }

  async function finishDiceRoll() {
    const roll = activeRoll.current;
    if (!roll || !focused.current || roll.generation !== generation.current) return;
    if (roll.stage === "rolling" && roll.rule !== null) {
      roll.stage = "result";
      setRollPreview({ ...roll });
      return;
    }
    if (roll.stage !== "rolling" && roll.stage !== "adjusting") return;
    roll.stage = "committing";
    setRollPreview({ ...roll });
    try {
      await persist(roll.next);
    } finally {
      if (activeRoll.current === roll) {
        activeRoll.current = null;
        setRollPreview(null);
      }
    }
  }

  const tile = game ? getCurrentTile(game) : ROUTE_TILES[0];
  const instruction = getSugorokuInstruction(tile.id);
  const disabled = loading || saving || loadFailed || rollPreview !== null;
  const rollingDice = rollPreview?.stage === "rolling" || rollPreview?.stage === "adjusting";
  const adjustedPreview = rollPreview?.stage === "adjusting" || rollPreview?.stage === "committing";
  const displayedDice = rollPreview
    ? adjustedPreview ? rollPreview.adjustedValue : rollPreview.value
    : game ? getDisplayedDiceResult(game) : null;
  const rawDice = rollPreview?.value ?? game?.diceResult ?? null;
  const showsAdjustedResult = rollPreview
    ? adjustedPreview && rollPreview.rule !== null
    : displayedDice !== null && rawDice !== null && displayedDice !== rawDice;
  const diceResultLabel = rollPreview?.stage === "rolling" ? "振っています…"
    : rollPreview?.stage === "adjusting" ? "ルール適用中…"
      : displayedDice !== null
        ? showsAdjustedResult ? `ルール適用後：${displayedDice}` : `出目：${displayedDice}`
        : game?.phase === "penalty-roll" ? "ペナルティの出目" : "サイコロ";
  const diceRule = rollPreview ? rollPreview.rule : game ? getDiceMovementRule(game) : null;
  const diceRuleLabel = diceRule === "forced-one" ? "強制1マス移動"
    : diceRule === "minus-three" ? "出た目 −3"
      : diceRule === "minus-two" ? "出た目 −2" : null;
  const finished = game?.phase === "finished";
  const reachedGoal = game?.outcome === "goal-1" || game?.outcome === "goal-2";
  const canRoll = game?.phase === "ready" || game?.phase === "penalty-roll";
  const canComplete = game && ["event", "retire", "goal", "penalty-event"].includes(game.phase);
  const canExit = game && ["ready", "event", "choice"].includes(game.phase);
  const history = saved?.history ?? [];
  const compactSummary = tileSummaryWidth > 0 && tileSummaryWidth < 320;
  const tileSummary = (
    <View
      style={[styles.tileSummary, compactSummary && styles.tileSummaryCompact]}
      onLayout={(event) => setTileSummaryWidth(event.nativeEvent.layout.width)}
    >
      <AppText variant="subtitle" numberOfLines={1} style={[styles.tileName, compactSummary && styles.tileNameCompact]}>{tile.label}</AppText>
      {!reachedGoal ? <AppText variant="muted" numberOfLines={1} style={[styles.tileMetadata, compactSummary && styles.tileMetadataCompact]}>{`残り${game ? getRemainingSpaces(game) : 25}マス`}</AppText> : null}
      {tile.kind === "stop" ? <AppText numberOfLines={1} style={[styles.forcedStop, styles.tileMetadata, compactSummary && styles.tileMetadataCompact]}>強制ストップ</AppText> : null}
      <AppText variant="muted" numberOfLines={1} style={[styles.tileMetadata, compactSummary && styles.tileMetadataCompact, styles.tileCourse]}>{game?.extended ? "延長コース" : "通常コース"}</AppText>
    </View>
  );

  return (
    <View style={styles.root}>
      <Screen desktopLayout="single">
        <View style={styles.content}>
          <View style={styles.heading}>
            <AppText variant="title">すごろく</AppText>
            <AppText variant="muted">{saving ? "保存中…" : "自動保存"}</AppText>
          </View>
          {loading ? <ActivityIndicator color="#c7ddf7" /> : loadFailed ? (
            <Card>
              <AppText>保存データを読み込めません。再読み込みしてください。</AppText>
              <PrimaryButton title="再読み込み" onPress={() => void refresh()} />
            </Card>
          ) : (
            <>
              <SugorokuArtwork key={tile.id} tile={tile} />
              {!game ? (
                <Card>
                  {tileSummary}
                  <AppText>サイコロを振って、マスを進みながらゴールを目指しましょう。</AppText>
                  <PrimaryButton title="ゲーム開始" tone="defeat" disabled={disabled} onPress={() => void persist(createGame())} />
                </Card>
              ) : finished ? (
                <Card>
                  <AppText variant="subtitle">ゲーム終了</AppText>
                  <GameResult game={game} />
                  <AppText variant="muted">結果を履歴に保存しました。</AppText>
                  <PrimaryButton title="新しいゲーム" tone="defeat" disabled={disabled} onPress={() => void persist(createGame())} />
                </Card>
              ) : (
                <>
                  <Card>
                    {tileSummary}
                    {instruction ? (
                      <View style={styles.instruction}>
                        <AppText variant="subtitle" accessibilityRole="header">命令</AppText>
                        <AppText>{instruction}</AppText>
                      </View>
                    ) : null}
                    {game.phase === "ready" && game.movement === 0 ? <AppText>移動なし。もう一度サイコロを振ってください。</AppText> : null}
                    {game.phase === "choice" ? (
                      <View style={styles.stack}>
                        <PrimaryButton title="ゴール①へ" tone="save" disabled={disabled} onPress={() => advance((current) => chooseRoute(current, false))} />
                        <PrimaryButton title="延長コースへ" tone="secondary" disabled={disabled} onPress={() => advance((current) => chooseRoute(current, true))} />
                      </View>
                    ) : null}
                    {game.penaltyPoints !== null ? <AppText style={styles.score} localize={false}>{`${game.failureRemainingSpaces} × ${game.penaltyRoll} × 10 = ${game.penaltyPoints}`}</AppText> : null}
                  </Card>
                  <View style={styles.controls}>
                    <View style={styles.actions} testID="sugoroku-left-actions">
                      <PrimaryButton title={game.phase === "goal" || game.phase === "penalty-event" ? "結果を記録して終了" : "命令完了"} tone="save" disabled={disabled || !canComplete} onPress={() => advance(completeEvent, true)} />
                      <PrimaryButton title="リタイア" tone="secondary" disabled={disabled || !canExit} onPress={() => setExitAction("retire")} />
                      <PrimaryButton title="失敗" tone="danger" disabled={disabled || !canExit} onPress={() => setExitAction("fail")} />
                    </View>
                    <View style={styles.actions} testID="sugoroku-right-actions">
                      <PrimaryButton title={rollPreview?.stage === "rolling" ? "振っています…" : rollPreview?.stage === "rule" || rollPreview?.stage === "adjusting" ? "ルール適用中…" : "サイコロを振る"} disabled={disabled || !canRoll} onPress={startDiceRoll} />
                      <SugorokuTimer key={game.id} />
                    </View>
                  </View>
                  <Card>
                    {displayedDice !== null ? <View style={styles.diceResults} testID="sugoroku-dice-results">
                      {displayedDice !== null ? <AppText accessibilityLiveRegion="polite">{diceResultLabel}</AppText> : null}
                      {showsAdjustedResult && rawDice !== null ? <AppText variant="muted">{`元の出目：${rawDice}`}</AppText> : null}
                    </View> : null}
                    {diceRuleLabel ? (
                      <View style={styles.debuff} testID="sugoroku-debuff">
                        <AppText style={styles.debuffTitle}>デバフ付与中</AppText>
                        <AppText style={styles.diceRule}>{diceRuleLabel}</AppText>
                      </View>
                    ) : null}
                    <AppText variant="subtitle">マスのルール</AppText>
                    <AppText>{getTileRuleDescription(tile.id)}</AppText>
                  </Card>
                </>
              )}
            </>
          )}

          <Card>
            {game ? <PrimaryButton title="進行ログを見る" tone="secondary" disabled={disabled} onPress={() => { logFromHistory.current = false; setLogGame(game); }} /> : null}
            <PrimaryButton title="マップを確認" tone="secondary" onPress={() => setShowMap(true)} />
            <PrimaryButton title={showRules ? "遊び方を表示中" : "遊び方を見る"} tone="secondary" onPress={() => setShowRules((value) => !value)} />
            {showRules ? <SugorokuRules /> : null}
          </Card>

          {!loading && !loadFailed ? (
            <Card>
              <PrimaryButton title="プレイ履歴を表示する" tone="secondary" onPress={() => setShowHistory(true)} />
            </Card>
          ) : null}
          <PrimaryButton title="ゲーム部屋へ戻る" tone="secondary" disabled={saving} onPress={() => router.replace("/(tabs)/games")} />
        </View>
        <ConfirmModal
          visible={exitAction !== null}
          title={exitAction === "retire" ? "リタイア" : "失敗"}
          message={exitAction === "retire" ? "リタイアイベントの後、ペナルティへ進みます。続けますか？" : "ペナルティへ進みます。続けますか？"}
          confirmLabel="続ける"
          confirmTone="danger"
          onCancel={() => setExitAction(null)}
          onConfirm={() => { const action = exitAction; setExitAction(null); if (action) advance(action === "retire" ? retireGame : failGame); }}
        />
      </Screen>
      {rollPreview ? (
        <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
          <View style={styles.diceOverlay}>
            <View accessibilityViewIsModal style={styles.diceDialog} testID="sugoroku-dice-roll">
              <AppText variant="subtitle" accessibilityRole="header">サイコロ</AppText>
              <SugorokuDice value={displayedDice} rolling={rollingDice} onRollAnimationEnd={() => void finishDiceRoll()} />
              <AppText accessibilityLiveRegion="polite">{diceResultLabel}</AppText>
              {showsAdjustedResult && rawDice !== null ? <AppText variant="muted">{`元の出目：${rawDice}`}</AppText> : null}
              {rollPreview.stage === "rule" ? <AppText style={styles.diceRule} accessibilityLiveRegion="polite">ルール適用</AppText> : null}
              {diceRuleLabel ? <AppText style={styles.diceRule}>{diceRuleLabel}</AppText> : null}
            </View>
          </View>
        </Modal>
      ) : null}
      <SugorokuMapModal visible={showMap} onClose={() => setShowMap(false)} />
      <PlayHistoryModal visible={showHistory} history={history} onClose={() => setShowHistory(false)} onViewLog={(entry) => { logFromHistory.current = true; setShowHistory(false); setLogGame(entry); }} />
      <SugorokuLogModal game={logGame} onClose={() => { setLogGame(null); if (logFromHistory.current) setShowHistory(true); logFromHistory.current = false; }} />
      {movementNotice ? (
        <View pointerEvents="none" style={styles.noticeOverlay}>
          <View style={styles.noticeBubble}>
            <AppText accessibilityLiveRegion="polite" style={styles.noticeText}>{movementNotice.message}</AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", gap: 14 },
  heading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tileSummary: { flexDirection: "row", alignItems: "center", gap: 8 },
  tileSummaryCompact: { gap: 5 },
  tileName: { flexShrink: 1, minWidth: 0 },
  tileNameCompact: { fontSize: 14, lineHeight: 21 },
  tileMetadata: { fontSize: 13, lineHeight: 20, flexShrink: 0 },
  tileMetadataCompact: { fontSize: 11, lineHeight: 18 },
  tileCourse: { marginLeft: "auto", flexShrink: 1, minWidth: 0 },
  forcedStop: { color: "#f87171", fontWeight: "700" },
  noticeOverlay: { position: "absolute", bottom: 24, left: 16, right: 16, alignItems: "center" },
  noticeBubble: { width: "100%", maxWidth: 720, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 8, borderWidth: 1, borderColor: "#7bb2eb", backgroundColor: "#15263c" },
  noticeText: { color: "#eff6ff", fontWeight: "700", textAlign: "center" },
  stack: { gap: 10 },
  instruction: { gap: 6 },
  controls: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  actions: { flex: 1, minWidth: 0, gap: 10 },
  diceResults: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  diceRule: { color: "#f3d985", fontWeight: "700" },
  debuff: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 10, borderWidth: 1, borderColor: "#bf733d", borderRadius: 4, backgroundColor: "#281c12" },
  debuffTitle: { color: "#ffbd8a", fontWeight: "800" },
  diceOverlay: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.8)" },
  diceDialog: { width: "100%", maxWidth: 320, padding: 20, gap: 12, alignItems: "center", borderWidth: 1, borderColor: "#fff", borderRadius: 8, backgroundColor: "#080d14" },
  score: { fontWeight: "800", fontSize: 20, lineHeight: 28, color: "#f3d985" },
  resultLabel: { fontWeight: "800" },
  resultSuccess: { color: "#86efac" },
  resultFailure: { color: "#fca5a5" },
  historyModal: { flex: 1, backgroundColor: "#080d14" },
  historyContent: { flex: 1, minHeight: 0, width: "100%", maxWidth: 760, alignSelf: "center", gap: 14 },
  historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  historyTitle: { flex: 1, color: "#fff" },
  historyList: { flex: 1, minHeight: 0 },
  historyRow: { gap: 3, borderTopWidth: 1, borderColor: "#333", paddingVertical: 12 },
  historyDate: { color: "#fff", fontWeight: "800", marginBottom: 4 },
});
