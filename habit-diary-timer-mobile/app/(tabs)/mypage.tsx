import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RoomConversation } from "@/components/RoomConversation";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
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
import { roomMessages } from "@/constants/messages";
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

function yesNoLabel(value: ProfileExperience, yesLabel = "あり", noLabel = "なし") {
  if (value === "yes") return yesLabel;
  if (value === "no") return noLabel;
  return "未設定";
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
  const { showNotice } = useAppModal();
  const { settings, updateAudioSettings } = useAppAudio();
  const [profile, setProfile] = useState<ProfileSettings>(defaultProfile);
  const [stats, setStats] = useState(loadProfileStats);
  const [playerName, setPlayerName] = useState("");

  const reload = useCallback(() => {
    setStats(loadProfileStats());
    profileService.load().then(setProfile);
  }, []);
  useFocusEffect(reload);

  useEffect(() => {
    if (settings) setPlayerName(settings.playerName);
  }, [settings]);

  const score = stats.points.earned;
  const rank = evaluateRank(score);
  const weakCount = profile.weaknesses.length;
  const weakRank = weaknessRank(weakCount);
  const profileLines = useMemo(() => {
    const lines = [];
    if (profile.sexualExperience !== "unknown")
      lines.push({
        text: `性経験は「${yesNoLabel(profile.sexualExperience, "ヤリチン", "童貞")}」として登録しておくわ。`,
        withName: false,
      });
    if (weakCount > 0)
      lines.push({
        text: `弱点${weakCount}個。判定は「${weakRank}」ね。自覚できて偉いじゃない♡`,
        withName: false,
      });
    return lines;
  }, [profile.sexualExperience, weakCount, weakRank]);

  function updateProfile(partial: Partial<ProfileSettings>) {
    setProfile((current) => ({ ...current, ...partial }));
  }

  function toggleWeakness(value: string) {
    updateProfile({
      weaknesses: profile.weaknesses.includes(value)
        ? profile.weaknesses.filter((item) => item !== value)
        : [...profile.weaknesses, value],
    });
  }

  async function saveProfile() {
    await profileService.save(profile);
    showNotice("保存しました", "マイページのステータスを更新しました。");
  }

  return (
    <Screen>
      <AppText variant="title">マイページ</AppText>
      <RoomConversation
        characterSource={require("../../assets/characters/settings-nino.png")}
        roomName="マイページ"
        lines={[...(roomMessages.mypage.lines ?? []), ...profileLines]}
        contractLines={roomMessages.mypage.contractLines}
      />

      <Card style={styles.rankCard}>
        <AppText variant="subtitle">二ノの評価制度</AppText>
        <View style={styles.rankRow}>
          <AppText style={styles.rank}>{rank}</AppText>
          <View style={styles.rankBody}>
            <AppText style={styles.rankLabel}>総合評価</AppText>
            <AppText variant="muted">累計獲得Pt：{stats.points.earned}pt</AppText>
            <AppText>{evaluationMessage(rank)}</AppText>
          </View>
        </View>
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
        />
        <PrimaryButton
          title="名前を保存"
          onPress={async () => {
            const nextName = playerName.trim() || "マゾ";
            setPlayerName(nextName);
            await updateAudioSettings({ playerName: nextName });
            showNotice("保存しました", `これから「${nextName}」と呼びます。`);
          }}
        />
      </Card>

      <Card style={styles.statusCard}>
        <AppText variant="subtitle">自分のステータス</AppText>
        <BinaryRow
          label="性経験の有無"
          value={profile.sexualExperience}
          yesLabel="ヤリチン"
          noLabel="童貞"
          onChange={(value) => updateProfile({ sexualExperience: value })}
        />
        <BinaryRow
          label="恋愛経験"
          value={profile.romanceExperience}
          onChange={(value) => updateProfile({ romanceExperience: value })}
        />
        <BinaryRow
          label="アナル経験"
          value={profile.analExperience}
          onChange={(value) => updateProfile({ analExperience: value })}
        />
        <BinaryRow
          label="乳首経験"
          value={profile.nippleExperience}
          onChange={(value) => updateProfile({ nippleExperience: value })}
        />
        <BinaryRow
          label="露出経験"
          value={profile.exposureExperience}
          onChange={(value) => updateProfile({ exposureExperience: value })}
        />
        <BinaryRow
          label="特殊性癖の有無"
          value={profile.specialFetish}
          onChange={(value) => updateProfile({ specialFetish: value })}
        />
        <View style={styles.inputGrid}>
          <TextField
            label="勃起時のおちんぽの長さ（cm）"
            value={profile.erectionLengthCm}
            onChangeText={(value) => updateProfile({ erectionLengthCm: value })}
            keyboardType="numeric"
            placeholder="例：12"
          />
          <TextField
            label="オナニー頻度（回/1週間）"
            value={profile.masturbationPerWeek}
            onChangeText={(value) => updateProfile({ masturbationPerWeek: value })}
            keyboardType="numeric"
            placeholder="例：7"
          />
          <TextField
            label="オナニー時間（分）"
            value={profile.masturbationMinutes}
            onChangeText={(value) => updateProfile({ masturbationMinutes: value })}
            keyboardType="numeric"
            placeholder="例：20"
          />
          <TextField
            label="シコティッシュ枚数"
            value={profile.tissueCount}
            onChangeText={(value) => updateProfile({ tissueCount: value })}
            keyboardType="numeric"
            placeholder="例：3"
          />
        </View>
        <View style={styles.profileSummary}>
          <Metric label="おちんぽ判定" value={penisLengthLabel(profile.erectionLengthCm)} />
          <Metric label="頻度" value={numericValue(profile.masturbationPerWeek) === null ? "未設定" : `${numericValue(profile.masturbationPerWeek)}回/1週間`} />
          <Metric label="時間判定" value={masturbationTimeLabel(profile.masturbationMinutes)} />
          <Metric label="ティッシュ" value={numericValue(profile.tissueCount) === null ? "未設定" : `${numericValue(profile.tissueCount)}枚`} />
        </View>
        <PrimaryButton title="ステータスを保存" onPress={saveProfile} />
      </Card>

      <Card style={styles.weaknessCard}>
        <AppText variant="subtitle">弱点</AppText>
        <View style={styles.weaknessGrid}>
          {weaknessOptions.map((item) => {
            const active = profile.weaknesses.includes(item);
            return (
              <Pressable
                key={item}
                onPress={() => toggleWeakness(item)}
                style={styles.weaknessChip}
              >
                <AppText style={styles.weaknessCheck}>{active ? "✅" : "☐"}</AppText>
                <AppText style={[styles.weaknessText, active && styles.weaknessTextActive]}>
                  {item}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.weaknessSummary}>
          <Metric label="チェック数" value={`${weakCount}個`} />
          <Metric label="変態度" value={weakRank} />
        </View>
        <PrimaryButton title="弱点を保存" onPress={saveProfile} />
      </Card>

      <Card>
        <AppText variant="subtitle">傾向分析</AppText>
        <View style={styles.grid}>
          <Metric label="調教適性" value={trainingAptitude(stats.achievements.trainingCount)} />
          <Metric label="調教回数" value={`${stats.achievements.trainingCount}回`} />
          <Metric label="調教最速" value={stats.achievements.bestTrainingSeconds === null ? "未記録" : secondsToClock(stats.achievements.bestTrainingSeconds)} />
          <Metric label="調教最長" value={stats.achievements.longestTrainingSeconds === null ? "未記録" : secondsToClock(stats.achievements.longestTrainingSeconds)} />
          <Metric label="お仕置き耐性" value={punishmentTolerance(stats.achievements.punishmentMinutes)} />
          <Metric label="お仕置き総計" value={`${stats.achievements.punishmentMinutes}分`} />
          <Metric label="累計獲得Pt" value={`${stats.points.earned}pt`} />
          <Metric label="所持Pt" value={`${stats.points.available}pt`} />
        </View>
      </Card>

      <PrimaryButton
        title="管理・設定メニューへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)/menu")}
      />
      <PrimaryButton
        title="ホームへ戻る"
        tone="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}

function BinaryRow({
  label,
  value,
  yesLabel = "あり",
  noLabel = "なし",
  onChange,
}: {
  label: string;
  value: ProfileExperience;
  yesLabel?: string;
  noLabel?: string;
  onChange: (value: ProfileExperience) => void;
}) {
  return (
    <View style={styles.binaryRow}>
      <AppText style={styles.binaryLabel}>{label}</AppText>
      <View style={styles.binaryButtons}>
        <ChoiceButton
          title={noLabel}
          active={value === "no"}
          onPress={() => onChange("no")}
        />
        <ChoiceButton
          title={yesLabel}
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
}: {
  title: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
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

const styles = StyleSheet.create({
  rankCard: { borderColor: "#f2c94c" },
  nameCard: { borderColor: "#f2c94c" },
  statusCard: { borderColor: "#7db7ff" },
  weaknessCard: { borderColor: "#ff69b4" },
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
  choiceText: { color: lightTheme.muted, fontWeight: "900" },
  choiceTextActive: { color: "#fff" },
  inputGrid: { gap: 10 },
  profileSummary: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  weaknessGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  weaknessChip: {
    minWidth: 96,
    maxWidth: "100%",
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
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 20,
  },
  weaknessText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 20,
  },
  weaknessTextActive: { color: "#ff69b4" },
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

