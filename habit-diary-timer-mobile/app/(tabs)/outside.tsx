import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppAudio } from "@/audio/AudioProvider";
import { execute, queryOne } from "@/database/client";
import { toDateKey, toDateTimeKey } from "@/utils/date";

type Phase = "explore" | "talk" | "battle" | "result";
type SuccubusStage = "beginner" | "middle" | "queen";
type TemptationEvent = "overlook" | "whisper" | "chest" | "tail" | "back";
type OutsideEvent = TemptationEvent | "battle";
type BattleStatus = {
  hp: number;
  mp: number;
  desire: number;
  obedience: number;
  enemyFocus: number;
};

const levelKey = "outside_game_level";
const levelDateKey = "outside_game_level_date";
const temptationEvents: TemptationEvent[] = ["overlook", "whisper", "chest", "tail", "back"];
const outsideEventLabels: Record<OutsideEvent, string> = {
  overlook: "誘惑・見下ろし",
  whisper: "耳元で囁き",
  chest: "胸チラ",
  tail: "尻尾でからかう",
  back: "お尻を向けて挑発",
  battle: "サキュバス戦闘立ち絵",
};
const pixelSprites = {
  mapBg: require("../../assets/characters/outside-pixels/outside-map-bg.png"),
  player: require("../../assets/characters/outside-pixels/player-dot.png"),
  door: require("../../assets/characters/outside-pixels/door-dot.png"),
  succubus: {
    beginner: require("../../assets/characters/outside-pixels/succubus-beginner-dot.png"),
    middle: require("../../assets/characters/outside-pixels/succubus-middle-dot.png"),
    queen: require("../../assets/characters/outside-pixels/succubus-queen-dot.png"),
  },
};

const battleLines: Record<SuccubusStage, {
  appear: string;
  success: string;
  fail: string;
  escape: string;
  win: string;
  lose: string;
}> = {
  beginner: {
    appear: "ニノメスガキ初級サキュバスが現れました。誘惑に耐えて、家に帰ってください♡",
    success: "うぅ……効いてないんですか？でも、まだ諦めませんから♡",
    fail: "あっ、効きました？よ、よかった……このまま揺れてください♡",
    escape: "少し距離を取れました。でも、まだ追いかけますからね♡",
    win: "誘惑を切り抜けました。今日は家に帰れそうです……悔しいです♡",
    lose: "誘惑に敗北しました。館へ戻ってください……私の勝ち、です♡",
  },
  middle: {
    appear: "上級サキュバスが現れた。馴れ馴れしい笑顔で、帰り道を塞いでくる。",
    success: "へぇ、やるじゃん。でも無理してるの、バレバレだよ♡",
    fail: "ほら、やっぱり揺れた。心配になるくらい素直だね♡",
    escape: "距離を取った。けど、甘い声がまだ背中にまとわりついている。",
    win: "誘惑を切り抜けた。中級サキュバスが少し寂しそうに笑った。",
    lose: "誘惑に負けた。彼女は困ったように笑いながら、館の方を指差した。",
  },
  queen: {
    appear: "女王サキュバスが現れた。圧倒的な気配で、帰宅意思を踏み潰しにくる。",
    success: "ふーん、耐えるんだ。じゃあ、もっと強くしていいよね♡",
    fail: "ほら落ちた。最初から私に勝てるわけないじゃん♡",
    escape: "距離を取った。けど女王は椅子から動かず、ただ笑っている。",
    win: "誘惑を切り抜けた。女王は退屈そうに、次を楽しみにしている。",
    lose: "誘惑に敗北した。女王の一言で、足は館へ向かっていた。",
  },
};

function readSetting(key: string) {
  return queryOne<{ setting_value: string }>(
    "SELECT setting_value FROM app_settings WHERE setting_key=?",
    [key],
  )?.setting_value;
}

