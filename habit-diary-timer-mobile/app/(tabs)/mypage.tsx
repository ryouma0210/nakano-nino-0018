import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Disclosure } from "@/components/Disclosure";
import { translateText } from "@/i18n";
import { normalizeSearchText } from "@nino/shared/search";
import { settingsService } from "@/services/settingsService";
import type { StoredFile } from "@/services/fileStorageService";
import { RankedSelectionEditor } from "@/features/profile/RankedSelectionEditor";
import { ManualEntryField } from "@/features/profile/ManualEntryField";
import {
  FavoritePickerModal,
  favoriteDisplayName,
} from "@/features/profile/FavoritePickerModal";
import { resolveFavorites } from "@/features/profile/catalog";
import {
  activityCertificatePhotoDataUrl,
  exportActivityCertificate,
} from "@/features/profile/certificateExport";
import { useCertificateImageRenderer } from "@/features/profile/useCertificateImageRenderer";
import { readOutsideLevelSnapshot } from "@/features/outside/gameState";
import { useAppModal } from "@/components/AppModalProvider";
import { useAppAudio } from "@/audio/AudioProvider";
import { achievementRepository } from "@/repositories/achievementRepository";
import { rewardRepository } from "@/repositories/rewardRepository";
import {
  defaultProfile,
  profileService,
  type ProfileExperience,
  type ProfileSettings,
} from "@/services/profileService";
import { lightTheme } from "@/constants/theme";
import { secondsToClock } from "@/utils/date";

const weaknessOptions = [
  // 女の部位
  "髪",
  "ツインテール",
  "リボン",
  "目",
  "ジト目",
  "笑顔",
  "唇",
  "舌",
  "声",
  "甘い声",
  "低い声",
  "囁き声",
  "うなじ",
  "首筋",
  "鎖骨",
  "肩",
  "脇",
  "手",
  "指先",
  "爪",
  "胸",
  "乳首",
  "お腹",
  "腰",
  "お尻",
  "太もも",
  "膝裏",
  "ふくらはぎ",
  "足首",
  "足裏",
  // 責め
  "手コキ",
  "足責め",
  "パイズリ",
  "搾乳",
  "フェラ",
  "耳舐め",
  "乳首責め",
  "乳首カリカリ",
  "乳首つねり",
  "アナル責め",
  "前立腺責め",
  "亀頭責め",
  "裏筋責め",
  "金玉責め",
  "金玉叩き",
  "チンポビンタ",
  "寸止め",
  "焦らし",
  "射精禁止",
  "強制射精",
  "連続射精",
  "言葉責め",
  "罵倒",
  "褒め責め",
  "視線責め",
  "耳元囁き",
  "吐息",
  "キス音",
  "見抜き",
  "お仕置き",
  // 体勢
  "騎乗位",
  "顔騎",
  "土下座",
  "四つん這い",
  "跪き",
  "全裸待機",
  "ご奉仕",
  "踏まれる",
  "膝枕",
  "密着",
  // 道具
  "首輪",
  "貞操帯",
  "オナホ",
  "電マ",
  "音声作品",
  "ループ音声",
  "ピンク演出",
  // シチュエーション
  "命令口調",
  "見下し",
  "嘲笑",
  "カウントダウン",
  "奉仕命令",
  "放置プレイ",
  "羞恥",
  "敗北宣言",
  "懇願",
  "許可申請",
  "犬扱い",
  "ATM扱い",
  "写真鑑賞",
  "距離感",
  "耳元",
  "名前呼び",
  "敬語責め",
  "冷たい態度",
  "優しい態度",
  // 女の服
  "制服",
  "メイド服",
  "ナース服",
  "チャイナ服",
  "バニー服",
  "水着",
  "下着",
  "黒タイツ",
  "網タイツ",
  "ニーソ",
  "ガーターベルト",
  "ハイヒール",
  "ロングブーツ",
  "手袋",
  "ラバースーツ",
  "レオタード",
  "タイトスカート",
  "スーツ",
  "エプロン",
  "革衣装",
  "眼鏡",
  "香水",
  "汗",
] as const;

const knownWeaknesses = new Set<string>(weaknessOptions);

function loadProfileStats() {
  return {
    achievements: achievementRepository.summary(),
    points: rewardRepository.balance(),
  };
}

function evaluateRank(score: number) {
  if (score >= 10000) return "S";
  if (score >= 5000) return "A";
  if (score >= 1000) return "B";
  if (score >= 500) return "C";
  if (score >= 100) return "D";
  return "E";
}

