import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppAudio } from "@/audio/AudioProvider";
import { execute, queryOne } from "@/database/client";
import { pointRepository } from "@/repositories/rewardRepository";
import { toDateKey, toDateTimeKey } from "@/utils/date";

type Phase = "explore" | "battle" | "result" | "loss";
type SuccubusStage = "beginner" | "middle" | "queen";
type LossEventKind = "tail" | "chest" | "back";
type BattleCommand = "attack" | LossEventKind | "run";
type BattleStatus = {
  hp: number;
  mp: number;
  enemyHp: number;
  lastLossKind: LossEventKind;
};
type MapStep = 0 | 1 | 2;
type MapArea = "center" | "left" | "right" | "top";
type Direction = "up" | "down" | "left" | "right";
type MapPosition = { x: number; y: number };

const levelKey = "outside_game_level";
const hpKey = "outside_game_hp";
const mpKey = "outside_game_mp";
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
  mapSuccubus: {
    beginner: require("../../assets/characters/outside-pixels/succubus-beginner-dot.png"),
    middle: require("../../assets/characters/outside-pixels/succubus-middle-dot.png"),
    queen: require("../../assets/characters/outside-pixels/succubus-queen-dot.png"),
  },
  succubus: {
    beginner: require("../../assets/characters/outside-events/beginner-battle.png"),
    middle: require("../../assets/characters/outside-events/middle-battle.png"),
    queen: require("../../assets/characters/outside-events/queen-battle.png"),
  },
  events: {
    beginner: {
      tail: require("../../assets/characters/outside-events/beginner-tail.png"),
      chest: require("../../assets/characters/outside-events/beginner-chest.png"),
      back: require("../../assets/characters/outside-events/beginner-overlook.png"),
    },
    middle: {
      tail: require("../../assets/characters/outside-events/middle-tail.png"),
      chest: require("../../assets/characters/outside-events/middle-chest.png"),
      back: require("../../assets/characters/outside-events/middle-overlook.png"),
    },
    queen: {
      tail: require("../../assets/characters/outside-events/queen-tail.png"),
      chest: require("../../assets/characters/outside-events/queen-chest.png"),
      back: require("../../assets/characters/outside-events/queen-overlook.png"),
    },
  },
};

const battleLines: Record<SuccubusStage, {
  appear: string;
  attack: string;
  escape: string;
  win: string;
  lose: Record<LossEventKind, string>;
}> = {
  beginner: {
    appear: "ニノメスガキ初級サキュバスが現れました。普通に戦えば勝てるはず……油断しないでください♡",
    attack: "剣を振った。メスガキサキュバスは涙目で踏みとどまり、誘惑で反撃してきた。",
    escape: "少し距離を取れました。でも、まだ追いかけますからね♡",
    win: "誘惑を切り抜けました。今日は家に帰れそうです……悔しいです♡",
    lose: {
      tail: "尻尾の誘惑に負けた。細い尻尾が絡みつき、力が抜けていく。",
      chest: "胸元の誘惑に負けた。甘い香りで頭がぼんやりしていく。",
      back: "お尻の誘惑に負けた。見下ろす笑顔に逆らえなくなった。",
    },
  },
  middle: {
    appear: "上級サキュバスが現れた。馴れ馴れしい笑顔で、帰り道を塞いでくる。",
    attack: "攻撃が入った。上級サキュバスは笑いながら距離を詰め、誘惑で反撃してきた。",
    escape: "距離を取った。けど、甘い声がまだ背中にまとわりついている。",
    win: "誘惑を切り抜けた。中級サキュバスが少し寂しそうに笑った。",
    lose: {
      tail: "尻尾の誘惑に負けた。絡め取られた瞬間、抵抗する力がほどけていく。",
      chest: "胸元の誘惑に負けた。近すぎる距離に、思考が甘く溶けていく。",
      back: "お尻の誘惑に負けた。逃げ道を塞がれ、完全にペースを奪われた。",
    },
  },
  queen: {
    appear: "女王サキュバスが現れた。圧倒的な気配で、帰宅意思を踏み潰しにくる。",
    attack: "攻撃した。女王は退屈そうに受け流し、格の違う誘惑で反撃してきた。",
    escape: "距離を取った。けど女王は椅子から動かず、ただ笑っている。",
    win: "誘惑を切り抜けた。女王は退屈そうに、次を楽しみにしている。",
    lose: {
      tail: "女王の尻尾の誘惑に負けた。抗う前に、主導権ごと奪われた。",
      chest: "女王の胸元の誘惑に負けた。呼吸すら彼女のリズムに支配された。",
      back: "女王のお尻の誘惑に負けた。見下ろされるだけで、敗北を理解した。",
    },
  },
};

