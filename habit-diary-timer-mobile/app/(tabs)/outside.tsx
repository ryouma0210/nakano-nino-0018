import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppAudio } from "@/audio/AudioProvider";
import { execute, queryOne } from "@/database/client";
import { pointRepository } from "@/repositories/rewardRepository";
import { toDateKey, toDateTimeKey } from "@/utils/date";

type Phase = "explore" | "battle" | "result";
type SuccubusStage = "beginner" | "middle" | "queen";
type BattleStatus = {
  hp: number;
  mp: number;
  desire: number;
  obedience: number;
  enemyFocus: number;
};
type MapStep = 0 | 1 | 2;
type MapArea = "center" | "left" | "right" | "top";
type Direction = "up" | "down" | "left" | "right";
type MapPosition = { x: number; y: number };

const levelKey = "outside_game_level";
const levelDateKey = "outside_game_level_date";
const dailyPointDateKey = "outside_game_point_date";
const dailyPointKey = "outside_game_point_today";
const succubusAbsorbDateKey = "outside_game_succubus_absorb_date";
const succubusAbsorbKey = "outside_game_succubus_absorb_today";
const startPositions: Record<MapArea, MapPosition> = {
  center: { x: 48, y: 74 },
  left: { x: 68, y: 54 },
  right: { x: 24, y: 54 },
  top: { x: 48, y: 76 },
};
const pixelSprites = {
  mapCenter: require("../../assets/characters/outside-pixels/outside-map-bg.png"),
  mapLeft: require("../../assets/characters/outside-pixels/outside-map-left.png"),
  mapRight: require("../../assets/characters/outside-pixels/outside-map-right.png"),
  mapTop: require("../../assets/characters/outside-pixels/outside-map-top.png"),
  playerFront: require("../../assets/characters/outside-pixels/player-front-dot.png"),
  playerBack: require("../../assets/characters/outside-pixels/player-back-dot.png"),
  door: require("../../assets/characters/outside-pixels/door-dot.png"),
  slime: require("../../assets/characters/outside-pixels/slime-dot.png"),
  succubusSide: require("../../assets/characters/outside-pixels/succubus-side-dot.png"),
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
    savedDate === today ? savedLevel : Math.min(100, Math.max(0, savedLevel) + 10);
  if (savedDate !== today) {
    saveSetting(levelKey, String(level));
    saveSetting(levelDateKey, today);
  }
  return level;
}

function initializeDailyOutsidePoints() {
  const today = toDateKey();
  const savedDate = readSetting(dailyPointDateKey);
  if (savedDate !== today) {
    saveSetting(dailyPointDateKey, today);
    saveSetting(dailyPointKey, "0");
    return 0;
  }
  return Math.max(0, Math.min(100, Number(readSetting(dailyPointKey) ?? 0)));
}

function initializeSuccubusAbsorbBonus() {
  const today = toDateKey();
  const savedDate = readSetting(succubusAbsorbDateKey);
  if (savedDate !== today) {
    saveSetting(succubusAbsorbDateKey, today);
    saveSetting(succubusAbsorbKey, "0");
    return 0;
  }
  return Math.max(0, Math.min(100, Number(readSetting(succubusAbsorbKey) ?? 0)));
}

