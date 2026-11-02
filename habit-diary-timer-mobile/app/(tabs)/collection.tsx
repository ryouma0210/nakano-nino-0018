/* eslint-disable react-hooks/immutability */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Asset } from "expo-asset";
import * as MediaLibrary from "expo-media-library/legacy";
import * as FileSystem from "expo-file-system/legacy";
import { VideoView } from "expo-video";
import { useAppVideoPlayer } from "@/audio/useAppVideoPlayer";
import { useAudioPlayer } from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { useAppModal } from "@/components/AppModalProvider";
import { useAppAudio } from "@/audio/AudioProvider";
import { stripGamePassword } from "@nino/shared/gamePassword";
import { GamePasswordReward } from "@/components/GamePasswordReward";
import {
  achievementMessages,
  findRewardMessage,
  formatConfiguredMessage,
  roomMessages,
} from "@/constants/messages";
import { ninoOutfits, type NinoOutfit } from "@/constants/outfits";
import { achievementRepository } from "@/repositories/achievementRepository";
import {
  rewardRepository,
  type RewardRedemption,
} from "@/repositories/rewardRepository";
import {
  contractService,
  type ContractSettings,
} from "@/services/gameRoomService";
import {
  additionalContractRules,
  chastityContractRule,
  requiredContractRuleTexts,
} from "@/utils/contract";
import { secondsToClock } from "@/utils/date";
import { unlockedOutsideTitles } from "@/features/outside/achievements";
import { getOutsideLossMemoryLabel } from "@/features/outside/lossMemoryLabel";
import { earnedGameTitles } from "@/features/games/achievements";
import { loadOthello } from "@/features/othello/storage";
import { getSugorokuAchievements, loadSugoroku } from "@/features/sugoroku/storage";
import { downloadUriOnWeb } from "@/utils/webDownload";
import { PointMilestoneCollection } from "@/features/points/PointMilestoneCollection";
import { usePointMilestones } from "@/features/points/PointMilestoneProvider";
import { collectionCategories, contractCollectionKey, filterCollection, milestoneCollectionKey, rewardCategory, rewardCollectionKey, titleCollectionKey, type CollectionCategory, type CollectionEntry } from "@/features/collection/model";
import { collectionSeenRepository } from "@/features/collection/seenRepository";
import { CollectionNewBadge } from "@/features/collection/CollectionNewBadge";
import { translateText } from "@/i18n";

const rewardVideos = [
  { name: "準備動画", fileName: "nino-preparation.mp4", module: require("../../assets/videos/preparation_1.mp4") },
  { name: "洗脳動画", fileName: "nino-brainwash.mp4", module: require("../../assets/videos/brainwash_01.mp4") },
  { name: "敗北動画", fileName: "nino-defeat.mp4", module: require("../../assets/videos/defeat_01.mp4") },
  { name: "調教動画 1", fileName: "nino-training-01.mp4", module: require("../../assets/videos/habits_1.mp4") },
  { name: "調教動画 2", fileName: "nino-training-02.mp4", module: require("../../assets/videos/habits_2.mp4") },
  { name: "調教動画 3", fileName: "nino-training-03.mp4", module: require("../../assets/videos/habits_3.mp4") },
  { name: "調教動画 4", fileName: "nino-training-04.mp4", module: require("../../assets/videos/habits_4.mp4") },
  { name: "調教動画 5", fileName: "nino-training-05.mp4", module: require("../../assets/videos/habits_5.mp4") },
  { name: "調教動画 6", fileName: "nino-training-06.mp4", module: require("../../assets/videos/habits_6.mp4") },
  { name: "お仕置き動画 1", fileName: "nino-punishment-01.mp4", module: require("../../assets/videos/timer_1.mp4") },
  { name: "お仕置き動画 2", fileName: "nino-punishment-02.mp4", module: require("../../assets/videos/timer_2.mp4") },
  { name: "契約成立動画", fileName: "nino-contract.mp4", module: require("../../assets/videos/contract_1.mp4") },
] as const;