function evaluationMessage(rank: string) {
  switch (rank) {
    case "S":
      return "文句なしね♡ここまで積み上げたなら、私の特別管理対象にしてあげる。";
    case "A":
      return "かなり仕上がってきたわね♡このまま私の管理下で記録を伸ばしなさい。";
    case "B":
      return "悪くないわ。調教も管理も、ちゃんと積み上がっているじゃない。";
    case "C":
      return "まだまだ伸びしろだらけね。毎日の命令から逃げないこと。";
    case "D":
      return "少しは記録があるわね。でも私を満足させるには足りないわ。";
    default:
      return "まだ評価するには記録が少ないわ。まずは一つ、命令を完了しなさい。";
  }
}

function weaknessRank(count: number) {
  if (count >= 35) return "人間卒業";
  if (count >= 25) return "ドマゾ";
  if (count >= 15) return "マゾ";
  if (count >= 10) return "ド変態";
  if (count >= 5) return "変態";
  return "未判定";
}

function trainingAptitude(count: number) {
  if (count >= 1000) return "マゾ級";
  if (count >= 100) return "上級";
  if (count >= 30) return "中級";
  if (count >= 1) return "初級";
  return "未判定";
}

function punishmentTolerance(minutes: number) {
  if (minutes >= 100000) return "マゾ級";
  if (minutes >= 1000) return "上級";
  if (minutes >= 500) return "中級";
  if (minutes >= 30) return "初級";
  return "未判定";
}