function succubusForLevel(level: number, absorbBonus: number) {
  if (level <= 10) {
    return {
      stage: "beginner" as const,
      title: "ニノメスガキ初級サキュバス",
      level: Math.min(100, 10 + absorbBonus),
      message: "レベル10で誘惑して、油断した相手を逆転する小悪魔。",
      color: "#ff69b4",
    };
  }
  if (level < 70) {
    return {
      stage: "middle" as const,
      title: "上級サキュバス",
      level: Math.min(100, level + absorbBonus),
      message: "同じレベルで現れて、駆け引きと選択肢で揺さぶってくる。",
      color: "#9b5de5",
    };
  }
  return {
    stage: "queen" as const,
    title: "女王サキュバス",
    level: Math.min(100, level + 20 + absorbBonus),
    message: "こちらより20レベル上の圧で、帰宅意思をねじ伏せにくる。",
    color: "#d9202a",
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default function OutsideScreen() {
  const { stopEffect, setBgmMode } = useAppAudio();
  const [level, setLevel] = useState(initializeLevel);
  const [dailyOutsidePoints, setDailyOutsidePoints] = useState(initializeDailyOutsidePoints);
  const [succubusAbsorbBonus, setSuccubusAbsorbBonus] = useState(initializeSuccubusAbsorbBonus);
  const [phase, setPhase] = useState<Phase>("explore");
  const [mapArea, setMapArea] = useState<MapArea>("center");
  const [mapStep, setMapStep] = useState<MapStep>(0);
  const [mapPosition, setMapPosition] = useState<MapPosition>(startPositions.center);
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

  const succubus = useMemo(
    () => succubusForLevel(level, succubusAbsorbBonus),
    [level, succubusAbsorbBonus],
  );
  const mapSource =
    mapArea === "left"
      ? pixelSprites.mapLeft
      : mapArea === "right"
        ? pixelSprites.mapRight
        : mapArea === "top"
          ? pixelSprites.mapTop
          : pixelSprites.mapCenter;

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
    setBgmMode("default");
    stopEffect("trainingStart");
    return () => {
      stopEffect("trainingStart");
      setBgmMode("default");
    };
  }, [charmTurns, phase, setBgmMode, stopEffect]);

  function startEncounter(openingMessage?: string, initialCharmTurns = 0) {
    setPhase("battle");
    setMapArea("center");
    setMapStep(2);
    setCharmTurns(initialCharmTurns);
    setBattle({
      hp: 100,
      mp: 50,
      desire: 10,
      obedience: 0,
      enemyFocus: 100,
    });
    setMessage(`${openingMessage ?? "サキュバスがこちらに近づいてきた。"}\n${battleLines[succubus.stage].appear}`);
  }

  function advanceMap() {
    if (phase !== "explore" || mapArea !== "center") return;
    moveMap("top");
  }

  function moveMap(nextArea: MapArea) {
    if (phase !== "explore") return;
    setMapArea(nextArea);
    setMapStep(0);
    setMapPosition(startPositions[nextArea]);
    if (nextArea === "left") {
      setMessage("左の道を進むと、静かな浄化の水辺に出た。ここなら体勢を立て直せそうだ。");
    } else if (nextArea === "right") {
      setMessage("右の道を進むと、スライムが跳ねる草原に出た。剣を構えれば倒せそうだ。");
    } else if (nextArea === "top") {
      setMessage("薄いピンクの霧がかかった一本道の森に入った。木陰から甘い気配がする。");
    } else {
      setMessage("十字路へ戻った。上にはサキュバス、下には館、左右には別の道が続いている。");
    }
  }

  function movePlayer(direction: Direction) {
    if (phase !== "explore" || mapStep > 0) return;
    const step = 7;
    const next = { ...mapPosition };
    if (direction === "up") next.y -= step;
    if (direction === "down") next.y += step;
    if (direction === "left") next.x -= step;
    if (direction === "right") next.x += step;

    if (mapArea === "center") {
      if (next.y <= 18) {
        moveMap("top");
        return;
      }
      if (next.y >= 88) {
        router.replace("/(tabs)/nino-room");
        return;
      }
      if (next.x <= 14) {
        moveMap("left");
        return;
      }
      if (next.x >= 82) {
        moveMap("right");
        return;
      }
    }

    if (mapArea === "left" && next.x >= 86) {
      moveMap("center");
      return;
    }
    if (mapArea === "right" && next.x <= 14) {
      moveMap("center");
      return;
    }
    if (mapArea === "top") {
      if (next.y >= 88) {
        moveMap("center");
        return;
      }
      if (next.y <= 52) {
        exploreTopArea();
        return;
      }
    }

    setMapPosition({
      x: Math.max(8, Math.min(88, next.x)),
      y: Math.max(12, Math.min(88, next.y)),
    });
  }

  function exploreTopArea() {
    if (phase !== "explore" || mapArea !== "top") return;
    setMapStep(1);
    setMessage("！\n木の物陰にいたサキュバスに呼び止められた。どう返す？");
  }

  function chooseEncounter(choice: "resist" | "listen" | "run") {
    if (phase !== "explore" || mapArea !== "top" || mapStep === 0) return;
    if (choice === "run") {
      setMapArea("center");
      setMapStep(0);
      setMapPosition(startPositions.center);
      setMessage("咄嗟に身を引いて、十字路まで戻った。まだ甘い声が耳に残っている。");
      return;
    }
    if (choice === "listen") {
      startEncounter("少しだけ声を聞いてしまった。胸の奥が甘く揺れる。", 1);
      return;
    }
    startEncounter("呼び止める声を振り払い、戦闘態勢に入った。");
  }

  function exploreLeftArea() {
    if (phase !== "explore" || mapArea !== "left") return;
    setMapStep(0);
    setCharmTurns(0);
    setBattle((current) => ({
      ...current,
      hp: 100,
      mp: 50,
      desire: 0,
      obedience: 0,
    }));
    setMessage("浄化の水辺に触れた。HPとMPが回復し、魅了の気配も薄れていく。");
  }

  function exploreRightArea() {
    if (phase !== "explore" || mapArea !== "right") return;
    if (dailyOutsidePoints >= 100) {
      setMessage("今日はもうスライム狩りで100pt獲得済み。これ以上は明日のお楽しみ。");
      return;
    }
    const today = toDateKey();
    const gained = Math.min(10, 100 - dailyOutsidePoints);
    const nextDailyPoints = dailyOutsidePoints + gained;
    const nextLevel = Math.min(100, level + 1);
    pointRepository.award(
      `outside-slime:${today}:${nextDailyPoints}`,
      gained,
      "外RPGでスライムを倒した",
    );
    setDailyOutsidePoints(nextDailyPoints);
    saveSetting(dailyPointDateKey, today);
    saveSetting(dailyPointKey, String(nextDailyPoints));
    setLevel(nextLevel);
    saveSetting(levelKey, String(nextLevel));
    saveSetting(levelDateKey, today);
    setMessage(
      `右の草原でスライムを倒した。\n+${gained}pt / Lv.${nextLevel}\n本日の外RPG獲得：${nextDailyPoints}/100pt`,
    );
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
      const today = toDateKey();
      const drained = Math.min(10, Math.max(0, level - 1));
      const nextLevel = Math.max(1, level - drained);
      const nextAbsorbBonus = Math.min(100, succubusAbsorbBonus + drained);
      setLevel(nextLevel);
      setSuccubusAbsorbBonus(nextAbsorbBonus);
      saveSetting(levelKey, String(nextLevel));
      saveSetting(levelDateKey, today);
      saveSetting(succubusAbsorbDateKey, today);
      saveSetting(succubusAbsorbKey, String(nextAbsorbBonus));
      setPhase("result");
      setBattle(next);
      setMessage(`${battleLines[succubus.stage].lose}\nLv.${drained}吸われた。現在 Lv.${nextLevel}`);
      return;
    }
    setBattle(next);
  }

  function resetBattle() {
    setPhase("explore");
    setMapArea("center");
    setMapStep(0);
    setMapPosition(startPositions.center);
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

  if (phase === "battle" || phase === "result") {
    return (
      <View style={styles.root}>
        <View style={styles.battleScreen}>
          <View style={styles.battleHeader}>
            <AppText style={styles.kicker}>SUCCUBUS BATTLE</AppText>
            <AppText style={styles.battleTitle}>{succubus.title}</AppText>
          </View>

          <View style={styles.battleStage}>
            <View style={styles.enemyLarge}>
              <Image
                source={pixelSprites.succubus[succubus.stage]}
                style={styles.enemyLargeImage}
                contentFit="contain"
              />
              <AppText style={[styles.enemyLargeName, { color: succubus.color }]}>
                {succubus.title} Lv.{succubus.level}
              </AppText>
            </View>
            <View style={styles.playerLarge}>
              <Image source={pixelSprites.playerBack} style={styles.playerLargeImage} contentFit="contain" />
              <AppText style={styles.playerLargeName}>YOU Lv.{level}</AppText>
            </View>
          </View>

          <View style={styles.battleMessageBox}>
            <View style={styles.rowBetween}>
              <AppText style={styles.battleMessageName}>二ノサキュバス</AppText>
              <AppText style={styles.phase}>{phase.toUpperCase()}</AppText>
            </View>
            {charmTurns > 0 ? (
              <AppText style={styles.charmText}>CHARM：逃亡失敗 あと{charmTurns}ターン</AppText>
            ) : null}
            <AppText style={styles.message}>{message}</AppText>
          </View>

          <View style={styles.battlePanel}>
            <Gauge label="HP" value={battle.hp} color="#7cb342" />
            <Gauge label="MP" value={battle.mp} color="#29b6f6" />
            <Gauge label="欲望" value={battle.desire} color="#ff69b4" />
            <Gauge label="服従" value={battle.obedience} color="#d9202a" />
            <Gauge label="サキュバス集中" value={battle.enemyFocus} color={succubus.color} />
          </View>

          {phase === "battle" ? (
            <View style={styles.battleCommands}>
              <PrimaryButton title="誘惑に耐える" onPress={() => resolveCommand("resist")} />
              <PrimaryButton title="精神集中" tone="order" onPress={() => resolveCommand("focus")} />
              <PrimaryButton title="逃げる" tone="secondary" onPress={() => resolveCommand("run")} />
            </View>
          ) : (
            <View style={styles.battleCommands}>
              <PrimaryButton title="マップへ戻る" tone="contract" onPress={resetBattle} />
              <PrimaryButton
                title="二ノ様の控室へ戻る"
                tone="secondary"
                onPress={() => router.replace("/(tabs)/nino-room")}
              />
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.mapScreen}>
        <View style={styles.fullMap}>
          <Image source={mapSource} style={styles.mapBackground} contentFit="cover" />
          {mapArea === "center" ? (
            <>
              <Pressable style={styles.mapLeftTap} onPress={() => moveMap("left")} />
              <Pressable style={styles.mapRightTap} onPress={() => moveMap("right")} />
              <Pressable style={styles.mapForwardTap} onPress={advanceMap} />
              <Pressable style={styles.mapDoorTap} onPress={() => router.replace("/(tabs)/nino-room")} />
              <View style={[styles.mapSuccubus, mapStep > 0 && styles.mapSuccubusNear, { borderColor: succubus.color }]}>
                <Image
                  source={pixelSprites.succubus[succubus.stage]}
                  style={styles.mapSpriteImage}
                  contentFit="contain"
                />
              </View>
            </>
          ) : mapArea === "left" ? (
            <>
              <Pressable style={styles.mapLeftAreaActionTap} onPress={exploreLeftArea} />
              <Pressable style={styles.mapBackFromLeftTap} onPress={() => moveMap("center")} />
            </>
          ) : mapArea === "right" ? (
            <>
              <Pressable style={styles.mapRightAreaActionTap} onPress={exploreRightArea} />
              <Pressable style={styles.mapBackFromRightTap} onPress={() => moveMap("center")} />
              <View style={styles.mapSlime}>
                <Image source={pixelSprites.slime} style={styles.mapSpriteImage} contentFit="contain" />
              </View>
            </>
          ) : (
            <>
              <Pressable style={styles.mapTopAreaActionTap} onPress={exploreTopArea} />
              <Pressable style={styles.mapBackFromTopTap} onPress={() => moveMap("center")} />
              <View style={styles.mapSuccubusSide}>
                <Image source={pixelSprites.succubusSide} style={styles.mapSpriteImage} contentFit="contain" />
              </View>
              {mapStep > 0 ? (
                <View style={styles.exclamation}>
                  <AppText style={styles.exclamationText}>!</AppText>
                </View>
              ) : null}
              {mapStep > 0 ? (
                <View style={styles.mapChoiceBox}>
                  <AppText style={styles.mapChoiceTitle}>サキュバスに呼び止められた</AppText>
                  <Pressable style={styles.mapChoiceButton} onPress={() => chooseEncounter("resist")}>
                    <AppText style={styles.mapChoiceText}>誘惑に耐える</AppText>
                  </Pressable>
                  <Pressable style={[styles.mapChoiceButton, styles.mapChoiceSelected]} onPress={() => chooseEncounter("listen")}>
                    <AppText style={styles.mapChoiceText}>少し話を聞く</AppText>
                  </Pressable>
                  <Pressable style={styles.mapChoiceButton} onPress={() => chooseEncounter("run")}>
                    <AppText style={styles.mapChoiceText}>すぐ逃げる</AppText>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
          <View style={[
            styles.mapPlayer,
            mapArea === "left" && styles.mapPlayerLeftArea,
            mapArea === "right" && styles.mapPlayerRightArea,
            mapArea === "top" && mapStep > 0 && styles.mapPlayerTopEncounter,
            mapStep === 0 && { left: `${mapPosition.x}%`, top: `${mapPosition.y}%` },
          ]}>
            <Image
              source={mapArea === "top" || (mapArea === "center" && mapStep > 0)
                ? pixelSprites.playerBack
                : pixelSprites.playerFront}
              style={styles.mapSpriteImage}
              contentFit="contain"
            />
          </View>

          <View style={styles.mapHint}>
            <AppText style={styles.mapHintTitle}>OUTSIDE RPG</AppText>
            <AppText style={styles.mapHintText}>
              {mapArea === "center"
                ? "上：誘惑の森 / 左右：別マップへ移動 / 下：館へ戻る"
                : mapArea === "left"
                  ? "水辺：回復 / 右端：十字路へ戻る"
                  : mapArea === "right"
                    ? "スライム：討伐 / 左端：十字路へ戻る"
                    : "真ん中：森を進む / 下端：十字路へ戻る"}
            </AppText>
          </View>

          <View style={styles.mapMessageBox}>
            <AppText style={styles.mapMessage}>{message}</AppText>
          </View>
        </View>
        <View style={styles.dpad}>
          <Pressable style={[styles.dpadButton, styles.dpadUp]} onPress={() => movePlayer("up")}>
            <AppText style={styles.dpadText}>⌃</AppText>
          </Pressable>
          <Pressable style={[styles.dpadButton, styles.dpadLeft]} onPress={() => movePlayer("left")}>
            <AppText style={styles.dpadText}>‹</AppText>
          </Pressable>
          <Pressable style={[styles.dpadButton, styles.dpadRight]} onPress={() => movePlayer("right")}>
            <AppText style={styles.dpadText}>›</AppText>
          </Pressable>
          <Pressable style={[styles.dpadButton, styles.dpadDown]} onPress={() => movePlayer("down")}>
            <AppText style={styles.dpadText}>⌄</AppText>
          </Pressable>
        </View>
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
  mapScreen: {
    flex: 1,
    padding: 10,
    justifyContent: "center",
    backgroundColor: "#050505",
  },
  dpad: {
    position: "absolute",
    top: 18,
    left: 18,
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(0, 0, 0, 0.12)",
  },
  dpadButton: {
    position: "absolute",
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  dpadUp: {
    top: 8,
    left: 52,
  },
  dpadLeft: {
    top: 52,
    left: 8,
  },
  dpadRight: {
    top: 52,
    right: 8,
  },
  dpadDown: {
    bottom: 8,
    left: 52,
  },
  dpadText: {
    color: "#fff",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
  },
  fullMap: {
    width: "100%",
    aspectRatio: 1,
    maxHeight: "100%",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#000",
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
  mapForwardTap: {
    position: "absolute",
    top: 0,
    left: "35%",
    right: "35%",
    height: "46%",
    backgroundColor: "transparent",
  },
  mapLeftTap: {
    position: "absolute",
    top: "30%",
    bottom: "26%",
    left: 0,
    width: "36%",
    backgroundColor: "transparent",
  },
  mapRightTap: {
    position: "absolute",
    top: "30%",
    right: 0,
    bottom: "26%",
    width: "36%",
    backgroundColor: "transparent",
  },
  mapLeftAreaActionTap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "72%",
    backgroundColor: "transparent",
  },
  mapRightAreaActionTap: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "72%",
    backgroundColor: "transparent",
  },
  mapBackFromLeftTap: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "28%",
    backgroundColor: "transparent",
  },
  mapBackFromRightTap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "28%",
    backgroundColor: "transparent",
  },
  mapTopAreaActionTap: {
    position: "absolute",
    top: "16%",
    right: "18%",
    bottom: "24%",
    left: "18%",
    backgroundColor: "transparent",
  },
  mapBackFromTopTap: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: "22%",
    backgroundColor: "transparent",
  },
  mapDoorTap: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: "24%",
    backgroundColor: "transparent",
  },
  mapPlayer: {
    position: "absolute",
    left: "47%",
    top: "74%",
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlayerWalking: {
    top: "50%",
    left: "48%",
  },
  mapPlayerLeftArea: {
    top: "58%",
    left: "38%",
  },
  mapPlayerRightArea: {
    top: "58%",
    left: "40%",
  },
  mapPlayerTopArea: {
    top: "71%",
    left: "47%",
  },
  mapPlayerTopEncounter: {
    top: "47%",
    left: "47%",
  },
  mapSuccubus: {
    position: "absolute",
    left: "56%",
    top: "42%",
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  mapSuccubusNear: {
    top: "44%",
    left: "55%",
    width: 58,
    height: 58,
  },
  mapSlime: {
    position: "absolute",
    left: "76%",
    top: "43%",
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  mapSuccubusSide: {
    position: "absolute",
    left: "67%",
    top: "43%",
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  exclamation: {
    position: "absolute",
    left: "61%",
    top: "39%",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#d9202a",
  },
  exclamationText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 20,
  },
  mapChoiceBox: {
    position: "absolute",
    right: 18,
    bottom: 18,
    left: 18,
    gap: 6,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    padding: 10,
  },
  mapChoiceTitle: {
    color: "#ff69b4",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "900",
    marginBottom: 2,
  },
  mapChoiceButton: {
    borderWidth: 1,
    borderColor: "#777",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  mapChoiceSelected: {
    borderColor: "#a7fff1",
    backgroundColor: "rgba(108, 180, 165, 0.45)",
  },
  mapChoiceText: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  mapSpriteImage: { width: "100%", height: "100%" },
  mapHint: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    borderWidth: 1,
    borderColor: "#ff69b4",
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    padding: 10,
  },
  mapHintTitle: {
    color: "#ff69b4",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 4,
  },
  mapHintText: {
    color: "#fff",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "900",
  },
  mapMessageBox: {
    position: "absolute",
    right: 12,
    bottom: 12,
    left: 12,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    padding: 14,
  },
  mapMessage: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "900",
  },
  battleScreen: {
    flex: 1,
    gap: 10,
    padding: 12,
    backgroundColor: "#050505",
  },
  kicker: {
    color: "#ff69b4",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
  },
  battleHeader: {
    gap: 4,
  },
  battleTitle: {
    color: "#fff",
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "900",
  },
  battleStage: {
    flex: 1,
    minHeight: 240,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#140914",
  },
  enemyLarge: {
    position: "absolute",
    top: 16,
    right: 12,
    left: 12,
    alignItems: "center",
  },
  enemyLargeImage: {
    width: "62%",
    height: 170,
  },
  enemyLargeName: {
    fontSize: 13,
    fontWeight: "900",
  },
  playerLarge: {
    position: "absolute",
    right: 24,
    bottom: 18,
    alignItems: "center",
  },
  playerLargeImage: {
    width: 78,
    height: 78,
  },
  playerLargeName: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },
  battleMessageBox: {
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#111",
    padding: 12,
    gap: 8,
  },
  battleMessageName: {
    color: "#ff69b4",
    fontSize: 12,
    fontWeight: "900",
  },
  battlePanel: {
    gap: 7,
    borderWidth: 1,
    borderColor: "#9b5de5",
    backgroundColor: "#111",
    padding: 10,
  },
  battleCommands: {
    gap: 8,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  phase: { color: "#ff69b4", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  charmText: {
    color: "#ff69b4",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "900",
    marginTop: 6,
  },
  message: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "800" },
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
});