const enemyAttackDamage: Record<SuccubusStage, number> = {
  beginner: 10,
  middle: 20,
  queen: 50,
};

const lossLabels: Record<LossEventKind, string> = {
  tail: "尻尾",
  chest: "おっぱい",
  back: "お尻",
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

function initializePlayerStat(key: string, fallback: number) {
  const value = Number(readSetting(key) ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    saveSetting(key, String(fallback));
    return fallback;
  }
  return Math.max(1, Math.min(100, value));
}

function succubusForLevel(level: number, absorbBonus: number) {
  if (level < 30) {
    return {
      stage: "beginner" as const,
      title: "ニノメスガキ初級サキュバス",
      level: Math.min(30, Math.max(1, level + absorbBonus)),
      message: "Lv.1〜30。油断した相手を逆転する小悪魔。",
      color: "#ff69b4",
    };
  }
  if (level < 80) {
    return {
      stage: "middle" as const,
      title: "上級サキュバス",
      level: Math.min(79, Math.max(30, level + absorbBonus)),
      message: "Lv.30〜79。駆け引きと選択肢で揺さぶってくる。",
      color: "#9b5de5",
    };
  }
  return {
    stage: "queen" as const,
    title: "女王サキュバス",
    level: Math.max(80, Math.min(180, level + absorbBonus)),
    message: "Lv.80〜。圧倒的な格で、帰宅意思をねじ伏せにくる。",
    color: "#d9202a",
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function randomSlimePosition(): MapPosition {
  return {
    x: 58 + Math.random() * 24,
    y: 32 + Math.random() * 34,
  };
}

function isNear(a: MapPosition, b: MapPosition, range = 8) {
  return Math.abs(a.x - b.x) <= range && Math.abs(a.y - b.y) <= range;
}

export default function OutsideScreen() {
  const { stopEffect, setBgmMode } = useAppAudio();
  const [level, setLevel] = useState(initializeLevel);
  const [playerHp, setPlayerHp] = useState(() => initializePlayerStat(hpKey, 100));
  const [playerMp, setPlayerMp] = useState(() => initializePlayerStat(mpKey, 100));
  const [dailyOutsidePoints, setDailyOutsidePoints] = useState(initializeDailyOutsidePoints);
  const [succubusAbsorbBonus, setSuccubusAbsorbBonus] = useState(initializeSuccubusAbsorbBonus);
  const [phase, setPhase] = useState<Phase>("explore");
  const [mapArea, setMapArea] = useState<MapArea>("center");
  const [mapStep, setMapStep] = useState<MapStep>(0);
  const [mapPosition, setMapPosition] = useState<MapPosition>(startPositions.center);
  const [slimePosition, setSlimePosition] = useState<MapPosition>(() => randomSlimePosition());
  const [slimeVisible, setSlimeVisible] = useState(true);
  const [charmTurns, setCharmTurns] = useState(0);
  const [message, setMessage] = useState(
    "館の外へ出た。家に帰るには、外にいるサキュバスの誘惑を切り抜ける必要がある。",
  );
  const [lossEventIndex, setLossEventIndex] = useState(0);
  const [battle, setBattle] = useState<BattleStatus>({
    hp: playerHp,
    mp: playerMp,
    enemyHp: 100,
    lastLossKind: "tail",
  });

  const succubus = useMemo(
    () => succubusForLevel(level, succubusAbsorbBonus),
    [level, succubusAbsorbBonus],
  );
  const lossEventImages = useMemo(() => {
    const events = pixelSprites.events[succubus.stage];
    const first = events[battle.lastLossKind];
    const rest: LossEventKind[] = ["tail", "chest", "back"].filter(
      (kind): kind is LossEventKind => kind !== battle.lastLossKind,
    );
    return [first, events[rest[0]], events[rest[1]]];
  }, [battle.lastLossKind, succubus.stage]);
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
    if (phase === "battle" || phase === "loss") {
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

  useEffect(() => {
    if (phase !== "loss") return;
    const id = setInterval(() => {
      setLossEventIndex((current) => (current + 1) % 3);
    }, 1400);
    return () => clearInterval(id);
  }, [phase]);

  function startEncounter(openingMessage?: string, initialCharmTurns = 0) {
    setPhase("battle");
    setMapArea("center");
    setMapStep(2);
    setCharmTurns(initialCharmTurns);
    setBattle({
      hp: playerHp,
      mp: playerMp,
      enemyHp: 100,
      lastLossKind: "tail",
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
      if (dailyOutsidePoints < 100) {
        setSlimePosition(randomSlimePosition());
        setSlimeVisible(true);
      }
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
        router.replace("/(tabs)");
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
      startEncounter("少しだけ声を聞いてしまった。胸の奥が甘く揺れる。", 3);
      return;
    }
    startEncounter("呼び止める声を振り払い、戦闘態勢に入った。");
  }

  function exploreLeftArea() {
    if (phase !== "explore" || mapArea !== "left") return;
    setMapStep(0);
    setCharmTurns(0);
    setPlayerHp(100);
    setPlayerMp(100);
    saveSetting(hpKey, "100");
    saveSetting(mpKey, "100");
    setBattle((current) => ({
      ...current,
      hp: 100,
      mp: 100,
    }));
    setMessage("浄化の水辺に触れた。HPとMPが回復し、魅了の気配も薄れていく。");
  }

  const defeatSlime = useCallback(() => {
    if (phase !== "explore" || mapArea !== "right") return;
    if (dailyOutsidePoints >= 100) {
      setMessage("今日はもうスライム狩りで100pt獲得済み。これ以上は明日のお楽しみ。");
      setSlimeVisible(false);
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
    setSlimeVisible(false);
    setMessage(
      `スライムに接触して討伐した。\n+${gained}pt / Lv.${nextLevel}\n本日の外RPG獲得：${nextDailyPoints}/100pt`,
    );
    if (nextDailyPoints < 100) {
      setTimeout(() => {
        setSlimePosition(randomSlimePosition());
        setSlimeVisible(true);
      }, 900);
    }
  }, [dailyOutsidePoints, level, mapArea, phase]);

  useEffect(() => {
    if (phase !== "explore" || mapArea !== "right" || !slimeVisible || dailyOutsidePoints >= 100) return;
    const id = setInterval(() => {
      setSlimePosition((current) => ({
        x: Math.max(54, Math.min(86, current.x + (Math.random() - 0.5) * 9)),
        y: Math.max(24, Math.min(78, current.y + (Math.random() - 0.5) * 9)),
      }));
    }, 850);
    return () => clearInterval(id);
  }, [dailyOutsidePoints, mapArea, phase, slimeVisible]);

  useEffect(() => {
    if (phase !== "explore" || mapArea !== "right" || !slimeVisible) return;
    if (!isNear(mapPosition, slimePosition)) return;
    defeatSlime();
  }, [defeatSlime, mapArea, mapPosition, phase, slimePosition, slimeVisible]);

  function savePlayerStats(nextLevel: number, nextHp: number, nextMp: number) {
    const today = toDateKey();
    setLevel(nextLevel);
    setPlayerHp(nextHp);
    setPlayerMp(nextMp);
    saveSetting(levelKey, String(nextLevel));
    saveSetting(levelDateKey, today);
    saveSetting(hpKey, String(nextHp));
    saveSetting(mpKey, String(nextMp));
  }

  function applyGameOver(kind: LossEventKind, reason: string) {
    const today = toDateKey();
    const absorbedLevel = Math.max(0, level - 1);
    const nextAbsorbBonus = Math.min(180, succubusAbsorbBonus + absorbedLevel);
    setLossEventIndex(0);
    setPhase("loss");
    setCharmTurns(0);
    setBattle((current) => ({ ...current, hp: 0, mp: Math.max(0, current.mp - 100), lastLossKind: kind }));
    setSuccubusAbsorbBonus(nextAbsorbBonus);
    saveSetting(succubusAbsorbDateKey, today);
    saveSetting(succubusAbsorbKey, String(nextAbsorbBonus));
    pointRepository.award(
      `outside-gameover:${toDateTimeKey()}`,
      -50,
      "外RPGでサキュバスにポイントを吸収された",
    );
    savePlayerStats(1, 1, 1);
    setMessage(
      `${reason}\n射精を1回奪われた。\nLv.${absorbedLevel} / MP100 / Pt50を吸収された。\n現在：Lv.1 / HP1 / MP1`,
    );
  }

  function randomLossKind(): LossEventKind {
    const events: LossEventKind[] = ["tail", "chest", "back"];
    return events[Math.floor(Math.random() * events.length)] ?? "tail";
  }

  function resolveCommand(command: BattleCommand) {
    if (phase !== "battle") return;
    if (command === "run") {
      if (charmTurns > 0) {
        setCharmTurns((current) => Math.max(0, current - 1));
        setMessage(`魅了モード中で逃げられない。\nあと${Math.max(0, charmTurns - 1)}ターン、足が言うことを聞かない。`);
        return;
      }
      setPhase("explore");
      setMapArea("center");
      setMapStep(0);
      setMapPosition(startPositions.center);
      setMessage(battleLines[succubus.stage].escape);
      return;
    }

    if (command !== "attack") {
      applyGameOver(command, battleLines[succubus.stage].lose[command]);
      return;
    }

    const attackDamage = Math.max(18, 34 - Math.max(0, succubus.level - level) * 0.25);
    const nextEnemyHp = clamp(battle.enemyHp - attackDamage);
    if (nextEnemyHp <= 0) {
      const nextBattle = { ...battle, enemyHp: 0 };
      setBattle(nextBattle);
      setPlayerHp(nextBattle.hp);
      setPlayerMp(nextBattle.mp);
      saveSetting(hpKey, String(nextBattle.hp));
      saveSetting(mpKey, String(nextBattle.mp));
      setPhase("result");
      setMessage(battleLines[succubus.stage].win);
      return;
    }

    const enemyKind = randomLossKind();
    const damage = enemyAttackDamage[succubus.stage];
    const nextHp = clamp(battle.hp - damage);
    const nextMp = clamp(battle.mp - 6);
    setBattle({ ...battle, hp: nextHp, mp: nextMp, enemyHp: nextEnemyHp, lastLossKind: enemyKind });
    setPlayerHp(Math.max(1, nextHp));
    setPlayerMp(Math.max(1, nextMp));
    saveSetting(hpKey, String(Math.max(1, nextHp)));
    saveSetting(mpKey, String(Math.max(1, nextMp)));
    setCharmTurns((current) => Math.max(0, current - 1));

    if (nextHp <= 0) {
      applyGameOver(enemyKind, battleLines[succubus.stage].lose[enemyKind]);
      return;
    }

    setMessage(
      `${battleLines[succubus.stage].attack}\n${lossLabels[enemyKind]}の誘惑攻撃：-${damage}HP`,
    );
  }

  function resetBattle() {
    setPhase("explore");
    setMapArea("center");
    setMapStep(0);
    setMapPosition(startPositions.center);
    setCharmTurns(0);
    setMessage("もう一度、帰り道を探す。油断しないように進もう。");
    setBattle({
      hp: playerHp,
      mp: playerMp,
      enemyHp: 100,
      lastLossKind: "tail",
    });
  }

  if (phase === "battle" || phase === "result" || phase === "loss") {
    return (
      <View style={styles.root}>
        <View style={styles.battleScreen}>
          <View style={styles.battleHeader}>
            <AppText style={styles.kicker}>
              {phase === "loss" ? "GAME OVER" : "SUCCUBUS BATTLE"}
            </AppText>
            <AppText style={[styles.battleTitle, phase === "loss" && styles.gameOverTitle]}>
              {phase === "loss" ? "誘惑に敗北しました" : succubus.title}
            </AppText>
          </View>

          <View style={styles.battleStage}>
            {phase === "loss" ? (
              <View style={styles.lossStage}>
                {lossEventImages.map((source, index) => (
                  <View
                    key={index}
                    style={[styles.lossImageCard, index === lossEventIndex && styles.lossImageActive]}
                  >
                    <Image source={source} style={styles.lossImage} contentFit="contain" />
                    <AppText style={styles.lossImageLabel}>
                      {index + 1} / 3
                    </AppText>
                  </View>
                ))}
              </View>
            ) : (
              <>
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
              </>
            )}
          </View>

          <View style={styles.battleMessageBox}>
            <View style={styles.rowBetween}>
              <AppText style={styles.battleMessageName}>二ノサキュバス</AppText>
              <AppText style={styles.phase}>{phase.toUpperCase()}</AppText>
            </View>
            {charmTurns > 0 ? (
              <AppText style={styles.charmText}>CHARM：逃亡失敗 あと{charmTurns}ターン</AppText>
            ) : null}
            <AppText style={[styles.message, phase === "loss" && styles.gameOverMessage]}>{message}</AppText>
          </View>

          <View style={styles.battlePanel}>
            <Gauge label="HP" value={battle.hp} color="#7cb342" />
            <Gauge label="MP" value={battle.mp} color="#29b6f6" />
            <Gauge label="サキュバスHP" value={battle.enemyHp} color={succubus.color} />
          </View>

          {phase === "battle" ? (
            <View style={styles.battleCommands}>
              <PrimaryButton title="攻撃する" onPress={() => resolveCommand("attack")} />
              <PrimaryButton title="尻尾でしてもらう（負けイベント）" tone="defeat" onPress={() => resolveCommand("tail")} />
              <PrimaryButton title="おっぱいでしてもらう（負けイベント）" tone="defeat" onPress={() => resolveCommand("chest")} />
              <PrimaryButton title="お尻でしてもらう（負けイベント）" tone="defeat" onPress={() => resolveCommand("back")} />
              <PrimaryButton title="逃げる" tone="secondary" onPress={() => resolveCommand("run")} />
            </View>
          ) : (
            <View style={styles.battleCommands}>
              {phase === "result" ? (
                <PrimaryButton title="マップへ戻る" tone="contract" onPress={resetBattle} />
              ) : null}
              <PrimaryButton
                title="ホーム画面へ戻る"
                tone="secondary"
                onPress={() => router.replace("/(tabs)")}
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
              <Pressable style={styles.mapDoorTap} onPress={() => router.replace("/(tabs)")} />
            </>
          ) : mapArea === "left" ? (
            <>
              <Pressable style={styles.mapLeftAreaActionTap} onPress={exploreLeftArea} />
              <Pressable style={styles.mapBackFromLeftTap} onPress={() => moveMap("center")} />
            </>
          ) : mapArea === "right" ? (
            <>
              <Pressable style={styles.mapBackFromRightTap} onPress={() => moveMap("center")} />
            </>
          ) : (
            <>
              <Pressable style={styles.mapTopAreaActionTap} onPress={exploreTopArea} />
              <Pressable style={styles.mapBackFromTopTap} onPress={() => moveMap("center")} />
              <View style={styles.mapSuccubus}>
                <Image source={pixelSprites.mapSuccubus[succubus.stage]} style={styles.mapSpriteImage} contentFit="contain" />
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
          {mapArea === "right" && slimeVisible && dailyOutsidePoints < 100 ? (
            <View style={[styles.mapSlime, { left: `${slimePosition.x}%`, top: `${slimePosition.y}%` }]}>
              <Image source={pixelSprites.slime} style={styles.mapSlimeImage} contentFit="contain" />
            </View>
          ) : null}

        </View>
        <View style={styles.outsideBottomRow}>
          <View style={styles.statusPanel}>
            <AppText style={styles.mapHintTitle}>自分のステータス</AppText>
            <AppText style={styles.statusBig}>Lv.{level}</AppText>
            <AppText style={level <= 1 || playerHp <= 1 || playerMp <= 1 ? styles.dangerStatus : styles.statusText}>
              HP {playerHp}　MP {playerMp}
            </AppText>
            <AppText style={[styles.statusText, { color: succubus.color }]}>
              {succubus.title} Lv.{succubus.level}
            </AppText>
            <AppText style={styles.statusText}>本日獲得 {dailyOutsidePoints}/100pt</AppText>
            {mapArea === "left" ? (
              <View style={styles.crystalPanel}>
                <AppText style={styles.crystalTitle}>クリスタル調整</AppText>
                <View style={styles.crystalButtons}>
                  <Pressable style={styles.crystalButton} onPress={() => {
                    const nextLevel = Math.min(100, level + 10);
                    savePlayerStats(nextLevel, playerHp, playerMp);
                    setMessage(`クリスタルで主人公Lvを調整した。\n現在 Lv.${nextLevel}`);
                  }}>
                    <AppText style={styles.crystalButtonText}>主+10</AppText>
                  </Pressable>
                  <Pressable style={styles.crystalButton} onPress={() => {
                    const nextLevel = Math.max(1, level - 10);
                    savePlayerStats(nextLevel, playerHp, playerMp);
                    setMessage(`クリスタルで主人公Lvを調整した。\n現在 Lv.${nextLevel}`);
                  }}>
                    <AppText style={styles.crystalButtonText}>主-10</AppText>
                  </Pressable>
                  <Pressable style={styles.crystalButton} onPress={() => {
                    const nextAbsorb = Math.min(180, succubusAbsorbBonus + 10);
                    setSuccubusAbsorbBonus(nextAbsorb);
                    saveSetting(succubusAbsorbKey, String(nextAbsorb));
                    saveSetting(succubusAbsorbDateKey, toDateKey());
                    setMessage(`クリスタルでサキュバスLvを調整した。\n吸収補正 +${nextAbsorb}`);
                  }}>
                    <AppText style={styles.crystalButtonText}>サ+10</AppText>
                  </Pressable>
                  <Pressable style={styles.crystalButton} onPress={() => {
                    const nextAbsorb = Math.max(0, succubusAbsorbBonus - 10);
                    setSuccubusAbsorbBonus(nextAbsorb);
                    saveSetting(succubusAbsorbKey, String(nextAbsorb));
                    saveSetting(succubusAbsorbDateKey, toDateKey());
                    setMessage(`クリスタルでサキュバスLvを調整した。\n吸収補正 +${nextAbsorb}`);
                  }}>
                    <AppText style={styles.crystalButtonText}>サ-10</AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
          <View style={styles.operationPanel}>
            <AppText style={styles.mapHintTitle}>操作</AppText>
            <AppText style={styles.mapHintText}>
              {mapArea === "center"
                ? "上：誘惑の森 / 左右：別マップ / 下：ホーム"
                : mapArea === "left"
                  ? "水辺：回復 / 右端：十字路"
                  : mapArea === "right"
                    ? "スライム：接触で討伐 / 左端：十字路"
                    : "中央：戦闘 / 下端：十字路"}
            </AppText>
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
        <View style={styles.mapMessageBox}>
          <AppText style={styles.mapMessage}>{message}</AppText>
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
    padding: 8,
    backgroundColor: "#050505",
    gap: 8,
  },
  dpad: {
    alignSelf: "center",
    marginTop: 4,
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(0, 0, 0, 0.12)",
  },
  dpadButton: {
    position: "absolute",
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dpadUp: {
    top: 6,
    left: 38,
  },
  dpadLeft: {
    top: 38,
    left: 6,
  },
  dpadRight: {
    top: 38,
    right: 6,
  },
  dpadDown: {
    bottom: 6,
    left: 38,
  },
  dpadText: {
    color: "#fff",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
  },
  fullMap: {
    flex: 8,
    width: "100%",
    minHeight: 360,
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
  mapSlime: {
    position: "absolute",
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  mapSlimeImage: { width: "100%", height: "100%" },
  mapSuccubus: {
    position: "absolute",
    left: "58%",
    top: "37%",
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  mapHint: {
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
  outsideBottomRow: {
    flex: 2,
    minHeight: 168,
    flexDirection: "row",
    gap: 8,
  },
  statusPanel: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#111",
    padding: 10,
    gap: 4,
  },
  operationPanel: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#111",
    padding: 10,
    gap: 4,
  },
  statusBig: {
    color: "#fff",
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900",
  },
  statusText: {
    color: "#fff",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "900",
  },
  dangerStatus: {
    color: "#d9202a",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "900",
  },
  crystalPanel: {
    marginTop: 4,
    gap: 4,
  },
  crystalTitle: {
    color: "#ff69b4",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  crystalButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  crystalButton: {
    minWidth: 48,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#000",
    paddingVertical: 5,
    alignItems: "center",
  },
  crystalButtonText: {
    color: "#fff",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  mapMessageBox: {
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    padding: 14,
    minHeight: 72,
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
  gameOverTitle: {
    color: "#d9202a",
    letterSpacing: 2,
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
  lossStage: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
    gap: 6,
    padding: 8,
  },
  lossImageCard: {
    flex: 1,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#555",
    backgroundColor: "#000",
    opacity: 0.62,
  },
  lossImageActive: {
    borderColor: "#d9202a",
    opacity: 1,
  },
  lossImage: {
    width: "100%",
    height: "100%",
  },
  lossImageLabel: {
    position: "absolute",
    right: 6,
    top: 6,
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 6,
    paddingVertical: 3,
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
  gameOverMessage: {
    color: "#d9202a",
    fontWeight: "900",
  },
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