function numericValue(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function penisLengthLabel(value: string) {
  const length = numericValue(value);
  if (length === null) return "未設定";
  if (length < 10) return "短小";
  if (length < 15) return "平均";
  return `${length}cm`;
}

function masturbationTimeLabel(value: string) {
  const minutes = numericValue(value);
  if (minutes === null) return "未設定";
  if (minutes < 10) return "早漏";
  return `${minutes}分`;
}

export default function MyPageScreen() {
  const insets = useSafeAreaInsets();
  const { showNotice, showError } = useAppModal();
  const { settings, updateAudioSettings } = useAppAudio();
  const [profile, setProfile] = useState<ProfileSettings>(defaultProfile);
  const [stats, setStats] = useState(loadProfileStats);
  const [playerName, setPlayerName] = useState("");
  const [profileReady, setProfileReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [weaknessModalVisible, setWeaknessModalVisible] = useState(false);
  const [weaknessDraft, setWeaknessDraft] = useState<string[]>([]);
  const [topWeaknessDraft, setTopWeaknessDraft] = useState<string[]>([]);
  const [weaknessSaving, setWeaknessSaving] = useState(false);
  const [weaknessError, setWeaknessError] = useState(false);
  const [weaknessQuery, setWeaknessQuery] = useState("");
  const [favoriteModalVisible, setFavoriteModalVisible] = useState(false);
  const [favoriteDraft, setFavoriteDraft] = useState<string[]>([]);
  const [topFavoriteDraft, setTopFavoriteDraft] = useState<string[]>([]);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [favoriteError, setFavoriteError] = useState(false);
  const [photo, setPhoto] = useState<StoredFile | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [certificateBusy, setCertificateBusy] = useState(false);
  const {
    renderImage: renderCertificateImage,
    renderHost: certificateImageHost,
  } = useCertificateImageRenderer();
  const savedProfile = useRef<ProfileSettings>(defaultProfile);
  const savingRef = useRef(false);
  const saveOperation = useRef<Promise<unknown> | null>(null);
  const loadVersion = useRef(0);

  const reload = useCallback(async () => {
    const version = ++loadVersion.current;
    setProfileLoading(true);
    setProfileReady(false);
    try {
      // A focus refresh must see any save still finishing after navigation.
      await saveOperation.current?.catch(() => undefined);
      if (version !== loadVersion.current) return;
      const saved = await profileService.load();
      const savedPhoto = await profileService.loadPhoto();
      if (version !== loadVersion.current) return;
      setStats(loadProfileStats());
      setProfile(saved);
      savedProfile.current = saved;
      setPhoto(savedPhoto);
      setProfileReady(true);
    } catch (error) {
      if (version === loadVersion.current) showError("マイページ", error);
    } finally {
      if (version === loadVersion.current) setProfileLoading(false);
    }
  }, [showError]);
  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => {
        loadVersion.current += 1;
        setWeaknessModalVisible(false);
        setFavoriteModalVisible(false);
      };
    }, [reload]),
  );

  useEffect(() => {
    if (settings) setPlayerName(settings.playerName);
  }, [settings]);

  const score = stats.points.earned;
  const rank = evaluateRank(score);
  const weakCount = profile.weaknesses.length;
  const weakRank = weaknessRank(weakCount);
  const weaknessChoices = Array.from(
    new Set([...weaknessOptions, ...profile.weaknessCandidates, ...profile.weaknesses]),
  );
  const language = settings?.language ?? "ja";
  const weaknessSearchTerm = normalizeSearchText(weaknessQuery).trim();
  const visibleWeaknessChoices = weaknessChoices.filter((item) => {
    const label = knownWeaknesses.has(item)
      ? translateText(item, language)
      : item;
    return (
      normalizeSearchText(item).includes(weaknessSearchTerm) ||
      normalizeSearchText(label).includes(weaknessSearchTerm)
    );
  });
  const busy =
    profileSaving ||
    weaknessSaving ||
    favoriteSaving ||
    photoSaving ||
    nameSaving ||
    certificateBusy;
  const profileEditable = profileReady && !busy;

  function updateProfile(partial: Partial<ProfileSettings>) {
    setProfile((current) => ({ ...current, ...partial }));
  }

  function toggleWeakness(value: string) {
    if (savingRef.current) return;
    const next = weaknessDraft.includes(value)
      ? weaknessDraft.filter((item) => item !== value)
      : [...weaknessDraft, value];
    setWeaknessDraft(next);
    setTopWeaknessDraft((current) =>
      current.filter((item) => next.includes(item)),
    );
  }

  function openWeaknessRecord() {
    if (!profileReady || savingRef.current) return;
    Keyboard.dismiss();
    setWeaknessDraft([...profile.weaknesses]);
    setTopWeaknessDraft([...profile.topWeaknesses]);
    setWeaknessError(false);
    setWeaknessModalVisible(true);
  }

  function closeWeaknessRecord() {
    if (!savingRef.current) setWeaknessModalVisible(false);
  }

  async function addWeakness(name: string) {
    const normalized = normalizeSearchText(name);
    const sameName = (item: string) => (
      normalizeSearchText(item.trim()) === normalized
      || (knownWeaknesses.has(item) && normalizeSearchText(translateText(item, language).trim()) === normalized)
    );
    if (savingRef.current || weaknessDraft.some(sameName)) return { error: "この弱点はすでに選択されています。" };
    const existing = weaknessChoices.find(sameName);
    const item = existing ?? name;
    savingRef.current = true;
    setWeaknessSaving(true);
    try {
      const operation = profileService.addWeaknessCandidate(item);
      saveOperation.current = operation;
      const { weaknessCandidates } = await operation;
      setProfile((current) => ({ ...current, weaknessCandidates }));
      savedProfile.current = { ...savedProfile.current, weaknessCandidates };
      setWeaknessDraft((current) => current.includes(item) ? current : [...current, item]);
      setWeaknessQuery("");
      return { addedName: item };
    } finally {
      saveOperation.current = null;
      savingRef.current = false;
      setWeaknessSaving(false);
    }
  }

  async function completeWeaknessRecord() {
    if (!profileReady || savingRef.current) return;
    savingRef.current = true;
    setWeaknessSaving(true);
    setWeaknessError(false);
    try {
      const operation = profileService.patch({
        weaknesses: weaknessDraft,
        topWeaknesses: topWeaknessDraft,
      });
      saveOperation.current = operation;
      const { weaknesses, topWeaknesses } = await operation;
      setProfile((current) => ({ ...current, weaknesses, topWeaknesses }));
      savedProfile.current = {
        ...savedProfile.current,
        weaknesses,
        topWeaknesses,
      };
      setWeaknessModalVisible(false);
    } catch (error) {
      console.error("Weakness record could not be saved", error);
      setWeaknessError(true);
    } finally {
      saveOperation.current = null;
      savingRef.current = false;
      setWeaknessSaving(false);
    }
  }

  async function saveProfile() {
    if (!profileReady || savingRef.current) return;
    savingRef.current = true;
    setProfileSaving(true);
    try {
      const operation = profileService.save(profile, savedProfile.current);
      saveOperation.current = operation;
      const saved = await operation;
      setProfile(saved);
      savedProfile.current = saved;
      showNotice("保存しました", "マイページのステータスを更新しました。");
    } catch (error) {
      showError("マイページの保存に失敗しました", error);
    } finally {
      saveOperation.current = null;
      savingRef.current = false;
      setProfileSaving(false);
    }
  }

  function openFavorites() {
    if (!profileReady || savingRef.current) return;
    Keyboard.dismiss();
    setFavoriteDraft([...profile.favoriteIds]);
    setTopFavoriteDraft([...profile.topFavoriteIds]);
    setFavoriteError(false);
    setFavoriteModalVisible(true);
  }

  async function addFavoriteCandidate(id: string) {
    if (!profileReady || savingRef.current) throw new Error("Profile is busy");
    savingRef.current = true;
    setFavoriteSaving(true);
    try {
      const operation = profileService.addFavoriteCandidate(id);
      saveOperation.current = operation;
      const { favoriteCandidateIds } = await operation;
      setProfile((current) => ({ ...current, favoriteCandidateIds }));
      savedProfile.current = { ...savedProfile.current, favoriteCandidateIds };
    } finally {
      saveOperation.current = null;
      savingRef.current = false;
      setFavoriteSaving(false);
    }
  }

  async function saveFavorites() {
    if (!profileReady || savingRef.current) return;
    savingRef.current = true;
    setFavoriteSaving(true);
    setFavoriteError(false);
    try {
      const operation = profileService.patch({
        favoriteIds: favoriteDraft,
        topFavoriteIds: topFavoriteDraft,
      });
      saveOperation.current = operation;
      const { favoriteIds, topFavoriteIds } = await operation;
      setProfile((current) => ({ ...current, favoriteIds, topFavoriteIds }));
      savedProfile.current = {
        ...savedProfile.current,
        favoriteIds,
        topFavoriteIds,
      };
      setFavoriteModalVisible(false);
    } catch (error) {
      console.error("Favorite selections could not be saved", error);
      setFavoriteError(true);
    } finally {
      saveOperation.current = null;
      savingRef.current = false;
      setFavoriteSaving(false);
    }
  }

  async function changePhoto(remove = false) {
    if (!profileReady || savingRef.current) return;
    savingRef.current = true;
    setPhotoSaving(true);
    try {
      const operation = (async () => {
        const selected = remove
          ? (await profileService.removePhoto(), null)
          : await profileService.pickPhoto();
        if (!remove && !selected) return;
        const photoFileName = selected?.name ?? null;
        setPhoto(selected);
        setProfile((current) => ({ ...current, photoFileName }));
        savedProfile.current = { ...savedProfile.current, photoFileName };
      })();
      saveOperation.current = operation;
      await operation;
    } catch (error) {
      showError("証明写真の保存に失敗しました", error);
    } finally {
      saveOperation.current = null;
      savingRef.current = false;
      setPhotoSaving(false);
    }
  }

  async function saveName() {
    if (savingRef.current) return;
    savingRef.current = true;
    setNameSaving(true);
    try {
      const nextName = playerName.trim() || settings?.playerName || "";
      const operation = updateAudioSettings({ playerName: nextName });
      saveOperation.current = operation;
      await operation;
      setPlayerName(nextName);
      showNotice("保存しました", `これから「${nextName}」と呼びます。`);
    } catch (error) {
      showError("名前の保存に失敗しました", error);
    } finally {
      saveOperation.current = null;
      savingRef.current = false;
      setNameSaving(false);
    }
  }

  async function issueCertificate(action: "save" | "share" | "print" = "save") {
    if (!profileReady || savingRef.current) return;
    savingRef.current = true;
    setCertificateBusy(true);
    try {
      const operation = (async () => {
        const [stored, storedPhoto, storedSettings] = await Promise.all([
          profileService.load(),
          profileService.loadPhoto(),
          settingsService.load(),
        ]);
        const currentStats = loadProfileStats();
        const outsideLevels = readOutsideLevelSnapshot();
        const result = await exportActivityCertificate(
          {
            name: storedSettings.playerName,
            photoDataUrl: await activityCertificatePhotoDataUrl(storedPhoto),
            topWeaknesses: stored.topWeaknesses,
            topFavorites: resolveFavorites(stored.topFavoriteIds),
            favoriteCount: stored.favoriteIds.length,
            weaknessCount: stored.weaknesses.length,
            erectionLengthCm: stored.erectionLengthCm,
            masturbationPerWeek: stored.masturbationPerWeek,
            longestActivitySeconds:
              currentStats.achievements.longestTrainingSeconds,
            totalTimerSeconds: currentStats.achievements.punishmentSeconds,
            outsidePlayerLevel: outsideLevels.playerLevel,
            outsideSuccubusLevel: outsideLevels.succubusLevel,
            totalEarnedPoints: currentStats.points.earned,
            currentPoints: currentStats.points.available,
            issuedAt: new Date(),
          },
          storedSettings.language,
          action,
          renderCertificateImage,
        );
        if (result.status === "saved")
          showNotice(
            "証明書を発行しました",
            "活動記録証明書を画像（PNG）で保存しました。",
          );
      })();
      saveOperation.current = operation;
      await operation;
    } catch (error) {
      showError("証明書の発行に失敗しました", error);
    } finally {
      saveOperation.current = null;
      savingRef.current = false;
      setCertificateBusy(false);
    }
  }

  return (
    <Screen>
      <PageTitle>マイページ</PageTitle>
      {profileLoading ? (
        <AppText variant="muted">読み込み中...</AppText>
      ) : !profileReady ? (
        <PrimaryButton
          title="再読み込み"
          tone="secondary"
          onPress={() => {
            void reload();
          }}
        />
      ) : null}
      <Card style={styles.rankCard}>
        <AppText variant="subtitle">二ノの評価制度</AppText>
        <View style={styles.rankRow}>
          <AppText style={styles.rank}>{rank}</AppText>
          <View style={styles.rankBody}>
            <AppText style={styles.rankLabel}>総合評価</AppText>
            <AppText variant="muted">
              累計獲得Pt：{stats.points.earned}pt
            </AppText>
            <AppText>{evaluationMessage(rank)}</AppText>
          </View>
        </View>
      </Card>
      <Card style={styles.certificateCard}>
        <AppText variant="subtitle">活動記録証明書の発行</AppText>
        <PrimaryButton
          title={certificateBusy ? "発行中..." : "発行する"}
          tone="save"
          disabled={!profileEditable || settings === null}
          onPress={() => {
            void issueCertificate();
          }}
        />
      </Card>
      <Card style={styles.nameCard}>
        <AppText variant="subtitle">呼ばれたい名前</AppText>
        <TextField
          label="名前"
          value={playerName}
          onChangeText={setPlayerName}
          placeholder="名前を入力"
          maxLength={20}
          autoCorrect={false}
          editable={profileEditable && settings !== null}
        />
        <PrimaryButton
          title={nameSaving ? "保存中..." : "名前を保存"}
          disabled={!profileEditable || settings === null}
          onPress={saveName}
        />
      </Card>

      <Card>
        <AppText variant="subtitle">証明写真</AppText>
        <View style={styles.photoFrame}>
          {photo ? (
            <Image
              accessibilityLabel={translateText("証明写真", language)}
              source={{ uri: photo.uri }}
              style={styles.photo}
              resizeMode="contain"
            />
          ) : (
            <AppText variant="muted">写真は未登録です。</AppText>
          )}
        </View>
        <AppText variant="muted" testID="profile-photo-help">
          {
            "画像を1枚登録できます。\nマイナンバーカード/運転免許証/学生証などがオススメ♡"
          }
        </AppText>
        <PrimaryButton
          title={
            photoSaving ? "保存中..." : photo ? "写真を変更" : "写真を添付"
          }
          disabled={!profileEditable}
          onPress={() => {
            void changePhoto();
          }}
        />
        {photo ? (
          <PrimaryButton
            title="写真を削除"
            tone="danger"
            disabled={!profileEditable}
            onPress={() => {
              void changePhoto(true);
            }}
          />
        ) : null}
      </Card>

      <Card style={styles.statusCard}>
        <AppText variant="subtitle">自分のステータス</AppText>
        <BinaryRow
          label="性経験の有無"
          disabled={!profileEditable}
          value={profile.sexualExperience}
          yesLabel="ヤリチン"
          noLabel="童貞"
          onChange={(value) => updateProfile({ sexualExperience: value })}
        />
        <BinaryRow
          label="恋愛経験"
          disabled={!profileEditable}
          value={profile.romanceExperience}
          onChange={(value) => updateProfile({ romanceExperience: value })}
        />
        <BinaryRow
          label="アナル経験"
          disabled={!profileEditable}
          value={profile.analExperience}
          onChange={(value) => updateProfile({ analExperience: value })}
        />
        <BinaryRow
          label="乳首経験"
          disabled={!profileEditable}
          value={profile.nippleExperience}
          onChange={(value) => updateProfile({ nippleExperience: value })}
        />
        <BinaryRow
          label="露出経験"
          disabled={!profileEditable}
          value={profile.exposureExperience}
          onChange={(value) => updateProfile({ exposureExperience: value })}
        />
        <BinaryRow
          label="特殊性癖の有無"
          disabled={!profileEditable}
          value={profile.specialFetish}
          onChange={(value) => updateProfile({ specialFetish: value })}
        />
        <View style={styles.inputGrid}>
          <TextField
            label="勃起時のおちんぽの長さ（cm）"
            editable={profileEditable}
            value={profile.erectionLengthCm}
            onChangeText={(value) => updateProfile({ erectionLengthCm: value })}
            keyboardType="numeric"
            placeholder="例：12"
          />
          <TextField
            label="オナニー頻度（回/1週間）"
            editable={profileEditable}
            value={profile.masturbationPerWeek}
            onChangeText={(value) =>
              updateProfile({ masturbationPerWeek: value })
            }
            keyboardType="numeric"
            placeholder="例：7"
          />
          <TextField
            label="オナニー時間（分）"
            editable={profileEditable}
            value={profile.masturbationMinutes}
            onChangeText={(value) =>
              updateProfile({ masturbationMinutes: value })
            }
            keyboardType="numeric"
            placeholder="例：20"
          />
          <TextField
            label="シコティッシュ枚数"
            editable={profileEditable}
            value={profile.tissueCount}
            onChangeText={(value) => updateProfile({ tissueCount: value })}
            keyboardType="numeric"
            placeholder="例：3"
          />
        </View>
        <View style={styles.profileSummary}>
          <Metric
            label="おちんぽ判定"
            value={penisLengthLabel(profile.erectionLengthCm)}
          />
          <Metric
            label="頻度"
            value={
              numericValue(profile.masturbationPerWeek) === null
                ? "未設定"
                : `${numericValue(profile.masturbationPerWeek)}回/1週間`
            }
          />
          <Metric
            label="時間判定"
            value={masturbationTimeLabel(profile.masturbationMinutes)}
          />
          <Metric
            label="ティッシュ"
            value={
              numericValue(profile.tissueCount) === null
                ? "未設定"
                : `${numericValue(profile.tissueCount)}枚`
            }
          />
        </View>
        <PrimaryButton
          title={profileSaving ? "保存中..." : "ステータスを保存"}
          disabled={!profileEditable}
          onPress={saveProfile}
        />
      </Card>

      <Card style={styles.weaknessCard}>
        <AppText variant="subtitle">弱点</AppText>
        <PrimaryButton
          title="弱点記録"
          tone="save"
          disabled={!profileEditable}
          onPress={openWeaknessRecord}
        />
        <AppText variant="label">弱点上位5つ</AppText>
        <RankedSummary
          values={profile.topWeaknesses}
          localize={(item) => knownWeaknesses.has(item)}
        />
        {profile.weaknesses.length ? (
          <Disclosure
            title="登録した弱点"
            testID="registered-weaknesses-toggle"
          >
            <View style={styles.weaknessGrid}>
              {Array.from(new Set(profile.weaknesses)).map((item) => (
                <View key={item} style={styles.weaknessChip}>
                  <AppText
                    localize={knownWeaknesses.has(item)}
                    textBreakStrategy="simple"
                    style={[styles.weaknessText, styles.weaknessTextActive]}
                  >
                    {item}
                  </AppText>
                </View>
              ))}
            </View>
          </Disclosure>
        ) : (
          <AppText variant="muted">弱点はまだ登録されていません。</AppText>
        )}
        <View style={styles.weaknessSummary}>
          <Metric label="チェック数" value={`${weakCount}個`} />
          <Metric label="変態度" value={weakRank} />
        </View>
      </Card>

      <Card style={styles.favoriteCard}>
        <AppText variant="subtitle">推し</AppText>
        <PrimaryButton
          title="推し記録"
          tone="save"
          disabled={!profileEditable}
          onPress={openFavorites}
        />
        <AppText variant="label">推し上位5名</AppText>
        <RankedSummary values={profile.topFavoriteIds.map(favoriteDisplayName)} />
        {profile.favoriteIds.length > 0 ? (
          <Disclosure title="登録した推し" testID="registered-favorites-toggle">
            <View style={styles.weaknessGrid}>
              {profile.favoriteIds.map((id) => (
                <View key={id} style={styles.weaknessChip}>
                  <AppText localize={false} textBreakStrategy="simple" style={[styles.weaknessText, styles.favoriteTextActive]}>
                    {favoriteDisplayName(id)}
                  </AppText>
                </View>
              ))}
            </View>
          </Disclosure>
        ) : <AppText variant="muted">推しはまだ登録されていません。</AppText>}
        <View style={styles.weaknessSummary} testID="favorite-summary">
          <Metric label="推し登録数" value={String(profile.favoriteIds.length)} />
        </View>
      </Card>

      <Card>
        <AppText variant="subtitle">傾向分析</AppText>
        <View style={styles.grid}>
          <Metric
            label="調教適性"
            value={trainingAptitude(stats.achievements.trainingCount)}
          />
          <Metric
            label="調教回数"
            value={`${stats.achievements.trainingCount}回`}
          />
          <Metric
            label="調教最速"
            value={
              stats.achievements.bestTrainingSeconds === null
                ? "未記録"
                : secondsToClock(stats.achievements.bestTrainingSeconds)
            }
          />
          <Metric
            label="調教最長"
            value={
              stats.achievements.longestTrainingSeconds === null
                ? "未記録"
                : secondsToClock(stats.achievements.longestTrainingSeconds)
            }
          />
          <Metric
            label="お仕置き耐性"
            value={punishmentTolerance(stats.achievements.punishmentMinutes)}
          />
          <Metric
            label="お仕置き総計"
            value={`${stats.achievements.punishmentMinutes}分`}
          />
          <Metric label="累計獲得Pt" value={`${stats.points.earned}pt`} />
          <Metric label="所持Pt" value={`${stats.points.available}pt`} />
        </View>
      </Card>

      <PrimaryButton
        title="管理・設定メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu?section=management")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
      {certificateImageHost}
      <FavoritePickerModal
        visible={favoriteModalVisible}
        selected={favoriteDraft}
        candidateIds={profile.favoriteCandidateIds}
        ranked={topFavoriteDraft}
        saving={favoriteSaving}
        error={favoriteError}
        onAddCandidate={addFavoriteCandidate}
        onSelectedChange={(ids) => {
          if (savingRef.current) return;
          setFavoriteDraft(ids);
          setTopFavoriteDraft((current) =>
            current.filter((id) => ids.includes(id)),
          );
        }}
        onRankedChange={setTopFavoriteDraft}
        onSave={saveFavorites}
        onClose={() => {
          if (!savingRef.current) setFavoriteModalVisible(false);
        }}
      />
      <Modal
        visible={weaknessModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeWeaknessRecord}
      >
        <View
          style={[
            styles.weaknessModalBackdrop,
            {
              paddingTop: Math.max(16, insets.top + 12),
              paddingBottom: Math.max(16, insets.bottom + 12),
              paddingLeft: Math.max(16, insets.left + 12),
              paddingRight: Math.max(16, insets.right + 12),
            },
          ]}
        >
          <View style={styles.weaknessModal} accessibilityViewIsModal>
            <AppText variant="subtitle">弱点記録</AppText>
            <ScrollView
              style={styles.weaknessModalScroll}
              contentContainerStyle={styles.weaknessModalContent}
              keyboardShouldPersistTaps="handled"
            >
              <ManualEntryField key={String(weaknessModalVisible)} title="弱点を手入力で追加" label="追加する弱点名"
                emptyMessage="弱点名を入力してください。" successMessage="弱点を追加しました。"
                onAdd={addWeakness} disabled={weaknessSaving} testID="weakness-add" />
              <RankedSelectionEditor
                title="弱点上位5つ"
                options={weaknessDraft.map((item) => ({
                  value: item,
                  label: item,
                  localize: knownWeaknesses.has(item),
                }))}
                value={topWeaknessDraft}
                onChange={setTopWeaknessDraft}
                limit={5}
                disabled={weaknessSaving}
                testID="weakness-ranking"
              />
              <Disclosure
                title="検索"
                active={weaknessSearchTerm.length > 0}
                testID="weakness-search-toggle"
              >
                <TextField
                  label="弱点を検索"
                  accessibilityLabel={translateText("弱点を検索", language)}
                  value={weaknessQuery}
                  onChangeText={setWeaknessQuery}
                  placeholder="弱点名を入力"
                  editable={!weaknessSaving}
                  autoCorrect={false}
                  autoCapitalize="none"
                  testID="weakness-search"
                />
                {weaknessQuery.length > 0 ? (
                  <PrimaryButton
                    title="検索をクリア"
                    tone="secondary"
                    disabled={weaknessSaving}
                    onPress={() => setWeaknessQuery("")}
                  />
                ) : null}
              </Disclosure>
              {weaknessSearchTerm ? (
                <AppText variant="muted">{`検索結果：${visibleWeaknessChoices.length}件`}</AppText>
              ) : null}
              {visibleWeaknessChoices.length === 0 ? (
                <AppText variant="muted">
                  条件に一致する弱点はありません。
                </AppText>
              ) : null}
              <View style={styles.weaknessGrid}>
                {visibleWeaknessChoices.map((item) => {
                  const selected = weaknessDraft.includes(item);
                  return (
                    <Pressable
                      key={item}
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked: selected,
                        disabled: weaknessSaving,
                      }}
                      disabled={weaknessSaving}
                      onPress={() => toggleWeakness(item)}
                      style={[
                        styles.weaknessChip,
                        styles.weaknessChoice,
                        selected && styles.weaknessChipSelected,
                      ]}
                    >
                      <AppText style={styles.weaknessCheck} accessible={false}>
                        {selected ? "✅" : "☐"}
                      </AppText>
                      <AppText
                        localize={knownWeaknesses.has(item)}
                        textBreakStrategy="simple"
                        style={[
                          styles.weaknessText,
                          selected && styles.weaknessTextActive,
                        ]}
                      >
                        {item}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.weaknessSelectionCount}>
              <AppText variant="muted">チェック数</AppText>
              <AppText>{weaknessDraft.length}個</AppText>
            </View>
            {weaknessError ? (
              <AppText style={styles.weaknessSaveError}>
                弱点を保存できませんでした。
              </AppText>
            ) : null}
            <View style={styles.weaknessModalActions}>
              <View style={styles.weaknessModalAction}>
                <PrimaryButton
                  title="キャンセル"
                  tone="secondary"
                  disabled={weaknessSaving}
                  onPress={closeWeaknessRecord}
                />
              </View>
              <View style={styles.weaknessModalAction}>
                <PrimaryButton
                  title={
                    weaknessSaving
                      ? "保存中..."
                      : weaknessError
                        ? "再保存"
                        : "完了"
                  }
                  disabled={weaknessSaving}
                  onPress={completeWeaknessRecord}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function BinaryRow({
  label,
  value,
  yesLabel = "あり",
  noLabel = "なし",
  onChange,
  disabled = false,
}: {
  label: string;
  value: ProfileExperience;
  yesLabel?: string;
  noLabel?: string;
  onChange: (value: ProfileExperience) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.binaryRow}>
      <AppText style={styles.binaryLabel}>{label}</AppText>
      <View style={styles.binaryButtons}>
        <ChoiceButton
          title={noLabel}
          disabled={disabled}
          active={value === "no"}
          onPress={() => onChange("no")}
        />
        <ChoiceButton
          title={yesLabel}
          disabled={disabled}
          active={value === "yes"}
          onPress={() => onChange("yes")}
        />
      </View>
    </View>
  );
}