function outfitImageFileName(outfit: NinoOutfit) {
  return `nino-outfit-${outfit.key}.png`;
}

function outfitVideoFileName(outfit: NinoOutfit) {
  return `nino-outfit-${outfit.key}.mp4`;
}

function contractDays(signedAt?: string) {
  if (!signedAt) return 0;
  const start = new Date(signedAt);
  if (Number.isNaN(start.getTime())) return 0;
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
}

function formatContractDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function unlockedTitles(contract: ContractSettings | null) {
  const value = achievementRepository.summary();
  const days = contractDays(contract?.signedAt);
  return [
    ...achievementMessages.training.map((achievement) => ({
      name: achievement.name,
      condition: achievement.condition,
      progress: `${value.trainingCount}回 / ${achievement.count}回`,
      unlocked: value.trainingCount >= achievement.count,
    })),
    ...achievementMessages.punishment.map((achievement) => ({
      name: achievement.name,
      condition: achievement.condition,
      progress: `${value.punishmentMinutes}分 / ${achievement.minutes}分`,
      unlocked: value.punishmentMinutes >= achievement.minutes,
    })),
    ...achievementMessages.management.map((achievement) => ({
      name: achievement.name,
      condition: achievement.condition,
      progress: `${value.managementDays}日 / ${achievement.days}日`,
      unlocked: value.managementDays >= achievement.days,
    })),
    ...achievementMessages.contract.map((achievement) => ({
      name: achievement.name,
      condition: achievement.condition,
      progress: `${days}日 / ${achievement.days}日`,
      unlocked: days >= achievement.days,
    })),
    ...unlockedOutsideTitles(),
  ].filter((title) => title.unlocked);
}

