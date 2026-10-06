import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppAudio } from "@/audio/AudioProvider";
import { useAppModal } from "@/components/AppModalProvider";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import {
  enduranceAssets,
  hasCompleteEnduranceAssets,
  type EnduranceMediaItem,
} from "@/features/endurance/assets";
import {
  EnduranceMedia,
  MediaChoice,
  type EnduranceVideoHandle,
} from "@/features/endurance/EnduranceMedia";
import {
  advanceEndurance,
  canAdvanceEndurance,
  createEnduranceGame,
  ENDURANCE_LABELS,
  ENDURANCE_PRESETS,
  failEnduranceSlide,
  finishEndurance,
  MAX_CUSTOM_MEDIA,
  RECOVERY_DURATION_MS,
  remainingEnduranceSlides,
  SLIDE_DURATION_MS,
  type EnduranceGame,
  type EndurancePreset,
  type EnduranceResult,
  type EnduranceVideoProgress,
} from "@/features/endurance/game";
import {
  loadEndurance,
  saveEnduranceResult,
  unlockEndurance,
} from "@/features/endurance/service";
import { useActiveTimer } from "@/features/endurance/useActiveTimer";
import { orderEnduranceMedia } from "@/features/endurance/mediaOrder";
import { displayedFileName, storedFileKey } from "@/features/files/fileList";
import { formatCountdown } from "@/features/sugoroku/countdown";
import {
  fileStorageService,
  mimeTypeForName,
  type StoredFile,
} from "@/services/fileStorageService";