function ChoiceButton({
  title,
  active,
  onPress,
  disabled = false,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={[
        styles.choice,
        active && styles.choiceActive,
        disabled && styles.choiceDisabled,
      ]}
    >
      <AppText style={[styles.choiceText, active && styles.choiceTextActive]}>
        {title}
      </AppText>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText variant="muted">{label}</AppText>
      <AppText style={styles.metricValue}>{value}</AppText>
    </View>
  );
}

function RankedSummary({
  values,
  localize = () => false,
}: {
  values: readonly string[];
  localize?: (value: string) => boolean;
}) {
  return values.length ? (
    <View style={styles.rankedSummary}>
      {values.map((value, index) => (
        <View key={value} style={styles.rankedSummaryRow}>
          <AppText localize={false} style={styles.rankNumber}>
            {index + 1}
          </AppText>
          <AppText localize={localize(value)} style={styles.rankedSummaryText}>
            {value}
          </AppText>
        </View>
      ))}
    </View>
  ) : (
    <AppText variant="muted">順位はまだ設定されていません。</AppText>
  );
}

const styles = StyleSheet.create({
  rankCard: { borderColor: "#f2c94c" },
  nameCard: { borderColor: "#f2c94c" },
  statusCard: { borderColor: "#7db7ff" },
  weaknessCard: { borderColor: "#ff69b4" },
  favoriteCard: { borderColor: "#9bcbff" },
  certificateCard: { borderColor: "#f2c94c" },
  photoFrame: {
    alignSelf: "center",
    width: 144,
    height: 192,
    borderWidth: 1,
    borderColor: "#777",
    backgroundColor: "#080808",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  photo: { width: "100%", height: "100%" },
  rankedSummary: { gap: 8 },
  rankedSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    padding: 8,
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 4,
  },
  rankNumber: {
    width: 24,
    textAlign: "center",
    fontWeight: "900",
    color: "#f2c94c",
  },
  rankedSummaryText: { flex: 1, minWidth: 0 },
  rankRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  rank: {
    minWidth: 72,
    color: lightTheme.danger,
    fontSize: 58,
    lineHeight: 70,
    fontWeight: "900",
    textAlign: "center",
  },
  rankBody: { flex: 1, gap: 6 },
  rankLabel: { color: "#f2c94c", fontWeight: "900" },
  binaryRow: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingTop: 10,
  },
  binaryLabel: { color: "#fff", fontWeight: "900" },
  binaryButtons: { flexDirection: "row", gap: 8 },
  choice: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#777",
    borderRadius: 4,
    paddingVertical: 9,
    backgroundColor: "#050505",
  },
  choiceActive: {
    borderColor: "#fff",
    backgroundColor: "#1f5fae",
  },
  choiceDisabled: { opacity: 0.55 },
  choiceText: { color: lightTheme.muted, fontWeight: "900" },
  choiceTextActive: { color: "#fff" },
  inputGrid: { gap: 10 },
  profileSummary: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  weaknessGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  weaknessChip: {
    // Give Text a definite column width instead of shrinking an intrinsic-width
    // chip. Android can otherwise measure the final glyph outside its bounds.
    width: "48%",
    minWidth: 0,
    minHeight: 44,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#050505",
  },
  weaknessCheck: {
    width: 20,
    flexShrink: 0,
    textAlign: "center",
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 20,
  },
  weaknessText: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 20,
  },
  weaknessTextActive: { color: "#ff69b4" },
  favoriteTextActive: { color: "#9bcbff" },
  weaknessChipSelected: { borderColor: "#ff69b4", backgroundColor: "#251322" },
  weaknessChoice: { minHeight: 44 },
  weaknessModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  weaknessModal: {
    width: "100%",
    maxWidth: 560,
    height: "100%",
    maxHeight: 720,
    minHeight: 0,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: "#ff69b4",
    borderRadius: 8,
    backgroundColor: "#111",
  },
  weaknessModalScroll: { flex: 1, minHeight: 0 },
  weaknessModalContent: {
    gap: 16,
    paddingBottom: 8,
    paddingRight: Platform.OS === "web" ? 16 : 0,
  },
  weaknessSelectionCount: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  weaknessSaveError: { color: "#ffb5bd" },
  weaknessModalActions: { flexDirection: "row", gap: 10 },
  weaknessModalAction: { flex: 1 },
  weaknessSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#444",
    paddingTop: 10,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: {
    minWidth: "46%",
    flexGrow: 1,
    gap: 4,
    borderWidth: 1,
    borderColor: "#444",
    padding: 10,
    backgroundColor: "#080808",
  },
  metricValue: {
    color: "#7db7ff",
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "900",
  },
});