export default function CollectionScreen() {
  const { settings } = useAppAudio();
  const playerName = settings?.playerName.trim() ?? "";
  const [rewards, setRewards] = useState<RewardRedemption[]>([]);
  const [contract, setContract] = useState<ContractSettings | null>(null);
  const [gameTitles, setGameTitles] = useState<ReturnType<typeof earnedGameTitles>>([]);
  const [titlesError, setTitlesError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [category, setCategory] = useState<CollectionCategory>("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [seenKeys, setSeenKeys] = useState<string[] | null>(null);
  const [seenError, setSeenError] = useState(false);
  const [pointsResetAt, setPointsResetAt] = useState("");
  const { snapshot: milestones, error: milestonesError } = usePointMilestones();
  const loadVersion = useRef(0);

  const load = useCallback(() => {
    const version = ++loadVersion.current;
    setDataReady(false);
    setLoadError(false);
    setSeenKeys(null);
    try {
      setRewards(rewardRepository.acquired());
      setPointsResetAt(collectionSeenRepository.pointsResetAt());
    } catch {
      setLoadError(true);
      return () => { loadVersion.current += 1; };
    }
    setTitlesError(false);
    void Promise.allSettled([contractService.load(), loadOthello(), loadSugoroku()]).then(([loadedContract, othello, sugoroku]) => {
      if (version !== loadVersion.current) return;
      if (loadedContract.status === "fulfilled") setContract(loadedContract.value);
      setGameTitles(earnedGameTitles(othello.status === "fulfilled" ? othello.value.achievements : [],
        sugoroku.status === "fulfilled" ? getSugorokuAchievements(sugoroku.value) : []));
      setTitlesError(othello.status === "rejected" || sugoroku.status === "rejected");
      setLoadError(loadedContract.status === "rejected");
      setDataReady([loadedContract, othello, sugoroku].every((result) => result.status === "fulfilled"));
    });
    return () => { loadVersion.current += 1; };
  }, []);
  useFocusEffect(load);

  const sortedRewards = [...rewards].sort(
    (left, right) => left.points_spent - right.points_spent || left.id - right.id,
  );
  const titles = useMemo(() => [...unlockedTitles(contract), ...gameTitles], [contract, gameTitles]);
  const achievements = achievementRepository.summary();
  const entries = useMemo<CollectionEntry[]>(() => [
    ...(milestones?.unlocked ?? []).map((item) => ({ key: milestoneCollectionKey(item.id, pointsResetAt), category: "message" as const })),
    ...titles.map((item) => ({ key: titleCollectionKey(item.name), category: "title" as const })),
    ...(contract?.signedAt ? [{ key: contractCollectionKey(contract.signedAt), category: "contract" as const }] : []),
    ...rewards.map((item) => ({ key: rewardCollectionKey(item, pointsResetAt), category: rewardCategory(item) })),
  ], [milestones?.unlocked, titles, contract, rewards, pointsResetAt]);

  const refreshSeen = useCallback(() => {
    if (!dataReady || !milestones || milestonesError) return;
    try {
      setSeenKeys(collectionSeenRepository.sync().seen);
      setSeenError(false);
    } catch { setSeenError(true); }
  }, [dataReady, milestones, milestonesError]);
  useEffect(refreshSeen, [refreshSeen]);
  const seen = new Set(seenKeys ?? []);
  const visibleEntries = filterCollection(entries, category, onlyNew, seen);
  const visibleKeys = new Set(visibleEntries.map((entry) => entry.key));
  const unreadCount = seenKeys === null ? 0 : entries.filter((entry) => !seen.has(entry.key)).length;
  const visibleUnread = seenKeys === null ? [] : visibleEntries.filter((entry) => !seen.has(entry.key));
  const visibleMilestones = new Set((milestones?.unlocked ?? []).filter((item) => visibleKeys.has(milestoneCollectionKey(item.id, pointsResetAt))).map((item) => item.id));
  const visibleTitles = titles.filter((item) => visibleKeys.has(titleCollectionKey(item.name)));
  const visibleRewards = sortedRewards.filter((item) => visibleKeys.has(rewardCollectionKey(item, pointsResetAt)));
  const showCategory = (value: CollectionCategory) => category === "all" || category === value;
  const language = settings?.language ?? "ja";

  function markSeen(keys: string[]) {
    try {
      setSeenKeys(collectionSeenRepository.markSeen(entries, keys).seen);
      setSeenError(false);
    } catch { setSeenError(true); }
  }

  function newBadge(key: string, id: string) {
    return seenKeys !== null && !seen.has(key)
      ? <CollectionNewBadge id={id} onRead={() => markSeen([key])} />
      : null;
  }

  return (
    <Screen>
      <PageTitle>コレクション部屋</PageTitle>
      <RoomConversation
        characterSource={require("../../assets/characters/diary-nino.png")}
        roomName="コレクション部屋"
        lines={roomMessages.collection.lines}
        contractLines={roomMessages.collection.contractLines}
      />

      <Card>
        <AppText variant="subtitle">種類で絞り込み</AppText>
        <View style={styles.filters}>
          {collectionCategories.map((item) => <Pressable key={item.key} accessibilityRole="button"
            accessibilityState={{ selected: category === item.key }}
            {...(Platform.OS === "web" ? { "aria-pressed": category === item.key } : {})}
            accessibilityLabel={translateText(item.label, language)}
            onPress={() => setCategory(item.key)} testID={`collection-filter-${item.key}`}
            style={[styles.filterButton, category === item.key && styles.filterSelected]}>
            <AppText>{item.label}</AppText>
            <AppText localize={false} variant="muted">{entries.filter((entry) => item.key === "all" || entry.category === item.key).length}</AppText>
          </Pressable>)}
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: onlyNew, disabled: seenKeys === null }}
          accessibilityLabel={translateText("NEWのみ", language)}
          {...(Platform.OS === "web" ? { "aria-pressed": onlyNew } : {})}
          disabled={seenKeys === null} onPress={() => setOnlyNew((value) => !value)}
          style={[styles.newFilter, onlyNew && styles.filterSelected]} testID="collection-filter-new">
          <AppText localize={false}>{onlyNew ? "☑" : "□"}</AppText>
          <AppText>NEWのみ</AppText>
          <AppText localize={false}>{unreadCount}</AppText>
        </Pressable>
        <AppText variant="muted">NEWは「確認済みにする」を押すまで残ります。</AppText>
        <AppText variant="muted">初回は保存済みの項目にもNEWを表示します。</AppText>
        <PrimaryButton title="表示中を確認済みにする" tone="secondary" disabled={visibleUnread.length === 0 || seenError}
          onPress={() => markSeen(visibleUnread.map((entry) => entry.key))} testID="collection-read-visible" />
        {seenError ? <>
          <AppText accessibilityRole="alert">コレクションの確認状態を保存・読み込みできませんでした。</AppText>
          <PrimaryButton title="再読み込み" tone="secondary" onPress={refreshSeen} />
        </> : null}
        {loadError ? <>
          <AppText accessibilityRole="alert">コレクションの一部を読み込めませんでした。</AppText>
          <PrimaryButton title="再読み込み" tone="secondary" onPress={load} />
        </> : null}
        {dataReady && visibleEntries.length === 0 ? <AppText testID="collection-empty" variant="muted">この条件のコレクションはありません。</AppText> : null}
      </Card>

      {showCategory("message") && (!onlyNew || visibleMilestones.size > 0) ? <PointMilestoneCollection visibleIds={visibleMilestones}
        renderBadge={(id) => newBadge(milestoneCollectionKey(id, pointsResetAt), id)} /> : null}

      {showCategory("title") && (!onlyNew || visibleTitles.length > 0) ? <Card style={styles.achievementCard}>
        <AppText variant="subtitle">称号</AppText>
        {titlesError ? <>
          <AppText>ゲームの称号を読み込めませんでした。</AppText>
          <PrimaryButton title="再読み込み" tone="secondary" onPress={load} />
        </> : null}
        {visibleTitles.length === 0 ? (
          <AppText variant="muted">まだ称号を獲得していません。</AppText>
        ) : null}
        {visibleTitles.map((title, index) => (
          <View key={title.name} style={styles.collectionRow}>
            {newBadge(titleCollectionKey(title.name), `title-${index}`)}
            <AppText style={styles.titleText}>🏆 {title.name}</AppText>
            <AppText>達成条件：{title.condition}</AppText>
            <AppText variant="muted">現在値：{title.progress}</AppText>
          </View>
        ))}
        <View style={styles.ruleDivider} />
        <AppText variant="label">調教時間の実績</AppText>
        <View style={styles.achievementTimes}>
          <View style={styles.achievementTimeItem}>
            <AppText variant="muted">調教最速</AppText>
            <AppText style={styles.achievementTimeValue}>
              {achievements.bestTrainingSeconds === null
                ? "未記録"
                : secondsToClock(achievements.bestTrainingSeconds)}
            </AppText>
          </View>
          <View style={styles.achievementTimeItem}>
            <AppText variant="muted">調教最長</AppText>
            <AppText style={styles.achievementTimeValue}>
              {achievements.longestTrainingSeconds === null
                ? "未記録"
                : secondsToClock(achievements.longestTrainingSeconds)}
            </AppText>
          </View>
        </View>
      </Card> : null}

      {showCategory("contract") && (!onlyNew || (contract?.signedAt && visibleKeys.has(contractCollectionKey(contract.signedAt)))) ? <Card style={styles.contractCard}>
        <AppText variant="subtitle">契約書・契約ルール</AppText>
        {contract?.signedAt ? (
          <>
            {newBadge(contractCollectionKey(contract.signedAt), "contract")}
            <AppText>契約日：{formatContractDate(contract.signedAt)}</AppText>
            <AppText>契約者：{contract.signature ?? "-"}</AppText>
            <AppText>契約日数：{contractDays(contract.signedAt)}日</AppText>
            {requiredContractRuleTexts.map((rule) => (
              <AppText key={rule}>・{rule}</AppText>
            ))}
            {contract.allowChastity ? <AppText>・{chastityContractRule}</AppText> : null}
            <View style={styles.ruleDivider} />
            <AppText variant="label">契約上の追加ルール</AppText>
            {additionalContractRules().map((rule) => (
              <AppText key={rule}>・{rule}</AppText>
            ))}
          </>
        ) : (
          <AppText variant="muted">契約はまだ成立していません。</AppText>
        )}
      </Card> : null}

      {(category === "all" || ["message", "outfit", "video", "voice", "memory"].includes(category)) && (!onlyNew || visibleRewards.length > 0) ? <Card style={styles.collectionCard}>
        <AppText variant="subtitle">ご褒美（使用Pt順）</AppText>
        {visibleRewards.length === 0 ? (
          <AppText variant="muted">まだご褒美を獲得していません。</AppText>
        ) : null}
        {visibleRewards.map((item) => <View key={rewardCollectionKey(item, pointsResetAt)} testID={`collection-reward-${item.id}`}>
          {newBadge(rewardCollectionKey(item, pointsResetAt), `reward-${item.id}`)}
          {item.reward_key === "video" ? (
            <CollectionVideo item={item} />
          ) : item.reward_key === "voice" ? (
            <CollectionVoice item={item} />
          ) : item.reward_key === "outfit" ? (
            <CollectionOutfit item={item} />
          ) : (
            <RewardText item={item} playerName={playerName} />
          )}
        </View>)}
      </Card> : null}

      <PrimaryButton
        title="記録・交換メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu?section=record")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

function RewardText({ item, playerName }: { item: RewardRedemption; playerName: string }) {
  const isOutsideMemory = item.reward_key === "outside-loss-memory";
  return (
    <View style={styles.collectionRow}>
      {isOutsideMemory ? <AppText variant="label">館の外：敗北シーン回想</AppText> : null}
      <AppText>{isOutsideMemory
        ? getOutsideLossMemoryLabel(item.reward_content)
        : formatRewardText(item, playerName)}</AppText>
      {item.reward_key === "secret" ? <GamePasswordReward /> : null}
      <RewardMetadata item={item} />
    </View>
  );
}

function CollectionOutfit({ item }: { item: RewardRedemption }) {
  const { showNotice } = useAppModal();
  const outfit = ninoOutfits.find((entry) => entry.key === item.file_uri);

  async function saveAsset(module: number, fileName: string, mediaType: "photo" | "video") {
    try {
      const asset = Asset.fromModule(module);
      await asset.downloadAsync();
      const sourceUri = asset.localUri ?? asset.uri;
      if (Platform.OS === "web") {
        await downloadUriOnWeb(sourceUri, fileName);
        showNotice(
          "保存完了",
          mediaType === "photo"
            ? "衣装画像をダウンロードしました。"
            : "衣装動画をダウンロードしました。",
        );
        return;
      }
      const permission = await MediaLibrary.requestPermissionsAsync(true, [mediaType]);
      if (!permission.granted) {
        showNotice(
          "保存権限が必要です",
          mediaType === "photo"
            ? "衣装画像を保存するには、写真への保存を許可してください。"
            : "衣装動画を保存するには、動画への保存を許可してください。",
        );
        return;
      }
      const namedUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.deleteAsync(namedUri, { idempotent: true });
      await FileSystem.copyAsync({
        from: sourceUri,
        to: namedUri,
      });
      await MediaLibrary.saveToLibraryAsync(namedUri);
      showNotice(
        "保存完了",
        mediaType === "photo"
          ? "衣装画像を端末のギャラリーへ保存しました。"
          : "衣装動画を端末のギャラリーへ保存しました。",
      );
    } catch (error) {
      showNotice(
        mediaType === "photo" ? "画像を保存できません" : "動画を保存できません",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (!outfit) {
    return (
      <View style={styles.collectionRow}>
        <AppText style={styles.videoName}>{item.reward_content ?? "衣装"}</AppText>
        <AppText variant="muted">衣装データが見つかりません。</AppText>
        <RewardMetadata item={item} />
      </View>
    );
  }

  return (
    <View style={styles.collectionRow}>
      <View style={styles.outfitCollectionHeader}>
        <Image source={outfit.source} resizeMode="cover" style={styles.outfitCollectionThumb} />
        <View style={styles.grow}>
          <AppText style={styles.videoName}>{outfit.name}</AppText>
          <AppText variant="muted">
            画像{outfit.video ? "・動画" : ""}を保存できます。
          </AppText>
          <RewardMetadata item={item} />
        </View>
      </View>
      <View style={styles.videoActions}>
        <PrimaryButton
          title="画像保存"
          tone="secondary"
          onPress={() => saveAsset(outfit.source, outfitImageFileName(outfit), "photo")}
        />
        <PrimaryButton
          title="動画保存"
          tone="secondary"
          disabled={!outfit.video}
          onPress={() => {
            if (outfit.video) saveAsset(outfit.video, outfitVideoFileName(outfit), "video");
          }}
        />
      </View>
    </View>
  );
}

function RewardMetadata({ item }: { item: RewardRedemption }) {
  return (
    <AppText style={styles.rewardMetadata}>
      {item.reward_name} / 使用：{item.points_spent}pt
    </AppText>
  );
}

function CollectionVoice({ item }: { item: RewardRedemption }) {
  const { showNotice } = useAppModal();
  const voiceModule = require("../../assets/audio/ninosukiboisu.m4a");
  const player = useAudioPlayer(voiceModule);

  useEffect(() => {
    player.loop = true;
  }, [player]);

  function play() {
    player.seekTo(0).then(() => player.play()).catch(console.error);
  }

  function stop() {
    player.pause();
    player.seekTo(0).catch(console.error);
  }

  async function save() {
    try {
      const asset = Asset.fromModule(voiceModule);
      await asset.downloadAsync();
      const sourceUri = asset.localUri ?? asset.uri;
      if (Platform.OS === "web") {
        await downloadUriOnWeb(sourceUri, "nino-love-voice.m4a", "audio/mp4");
        showNotice("保存完了", "好きボイス3秒を音声ファイル（M4A）としてダウンロードしました。");
        return;
      }
      const permission = await MediaLibrary.requestPermissionsAsync(true, ["audio"]);
      if (!permission.granted) {
        showNotice(
          "保存権限が必要です",
          "ボイスを保存するには、音声ファイルへの保存を許可してください。",
        );
        return;
      }
      const namedUri = `${FileSystem.cacheDirectory}nino-love-voice.m4a`;
      await FileSystem.deleteAsync(namedUri, { idempotent: true });
      await FileSystem.copyAsync({
        from: sourceUri,
        to: namedUri,
      });
      await MediaLibrary.saveToLibraryAsync(namedUri);
      showNotice("保存完了", "好きボイス3秒を音声ファイル（M4A）として保存しました。");
    } catch (error) {
      showNotice(
        "ボイスを保存できません",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return (
    <View style={styles.collectionRow}>
      <AppText style={styles.videoName}>{item.reward_content ?? "好きボイス3秒"}</AppText>
      <AppText variant="muted">音声のみ・映像は表示されません。</AppText>
      <RewardMetadata item={item} />
      <View style={styles.videoActions}>
        <PrimaryButton title="再生" onPress={play} />
        <PrimaryButton title="停止" tone="secondary" onPress={stop} />
        <PrimaryButton title="保存" tone="secondary" onPress={save} />
      </View>
    </View>
  );
}

function formatRewardText(item: RewardRedemption, playerName: string) {
  const text = item.reward_key === "secret" ? stripGamePassword(item.reward_content ?? "") : item.reward_content ?? "";
  const message = findRewardMessage(item.reward_key, text);
  return message ? formatConfiguredMessage(message, playerName) : text;
}

function CollectionVideo({ item }: { item: RewardRedemption }) {
  const { showNotice } = useAppModal();
  const [visible, setVisible] = useState(false);
  const bundled = rewardVideos.find((video) => video.name === item.reward_content);

  async function save() {
    try {
      if (!bundled) throw new Error("同梱動画が見つかりません。");
      const asset = Asset.fromModule(bundled.module);
      await asset.downloadAsync();
      const sourceUri = asset.localUri ?? asset.uri;
      if (Platform.OS === "web") {
        await downloadUriOnWeb(sourceUri, bundled.fileName);
        showNotice("保存完了", "動画をダウンロードしました。");
        return;
      }
      const permission = await MediaLibrary.requestPermissionsAsync(true, ["video"]);
      if (!permission.granted) {
        showNotice(
          "保存権限が必要です",
          "動画を保存するには、写真と動画への保存を許可してください。",
        );
        return;
      }
      const namedUri = `${FileSystem.cacheDirectory}${bundled.fileName}`;
      await FileSystem.deleteAsync(namedUri, { idempotent: true });
      await FileSystem.copyAsync({
        from: sourceUri,
        to: namedUri,
      });
      await MediaLibrary.saveToLibraryAsync(namedUri);
      showNotice("保存完了", "動画を端末のギャラリーへ保存しました。");
    } catch (error) {
      showNotice(
        "動画を保存できません",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return (
    <View style={styles.collectionRow}>
      <AppText style={styles.videoName}>{item.reward_content}</AppText>
      <RewardMetadata item={item} />
      <View style={styles.videoActions}>
        <PrimaryButton
          title="再生"
          disabled={!bundled}
          onPress={() => setVisible(true)}
        />
        <PrimaryButton
          title="保存"
          tone="secondary"
          disabled={!bundled}
          onPress={save}
        />
      </View>
      {visible && bundled ? (
        <CollectionVideoPlayer
          module={bundled.module}
          onClose={() => setVisible(false)}
        />
      ) : null}
    </View>
  );
}

function CollectionVideoPlayer({
  module,
  onClose,
}: {
  module: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const player = useAppVideoPlayer(module, (instance) => {
    instance.loop = true;
    instance.play();
  });

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.videoModal,
          {
            paddingTop: Math.max(12, insets.top),
            paddingBottom: Math.max(12, insets.bottom),
          },
        ]}
      >
        <VideoView
          player={player}
          style={styles.video}
          nativeControls
          contentFit="contain"
        />
        <PrimaryButton title="閉じる" tone="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterButton: { minHeight: 44, minWidth: 120, flexGrow: 1, flexBasis: "28%", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#555", borderRadius: 4 },
  filterSelected: { borderColor: "#f2c94c", backgroundColor: "#302918" },
  newFilter: { minHeight: 44, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: "#555", borderRadius: 4 },
  collectionCard: { borderColor: "#f2c94c" },
  contractCard: { borderColor: "#b875ff" },
  achievementCard: { borderColor: "#f2c94c" },
  achievementTimes: { flexDirection: "row", gap: 10 },
  achievementTimeItem: {
    flex: 1,
    gap: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: "#555",
  },
  achievementTimeValue: { color: "#f2c94c", fontSize: 22, lineHeight: 30, fontWeight: "900" },
  collectionRow: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingVertical: 10,
  },
  titleText: { color: "#f2c94c", fontWeight: "900" },
  videoName: { fontWeight: "900" },
  rewardMetadata: { color: "#999", fontSize: 10, lineHeight: 14 },
  grow: { flex: 1 },
  outfitCollectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  outfitCollectionThumb: {
    width: 64,
    height: 86,
    borderWidth: 1,
    borderColor: "#666",
    borderRadius: 6,
    backgroundColor: "#111",
  },
  videoActions: { flexDirection: "row", gap: 8 },
  ruleDivider: { height: 1, backgroundColor: "#555" },
  videoModal: {
    flex: 1,
    gap: 10,
    paddingHorizontal: 10,
    backgroundColor: "#000",
  },
  video: { flex: 1, width: "100%", backgroundColor: "#000" },
});