function saveSetting(key: string, value: string) {
  const now = toDateTimeKey();
  execute(
    `INSERT INTO app_settings(setting_key, setting_value, updated_at)
     VALUES(?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
    [key, value, now],
  );
}

function initializeLevel() {
  const today = toDateKey();
  const savedLevel = Number(readSetting(levelKey) ?? 0);
  const savedDate = readSetting(levelDateKey);
  const level =
    savedDate === today ? savedLevel : Math.min(90, Math.max(0, savedLevel) + 10);
  if (savedDate !== today) {
    saveSetting(levelKey, String(level));
    saveSetting(levelDateKey, today);
  }
  return level;
}

function succubusForLevel(level: number) {
  if (level <= 10) {
    return {
      stage: "beginner" as const,
      title: "ニノメスガキ初級サキュバス",
      level: 10,
      message: "レベル10で誘惑して、油断した相手を逆転する小悪魔。",
      color: "#ff69b4",
    };
  }
  if (level < 70) {
    return {
      stage: "middle" as const,
      title: "上級サキュバス",
      level,
      message: "同じレベルで現れて、駆け引きと選択肢で揺さぶってくる。",
      color: "#9b5de5",
    };
  }
  return {
    stage: "queen" as const,
    title: "女王サキュバス",
    level: Math.min(90, level + 20),
    message: "こちらより20レベル上の圧で、帰宅意思をねじ伏せにくる。",
    color: "#d9202a",
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function randomTemptationEvent() {
  return temptationEvents[Math.floor(Math.random() * temptationEvents.length)] ?? "overlook";
}

export default function OutsideScreen() {
  const { playEffect, stopEffect, setBgmMode } = useAppAudio();
  const [level, setLevel] = useState(initializeLevel);
  const [phase, setPhase] = useState<Phase>("explore");
  const [charmTurns, setCharmTurns] = useState(0);
  const [message, setMessage] = useState(
    "館の外へ出た。家に帰るには、外にいるサキュバスの誘惑を切り抜ける必要がある。",
  );
  const [battle, setBattle] = useState<BattleStatus>({
    hp: 100,
    mp: 50,
    desire: 0,
    obedience: 0,
    enemyFocus: 100,
  });

  const succubus = useMemo(() => succubusForLevel(level), [level]);

  useEffect(() => {
    if (charmTurns > 0) {
      setBgmMode("outsideCharm");
      return () => {
        stopEffect("trainingStart");
        setBgmMode("default");
      };
    }
    if (phase === "battle") {
      setBgmMode("outsideBattle");
      return () => {
        stopEffect("trainingStart");
        setBgmMode("default");
      };
    }
    if (phase === "talk") {
      setBgmMode("outsideTemptation");
      return () => {
        stopEffect("trainingStart");
        setBgmMode("default");
      };
    }
    setBgmMode("default");
    stopEffect("trainingStart");
    return () => {
      stopEffect("trainingStart");
      setBgmMode("default");
    };
  }, [charmTurns, phase, setBgmMode, stopEffect]);

  function startEncounter() {
    setPhase("battle");
    setCharmTurns(0);
    setBattle({
      hp: 100,
      mp: 50,
      desire: 10,
      obedience: 0,
      enemyFocus: 100,
    });
    setMessage(`サキュバスがこちらに近づいてきた。\n${battleLines[succubus.stage].appear}`);
  }

  function resolveCommand(command: "resist" | "focus" | "run") {
    if (phase !== "battle") return;
    const activeCharmTurns = charmTurns;
    const levelGap = succubus.level - level;
    const roll = Math.random() * 100;
    const baseSuccess =
      command === "resist" ? 56 : command === "focus" ? 68 : 46;
    const success =
      command === "run" && activeCharmTurns > 0
        ? false
        : roll < baseSuccess - levelGap * 1.2 + battle.mp * 0.12;
    const mpCost = command === "focus" ? 14 : command === "run" ? 8 : 5;
    const next = { ...battle, mp: clamp(battle.mp - mpCost) };
    setCharmTurns(Math.max(0, activeCharmTurns - 1));

    if (success) {
      next.enemyFocus = clamp(next.enemyFocus - (command === "focus" ? 34 : 24));
      next.desire = clamp(next.desire + 6);
      next.obedience = clamp(next.obedience + 3);
      setMessage(
        command === "run"
          ? battleLines[succubus.stage].escape
          : battleLines[succubus.stage].success,
      );
    } else {
      next.hp = clamp(next.hp - 10);
      next.desire = clamp(next.desire + 24 + Math.max(0, levelGap));
      next.obedience = clamp(next.obedience + 18 + Math.max(0, levelGap / 2));
      setMessage(
        command === "run" && activeCharmTurns > 0
          ? `魅了中で逃亡に失敗した。あと${Math.max(0, activeCharmTurns - 1)}ターン、足が言うことを聞かない。`
          : battleLines[succubus.stage].fail,
      );
    }

    if (next.enemyFocus <= 0) {
      setPhase("result");
      setBattle(next);
      setMessage(battleLines[succubus.stage].win);
      return;
    }
    if (next.desire >= 100 || next.obedience >= 100 || next.hp <= 0) {
      setPhase("result");
      setBattle(next);
      setMessage(battleLines[succubus.stage].lose);
      return;
    }
    setBattle(next);
  }

  function resetBattle() {
    setPhase("explore");
    setCharmTurns(0);
    setMessage("もう一度、帰り道を探す。油断しないように進もう。");
    setBattle({
      hp: 100,
      mp: 50,
      desire: 0,
      obedience: 0,
      enemyFocus: 100,
    });
  }

  function lowerLevelByTail(reason: string) {
    const nextLevel = Math.max(0, level - 10);
    setLevel(nextLevel);
    saveSetting(levelKey, String(nextLevel));
    saveSetting(levelDateKey, toDateKey());
    setCharmTurns(3);
    playEffect("trainingStart");
    setMessage(`${reason}\n魅了状態になった。3ターンの間、逃亡は失敗する。\n尻尾に絡め取られて、レベルが${nextLevel}まで下がった。`);
  }

  function resistTemptation() {
    if (phase !== "talk") return;
    const nextEvent = randomTemptationEvent();
    const success = Math.random() * 100 < 58 + level * 0.2;
    if (nextEvent === "whisper") playEffect("trainingStart");
    if (success) {
      setMessage(`${outsideEventLabels[nextEvent]}を耐えた。\nでも、次の誘惑がすぐに来る。`);
      return;
    }
    setCharmTurns(3);
    playEffect("trainingStart");
    setMessage(`${outsideEventLabels[nextEvent]}で心が揺れた。\n魅了状態になった。3ターンの間、逃亡は失敗する。`);
  }

  function surrenderToTemptation() {
    if (phase !== "talk") return;
    lowerLevelByTail("誘惑に負けた。サキュバスが嬉しそうに尻尾を揺らす。");
  }

  function giveUpAndRun() {
    if (phase !== "talk") return;
    if (charmTurns > 0) {
      const nextTurns = Math.max(0, charmTurns - 1);
      setCharmTurns(nextTurns);
      setMessage(`魅了中で逃亡に失敗した。\nあと${nextTurns}ターン、逃げられない。`);
      return;
    }
    setPhase("explore");
    stopEffect("trainingStart");
    setMessage("逃亡した。息を整えて、別の道を選び直そう。");
  }

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <AppText style={styles.kicker}>OUTSIDE RPG</AppText>
        <AppText variant="title">館の外へ（家に帰る）</AppText>

        <View style={styles.pixelMap}>
          <Image source={pixelSprites.mapBg} style={styles.mapBackground} contentFit="cover" />
          <Pressable style={styles.topMoveZone} onPress={startEncounter}>
            <AppText style={styles.topMoveText}>上へ進む</AppText>
          </Pressable>
          <Pressable style={styles.door} onPress={() => router.replace("/(tabs)/nino-room")}>
            <Image source={pixelSprites.door} style={styles.doorSprite} contentFit="contain" />
          </Pressable>
          <View style={[styles.mapSuccubus, phase === "battle" && styles.mapSuccubusNear, { borderColor: succubus.color }]}>
            <Image
              source={pixelSprites.succubus[succubus.stage]}
              style={styles.mapSpriteImage}
              contentFit="contain"
            />
          </View>
          <View style={[styles.mapPlayer, phase !== "explore" && styles.mapPlayerStopped]}>
            <Image source={pixelSprites.player} style={styles.mapSpriteImage} contentFit="contain" />
          </View>
          {phase === "battle" ? (
            <View style={styles.mapCommandPanel}>
              <AppText style={styles.commandTitle}>COMMAND</AppText>
              <Pressable style={styles.commandLine} onPress={() => resolveCommand("resist")}>
                <AppText style={styles.commandText}>Attack</AppText>
              </Pressable>
              <Pressable style={styles.commandLine} onPress={() => resolveCommand("focus")}>
                <AppText style={styles.commandText}>Spells</AppText>
              </Pressable>
              <Pressable style={styles.commandLine} onPress={() => resolveCommand("run")}>
                <AppText style={styles.commandText}>Defend</AppText>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.mapStatusPanel}>
            <View style={styles.mapStatusFace} />
            <View style={styles.mapStatusTextBox}>
              <AppText style={styles.mapStatusName}>YOU</AppText>
              <AppText style={styles.mapStatusLine}>♥ {battle.hp}　MP {battle.mp}</AppText>
            </View>
            <View style={styles.mapStatusFace} />
            <View style={styles.mapStatusTextBox}>
              <AppText style={[styles.mapStatusName, { color: succubus.color }]}>NINO</AppText>
              <AppText style={styles.mapStatusLine}>Lv.{succubus.level}</AppText>
            </View>
          </View>
        </View>

        <Card style={styles.statusCard}>
          <View style={styles.rowBetween}>
            <View>
              <AppText variant="label">あなたのレベル</AppText>
              <AppText style={styles.level}>Lv.{level}</AppText>
              <AppText variant="muted">一日+10 / 最大90</AppText>
            </View>
            <View style={styles.enemyBox}>
              <AppText style={[styles.enemyTitle, { color: succubus.color }]}>
                {succubus.title}
              </AppText>
              <AppText style={styles.enemyLevel}>Lv.{succubus.level}</AppText>
            </View>
          </View>
          <AppText style={styles.enemyMessage}>{succubus.message}</AppText>
        </Card>

        <Card>
          <View style={styles.rowBetween}>
            <AppText variant="subtitle">館の外</AppText>
            <AppText style={styles.phase}>{phase.toUpperCase()}</AppText>
          </View>
          {charmTurns > 0 ? (
            <AppText style={styles.charmText}>CHARM：逃亡失敗 あと{charmTurns}ターン</AppText>
          ) : null}
          <AppText style={styles.message}>{message}</AppText>
        </Card>

        {phase === "battle" ? (
          <Card style={styles.battleCard}>
            <Gauge label="HP" value={battle.hp} color="#7cb342" />
            <Gauge label="MP" value={battle.mp} color="#29b6f6" />
            <Gauge label="欲望" value={battle.desire} color="#ff69b4" />
            <Gauge label="服従" value={battle.obedience} color="#d9202a" />
            <Gauge label="サキュバス集中" value={battle.enemyFocus} color={succubus.color} />
            <AppText style={styles.battleHelp}>
              マップ左下のCOMMANDから行動を選択してください。
            </AppText>
          </Card>
        ) : (
          <Card>
            <AppText variant="subtitle">マップ操作</AppText>
            <View style={styles.commands}>
              <PrimaryButton title="上へ進む（サキュバスに近づく）" onPress={startEncounter} />
              <PrimaryButton
                title="ドアへ戻る"
                tone="secondary"
                onPress={() => router.replace("/(tabs)/nino-room")}
              />
            </View>
          </Card>
        )}

        {phase === "talk" ? (
          <Card style={styles.temptationCard}>
            <AppText variant="subtitle">誘惑カード</AppText>
            <View style={styles.commands}>
              <PrimaryButton title="誘惑に耐える" tone="contract" onPress={resistTemptation} />
              <PrimaryButton title="誘惑に負ける" onPress={surrenderToTemptation} />
              <PrimaryButton title="諦めて逃亡する" tone="secondary" onPress={giveUpAndRun} />
            </View>
          </Card>
        ) : null}
        {phase === "result" ? (
          <PrimaryButton title="もう一度外を歩く" tone="contract" onPress={resetBattle} />
        ) : null}
        <PrimaryButton
          title="二ノ様の控室へ戻る"
          tone="secondary"
          onPress={() => router.replace("/(tabs)/nino-room")}
        />
        <PrimaryButton
          title="ホームへ戻る"
          tone="secondary"
          onPress={() => router.replace("/(tabs)")}
        />
      </View>
    </View>
  );
}

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.gaugeRow}>
      <View style={styles.gaugeHeader}>
        <AppText style={styles.gaugeLabel}>{label}</AppText>
        <AppText style={styles.gaugeValue}>{Math.round(value)}</AppText>
      </View>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: `${clamp(value)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  content: { flex: 1, gap: 12, padding: 14 },
  pixelMap: {
    height: 300,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#10351c",
  },
  mapBackground: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  topMoveZone: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  topMoveText: {
    position: "absolute",
    top: 10,
    right: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.56)",
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  door: {
    position: "absolute",
    bottom: 2,
    left: "43%",
    width: 66,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  doorSprite: { width: 76, height: 76 },
  mapPlayer: {
    position: "absolute",
    left: "56%",
    top: 144,
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlayerStopped: { top: 112, left: "58%" },
  mapSuccubus: {
    position: "absolute",
    left: "23%",
    top: 66,
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  mapSuccubusNear: { top: 88, left: "35%", width: 92, height: 92 },
  mapSpriteImage: { width: "100%", height: "100%" },
  mapCommandPanel: {
    position: "absolute",
    left: 8,
    bottom: 10,
    width: 130,
    borderWidth: 2,
    borderColor: "#d6f5ff",
    backgroundColor: "rgba(4, 23, 34, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 3,
  },
  commandTitle: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  commandLine: {
    minHeight: 20,
    justifyContent: "center",
    paddingLeft: 4,
  },
  commandText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  mapStatusPanel: {
    position: "absolute",
    right: 8,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mapStatusFace: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#20141b",
  },
  mapStatusTextBox: {
    width: 68,
    minHeight: 34,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "rgba(10, 12, 18, 0.88)",
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  mapStatusName: { color: "#fff", fontSize: 8, fontWeight: "900" },
  mapStatusLine: { color: "#fff", fontSize: 8, fontWeight: "900" },
  kicker: {
    color: "#ff69b4",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
  },
  statusCard: { borderColor: "#ff69b4" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  level: {
    color: "#fff",
    fontSize: 34,
    lineHeight: 44,
    fontWeight: "900",
  },
  enemyBox: {
    flex: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  enemyTitle: { textAlign: "right", fontSize: 13, fontWeight: "900" },
  enemyLevel: { color: "#fff", fontSize: 26, fontWeight: "900" },
  enemyMessage: { color: "#ddd", fontSize: 12, lineHeight: 19 },
  phase: { color: "#ff69b4", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  charmText: {
    color: "#ff69b4",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "900",
    marginTop: 6,
  },
  message: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "800" },
  battleCard: { borderColor: "#9b5de5" },
  battleHelp: {
    color: "#aaa",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  temptationCard: { borderColor: "#ff69b4" },
  gaugeRow: { gap: 5 },
  gaugeHeader: { flexDirection: "row", justifyContent: "space-between" },
  gaugeLabel: { color: "#fff", fontSize: 12, fontWeight: "900" },
  gaugeValue: { color: "#aaa", fontSize: 12, fontWeight: "900" },
  gaugeTrack: {
    height: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#000",
  },
  gaugeFill: { height: "100%" },
  commands: { gap: 10 },
});