export default function EnduranceScreen() {
  const { setRoomAudioScene } = useAppAudio();
  const { showError, showNotice } = useAppModal();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState !== "background" &&
      AppState.currentState !== "inactive",
  );
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [preset, setPreset] = useState<EndurancePreset>("game-1");
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [media, setMedia] = useState<EnduranceMediaItem[]>([]);
  const [game, setGame] = useState<EnduranceGame | null>(null);
  const [result, setResult] = useState<EnduranceResult | null>(null);
  const [history, setHistory] = useState<EnduranceResult[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<EndurancePreset | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [videoComplete, setVideoComplete] = useState(false);
  const [videoProgress, setVideoProgress] = useState<EnduranceVideoProgress>({ positionMs: 0, durationMs: null });
  const videoRef = useRef<EnduranceVideoHandle | null>(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const savingRef = useRef(false);
  const actionLock = useRef(false);
  const exitAfterSave = useRef(false);
  const activeGame = game !== null && result === null;
  const active =
    focused && foreground && activeGame && !showHistory && !confirmRetire;
  const slideTimer = useActiveTimer(
    SLIDE_DURATION_MS,
    active && game?.preset !== "game-6" && !game?.recovering,
    () => {
      showNotice(
        "時間になりました",
        "1分が経過しました。次のスライドへ進めます。",
      );
    },
  );
  const extraTimer = useActiveTimer(RECOVERY_DURATION_MS, active && game?.preset !== "game-6", () => {
    showNotice("時間になりました", "3分が経過しました。");
  });

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setFocused(true);
      setLoading(true);
      setLoadFailed(false);
      try {
        const saved = loadEndurance();
        setHistory(saved.history);
        setUnlocked(saved.unlocked);
        if (!saved.unlocked)
          setPreset((current) =>
            current === "game-5" || current === "game-6" ? "game-1" : current,
          );
      } catch (error) {
        setLoadFailed(true);
        showError("勃起我慢を読み込めませんでした", error);
      }
      void fileStorageService
        .list("endurance")
        .then((next) => {
          if (!live) return;
          setFiles(
            next.filter((file) =>
              /^(image|video)\//.test(mimeTypeForName(file.name)),
            ),
          );
          setSelectedKeys((keys) =>
            keys.filter((key) =>
              next.some((file) => storedFileKey(file) === key),
            ),
          );
        })
        .catch((error) => {
          if (live) showError("ファイルを読み込めませんでした", error);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
      return () => {
        live = false;
        setFocused(false);
        setShowHistory(false);
        setUnlockTarget(null);
        setPassword("");
      };
    }, [showError]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || game?.preset === "game-6") return;
    setRoomAudioScene("endurance");
    return () => setRoomAudioScene(null);
  }, [active, game?.preset, setRoomAudioScene]);
  useEffect(() => {
    actionLock.current = false;
  }, [game, result]);

  const selectedMedia: EnduranceMediaItem[] =
    preset === "custom"
      ? selectedKeys.flatMap((key) => {
          const file = files.find((item) => storedFileKey(item) === key);
          if (!file) return [];
          return [
            {
              id: key,
              label: displayedFileName(file),
              kind: mimeTypeForName(file.name).startsWith("video/")
                ? ("video" as const)
                : ("image" as const),
              source: { uri: file.uri },
            },
          ];
        })
      : enduranceAssets[preset];
  const configured = hasCompleteEnduranceAssets(preset, selectedMedia);
  const locked = (preset === "game-5" || preset === "game-6") && !unlocked;
  const currentIndex = result ? galleryIndex : (game?.index ?? 0);
  const currentMedia = media[currentIndex];
  const ready =
    game !== null &&
    !mediaFailed &&
    canAdvanceEndurance(
      game,
      game.preset === "game-6"
        ? videoComplete
        : slideTimer.state.status === "complete",
      extraTimer.state.status === "complete",
    );

  function choosePreset(next: EndurancePreset) {
    if ((next === "game-5" || next === "game-6") && !unlocked) {
      setUnlockTarget(next);
      setPassword("");
      setPasswordError(false);
      return;
    }
    setPreset(next);
  }
  function unlock() {
    try {
      if (!unlockEndurance(password)) {
        setPasswordError(true);
        return;
      }
      setUnlocked(true);
      if (unlockTarget) setPreset(unlockTarget);
      setUnlockTarget(null);
      setPassword("");
    } catch (error) {
      showError("解除を保存できませんでした", error);
    }
  }
  function toggleFile(file: StoredFile) {
    const key = storedFileKey(file);
    setSelectedKeys((keys) =>
      keys.includes(key)
        ? keys.filter((value) => value !== key)
        : keys.length < MAX_CUSTOM_MEDIA
          ? [...keys, key]
          : keys,
    );
  }
  function start() {
    if (!configured || locked || loading || loadFailed || savingRef.current)
      return;
    setMedia(orderEnduranceMedia(preset, selectedMedia));
    setGame(createEnduranceGame(preset, selectedMedia.length));
    setResult(null);
    setSaveFailed(false);
    setMediaFailed(false);
    setVideoComplete(false);
    setVideoProgress({ positionMs: 0, durationMs: null });
    setGalleryIndex(0);
    slideTimer.reset();
    extraTimer.reset();
  }
  function persist(finished: EnduranceResult) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      const saved = saveEnduranceResult(finished);
      setHistory(saved.history);
      if (exitAfterSave.current) router.replace("/(tabs)/games");
    } catch (error) {
      setSaveFailed(true);
      showError("プレイ履歴を保存できませんでした", error);
    } finally {
      savingRef.current = false;
      setSaving(false);
      exitAfterSave.current = false;
    }
  }
  function finish(retired: boolean, currentGame = game) {
    if (!currentGame || result) return;
    const progress = currentGame.preset === "game-6"
      ? videoRef.current?.getProgress() ?? videoProgress
      : undefined;
    const finished = finishEndurance(currentGame, retired, new Date().toISOString(), progress);
    slideTimer.pause();
    extraTimer.pause();
    setResult(finished);
    setGalleryIndex(currentGame.index);
    persist(finished);
  }
  function next() {
    if (!game || !ready || !active || result || actionLock.current) return;
    actionLock.current = true;
    if (game.index === game.total - 1) {
      finish(false);
      return;
    }
    setGame(
      advanceEndurance(
        game,
        game.preset === "game-6"
          ? videoComplete
          : slideTimer.state.status === "complete",
        extraTimer.state.status === "complete",
      ),
    );
    setMediaFailed(false);
    setVideoComplete(false);
    slideTimer.reset();
    extraTimer.reset();
  }
  function fail() {
    if (!game || game.recovering || result || actionLock.current) return;
    actionLock.current = true;
    if (game.preset === "game-6") {
      finish(false, failEnduranceSlide(game));
      return;
    }
    setGame(failEnduranceSlide(game));
    slideTimer.pause();
    extraTimer.reset();
  }
  function leave() {
    if (activeGame) {
      exitAfterSave.current = true;
      setConfirmRetire(true);
    } else if (!saveFailed) router.replace("/(tabs)/games");
  }
  const onMediaError = useCallback(() => setMediaFailed(true), []);
  const onVideoEnd = useCallback(() => setVideoComplete(true), []);
  const onVideoProgress = useCallback((progress: EnduranceVideoProgress) => setVideoProgress(progress), []);

  return (
    <Screen desktopLayout="single">
      <AppText variant="title">我慢</AppText>
      {loading ? <ActivityIndicator color="#fff" /> : null}
      {loadFailed ? (
        <AppText style={styles.failed}>勃起我慢を読み込めませんでした</AppText>
      ) : null}
      {!activeGame && !result ? (
        <>
          <View style={styles.presets}>
            {ENDURANCE_PRESETS.map((value) => (
              <View key={value} style={styles.preset}>
                <PrimaryButton
                  title={
                    !unlocked && value === "game-5"
                      ? "勃起我慢⑤（未公開）"
                      : !unlocked && value === "game-6"
                        ? "勃起我慢⑥（未公開）"
                        : ENDURANCE_LABELS[value]
                  }
                  tone={preset === value ? "defeat" : "secondary"}
                  onPress={() => choosePreset(value)}
                />
              </View>
            ))}
          </View>
          <Card>
            <AppText variant="subtitle">{ENDURANCE_LABELS[preset]}</AppText>
            {preset === "custom" ? (
              <>
                <AppText>
                  使う画像・動画を選んでください。開始時にランダムな順番で表示します。
                </AppText>
                <AppText variant="muted">最大100件まで選択できます。</AppText>
                {files.length === 0 ? (
                  <AppText variant="muted">
                    勃起我慢ゲーム用の画像・動画がありません。ファイル格納で用途を追加してください。
                  </AppText>
                ) : null}
                <ScrollView style={styles.fileList} nestedScrollEnabled>
                  {files.map((file) => (
                    <MediaChoice
                      key={storedFileKey(file)}
                      label={displayedFileName(file)}
                      selected={selectedKeys.includes(storedFileKey(file))}
                      onPress={() => toggleFile(file)}
                    />
                  ))}
                </ScrollView>
                <PrimaryButton
                  title="ファイル格納"
                  tone="preparation"
                  onPress={() => router.push("/(tabs)/files")}
                />
              </>
            ) : (
              <AppText variant="muted">
                {preset === "game-6" ? "動画1本" : "画像4枚・各1分"}
              </AppText>
            )}
            {!configured ? <AppText variant="muted">素材未設定</AppText> : null}
            <PrimaryButton
              title="ゲーム開始"
              tone="defeat"
              disabled={!configured || locked || loading || loadFailed}
              onPress={start}
            />
          </Card>
        </>
      ) : null}
      {game && currentMedia ? (
        <Card>
          <AppText variant="subtitle">{ENDURANCE_LABELS[game.preset]}</AppText>
          <AppText
            localize={false}
            style={styles.center}
          >{`${currentIndex + 1} / ${game.total}`}</AppText>
          <AppText localize={false} numberOfLines={2}>
            {currentMedia.label}
          </AppText>
          <EnduranceMedia
            key={currentMedia.id}
            item={currentMedia}
            active={active}
            onNext={
              result
                ? galleryIndex < media.length - 1
                  ? () => setGalleryIndex(galleryIndex + 1)
                  : undefined
                : ready
                  ? next
                  : undefined
            }
            onPrevious={
              result && galleryIndex > 0
                ? () => setGalleryIndex(galleryIndex - 1)
                : undefined
            }
            onVideoEnd={onVideoEnd}
            onVideoProgress={game.preset === "game-6" ? onVideoProgress : undefined}
            videoRef={game.preset === "game-6" ? videoRef : undefined}
            onError={onMediaError}
          />
          {mediaFailed ? (
            <AppText style={styles.failed}>
              素材を表示できませんでした。ファイルを確認してください。
            </AppText>
          ) : null}
          {activeGame ? (
            <>
              {game.preset === "game-6" ? (
                <View>
                  <AppText variant="subtitle">動画の再生時間</AppText>
                  <AppText localize={false} style={styles.clock}>
                    {`${formatPlaybackTime(videoProgress.positionMs)} / ${videoProgress.durationMs === null ? "--:--" : formatPlaybackTime(videoProgress.durationMs)}`}
                  </AppText>
                </View>
              ) : null}
              {game.preset !== "game-6" && !game.recovering ? (
                <Card>
                  <AppText variant="subtitle">1分タイマー</AppText>
                  <AppText localize={false} style={styles.clock}>
                    {formatCountdown(slideTimer.state.remainingMs)}
                  </AppText>
                  <PrimaryButton
                    title={
                      slideTimer.state.status === "running"
                        ? "一時停止"
                        : slideTimer.state.status === "paused"
                          ? "再開"
                          : "1分タイマー開始"
                    }
                    tone="secondary"
                    disabled={
                      !active ||
                      mediaFailed ||
                      slideTimer.state.status === "complete"
                    }
                    onPress={
                      slideTimer.state.status === "running"
                        ? slideTimer.pause
                        : slideTimer.start
                    }
                  />
                </Card>
              ) : null}
              {game.preset !== "game-6" && game.recovering ? (
                <AppText style={styles.failed}>
                  我慢失敗。【チンピク】50回できたら、「3分タイマー開始」を押して、【ノンストップオナニー】を始めてください。終了後に次へ進めます。
                </AppText>
              ) : null}
              {game.preset !== "game-6" ? (
              <Card>
                <AppText variant="subtitle">3分タイマー</AppText>
                <AppText localize={false} style={styles.clock}>
                  {formatCountdown(extraTimer.state.remainingMs)}
                </AppText>
                <View style={styles.row}>
                  <View style={styles.button}>
                    <PrimaryButton
                      title={
                        extraTimer.state.status === "running"
                          ? "一時停止"
                          : extraTimer.state.status === "paused"
                            ? "再開"
                            : "3分タイマー開始"
                      }
                      tone="secondary"
                      disabled={!active}
                      onPress={
                        extraTimer.state.status === "running"
                          ? extraTimer.pause
                          : extraTimer.start
                      }
                    />
                  </View>
                  <View style={styles.button}>
                    <PrimaryButton
                      title="リセット"
                      tone="secondary"
                      onPress={extraTimer.reset}
                    />
                  </View>
                </View>
              </Card>
              ) : null}
              {ready ? (
                <AppText style={styles.cleared}>
                  {game.preset === "game-6" ? "動画を最後まで再生できました。" : "時間になりました。次へ進めます。"}
                </AppText>
              ) : game.preset === "game-6" && !game.recovering ? (
                <AppText variant="muted">
                  動画を最後まで再生すると終了できます。
                </AppText>
              ) : (
                <AppText variant="muted">
                  タイマーが終わると次のスライドへ進めます。
                </AppText>
              )}
              <PrimaryButton
                title={
                  game.index === game.total - 1
                    ? game.failures > 0
                      ? "ゲーム終了"
                      : "最後まで我慢できた"
                    : "次へ"
                }
                tone="defeat"
                disabled={!ready}
                onPress={next}
              />
              <View style={styles.row}>
                <View style={styles.button} testID="endurance-fail-button">
                  <PrimaryButton
                    title="我慢失敗"
                    tone="punishment"
                    disabled={game.recovering}
                    onPress={fail}
                  />
                </View>
                <View style={styles.button} testID="endurance-retire-button">
                  <PrimaryButton
                    title="リタイア"
                    tone="primary"
                    onPress={() => {
                      exitAfterSave.current = false;
                      setConfirmRetire(true);
                    }}
                  />
                </View>
              </View>
            </>
          ) : null}
        </Card>
      ) : null}
      {result ? (
        <Card>
          <ResultDetails result={result} />
          {saving ? <ActivityIndicator color="#fff" /> : null}
          {saveFailed ? (
            <>
              <AppText style={styles.failed}>
                履歴がまだ保存されていません。
              </AppText>
              <PrimaryButton
                title="保存を再試行"
                onPress={() => persist(result)}
              />
            </>
          ) : null}
          <PrimaryButton
            title="もう一度"
            tone="defeat"
            disabled={saving || saveFailed}
            onPress={() => {
              setResult(null);
              setGame(null);
              setMedia([]);
            }}
          />
        </Card>
      ) : null}
      <PrimaryButton
        title="遊び方を見る"
        tone="secondary"
        onPress={() => setShowRules(!showRules)}
      />
      {showRules ? (
        <Card>
          <AppText variant="subtitle">ルール</AppText>
          {(game?.preset ?? preset) === "game-6" ? (
            <AppText>
              ⑥は動画を最後まで再生して完了します。我慢失敗・リタイアではその時点で終了し、動画の再生位置を履歴に記録します。3分タイマーはありません。
            </AppText>
          ) : (
          <>
          <AppText>
            {
              "①1分間ずつタイマーをセットして\nスライドして【勃起】したら負け♡\n②負けた場合、その画像で【チンピク】を50回してノンストップオナニーをやりなさい。\nノンストップオナニーを3分間我慢できたら次へ進めることができます。\n③最後まで我慢できたら好きな画像に画面越しに【射精】"
            }
          </AppText>
          <AppText variant="muted">
            画面を離れたときやバックグラウンドでは、タイマーを一時停止します。戻ったら「再開」を押してください。
          </AppText>
          </>
          )}
        </Card>
      ) : null}
      <PrimaryButton
        title="プレイ履歴を表示する"
        tone="secondary"
        onPress={() => setShowHistory(true)}
      />
      <PrimaryButton
        title="ゲーム部屋へ戻る"
        tone="secondary"
        disabled={saving || saveFailed}
        onPress={leave}
      />
      <HistoryModal
        visible={showHistory}
        history={history}
        onClose={() => setShowHistory(false)}
      />
      <ConfirmModal
        visible={confirmRetire}
        title="リタイア"
        message="このゲームを終了して、プレイ履歴に記録しますか？"
        confirmLabel="リタイア"
        confirmTone="primary"
        onCancel={() => {
          exitAfterSave.current = false;
          setConfirmRetire(false);
        }}
        onConfirm={() => {
          setConfirmRetire(false);
          finish(true);
        }}
      />
      <Modal
        visible={unlockTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setUnlockTarget(null);
          setPassword("");
        }}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <AppText variant="subtitle">未公開ゲームを解除</AppText>
            <AppText>
              パスワードが知りたい場合は、【特別会員室】に入ってください♡
            </AppText>
            <TextField
              label="パスワード"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError(false);
              }}
            />
            {passwordError ? (
              <AppText style={styles.failed}>パスワードが違います。</AppText>
            ) : null}
            <PrimaryButton title="解除" tone="defeat" onPress={unlock} />
            <PrimaryButton
              title="閉じる"
              tone="secondary"
              onPress={() => {
                setUnlockTarget(null);
                setPassword("");
              }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function formatPlaybackTime(milliseconds: number) {
  return formatCountdown(Math.floor(milliseconds / 1000) * 1000);
}

function ResultDetails({ result }: { result: EnduranceResult }) {
  const time = new Date(result.finishedAt);
  const date = `${time.getFullYear()}/${String(time.getMonth() + 1).padStart(2, "0")}/${String(time.getDate()).padStart(2, "0")}`;
  return (
    <>
      <AppText localize={false}>{date}</AppText>
      <AppText>{ENDURANCE_LABELS[result.preset]}</AppText>
      <AppText
        style={result.outcome === "cleared" ? styles.cleared : styles.failed}
      >
        {result.outcome === "cleared" ? "クリア" : "未達成"}
      </AppText>
      {result.preset === "game-6" ? (
        <View style={styles.resultRows}>
          {result.outcome !== "cleared" ? (
            <AppText style={styles.failed}>{result.outcome === "retired" ? "リタイア" : "我慢失敗"}</AppText>
          ) : null}
          <View style={styles.row}>
            <AppText>{result.outcome === "failed" ? "失敗時の再生位置：" : result.outcome === "retired" ? "リタイア時の再生位置：" : "終了時の再生位置："}</AppText>
            {result.videoProgress ? (
              <AppText localize={false}>{formatPlaybackTime(result.videoProgress.positionMs)}</AppText>
            ) : <AppText>記録なし</AppText>}
          </View>
          {result.videoProgress?.durationMs != null ? (
            <View style={styles.row}>
              <AppText>動画の長さ：</AppText>
              <AppText localize={false}>{formatPlaybackTime(result.videoProgress.durationMs)}</AppText>
            </View>
          ) : null}
        </View>
      ) : result.outcome !== "cleared" ? (
        <View style={styles.resultRows}>
          <AppText style={styles.failed}>
            {result.outcome === "retired" ? "リタイア" : "失敗"}
          </AppText>
          <View style={styles.row}>
            <AppText style={styles.failed}>終了したスライド：</AppText>
            <AppText
              localize={false}
              style={styles.failed}
            >{`${result.index + 1} / ${result.total}`}</AppText>
          </View>
          {result.failedIndex !== null ? (
            <View style={styles.row}>
              <AppText style={styles.failed}>最初に失敗したスライド：</AppText>
              <AppText localize={false} style={styles.failed}>
                {String(result.failedIndex + 1)}
              </AppText>
            </View>
          ) : null}
          <View style={styles.row}>
            <AppText style={styles.failed}>残りスライド：</AppText>
            <AppText localize={false} style={styles.failed}>
              {String(remainingEnduranceSlides(result))}
            </AppText>
          </View>
        </View>
      ) : null}
    </>
  );
}

function HistoryModal({
  visible,
  history,
  onClose,
}: {
  visible: boolean;
  history: EnduranceResult[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.history,
          {
            paddingTop: Math.max(16, insets.top),
            paddingBottom: Math.max(16, insets.bottom),
          },
        ]}
      >
        <AppText variant="title">我慢 プレイ履歴</AppText>
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.historyList}
          renderItem={({ item }) => (
            <Card>
              <ResultDetails result={item} />
            </Card>
          )}
          ListEmptyComponent={
            <AppText variant="muted">プレイ履歴はまだありません。</AppText>
          }
        />
        <PrimaryButton title="閉じる" tone="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  preset: { minWidth: 140, flexGrow: 1, flexBasis: "45%", gap: 4 },
  center: { textAlign: "center" },
  fileList: { maxHeight: 260 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { flex: 1, minWidth: 110 },
  clock: {
    textAlign: "center",
    fontSize: 28,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  failed: { color: "#ff3b45", fontWeight: "700" },
  cleared: { color: "#7cb342", fontWeight: "700" },
  resultRows: { gap: 8 },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.88)",
  },
  dialog: {
    width: "100%",
    maxWidth: 400,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#080808",
  },
  history: { flex: 1, paddingHorizontal: 16, gap: 16, backgroundColor: "#000" },
  historyList: { gap: 12, paddingBottom: 16 },
});
