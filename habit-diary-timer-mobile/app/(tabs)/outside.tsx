import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppAudio } from "@/audio/AudioProvider";
import { pointRepository } from "@/repositories/rewardRepository";
import { toDateKey, toDateTimeKey } from "@/utils/date";
import {
  ATTACK_MP_COST, charmDefenseCount, clamp, createSlimes, entryPosition, ESCAPE_MP_COST,
  facingForEntry, isNear, startPositions,
  succubusForLevel, type Direction, type MapArea, type MapPosition, type MapSlime,
  type SuccubusStage,
} from "@/features/outside/gameLogic";
import {
  dailyPointDateKey, dailyPointKey, hpKey, initializeDailyOutsidePoints,
  initializeLevel, initializePlayerStat, initializeSuccubusAbsorbBonus,
  levelDateKey, levelKey, mpKey, saveSetting,
  succubusAbsorbDateKey, succubusAbsorbKey,
} from "@/features/outside/gameState";
import { lossStageComments } from "@/features/outside/lossDialogue";

type Phase = "explore" | "battle" | "result" | "loss";
type LossEventKind = "tail" | "chest" | "back" | "foot";
type BattleCommand = "attack" | "defend" | LossEventKind | "run";
type BattleMenu = "root" | "fight" | "surrender";
type TemptationEffect = "kiss" | "heart" | null;
type BattleEnemyImage = "battle" | LossEventKind;
type BattleStatus = {
  hp: number;
  mp: number;
  enemyHp: number;
  lastLossKind: LossEventKind;
};
type MapStep = 0 | 1 | 2;

const crystalPosition: MapPosition = { x: 48, y: 52 };
const crystalExitPosition: MapPosition = { x: 48, y: 70 };
const warningSignPosition: MapPosition = { x: 66, y: 31 };
const warningSignExitPosition: MapPosition = { x: 66, y: 43 };
const crossroadTrees = [
  { left: "7%", top: "12%", size: 44 },
  { left: "16%", top: "30%", size: 36 },
  { left: "10%", top: "62%", size: 42 },
  { left: "77%", top: "13%", size: 46 },
  { left: "84%", top: "35%", size: 34 },
  { left: "75%", top: "65%", size: 40 },
] as const;
const crossroadRocks = [
  { left: "24%", top: "22%" },
  { left: "68%", top: "27%" },
  { left: "20%", top: "72%" },
  { left: "71%", top: "74%" },
] as const;
const pixelSprites = {
  mapCenter: require("../../assets/characters/outside-pixels/outside-map-center-crossroad-v2.png"),
  mapLeft: require("../../assets/characters/outside-pixels/outside-map-left.png"),
  mapRight: require("../../assets/characters/outside-pixels/outside-map-right.png"),
  mapTop: require("../../assets/characters/outside-pixels/outside-map-top.png"),
  playerFront: require("../../assets/characters/outside-pixels/player-front-dot.png"),
  playerBack: require("../../assets/characters/outside-pixels/player-back-dot.png"),
  playerLeft: require("../../assets/characters/outside-pixels/player-left-dot.png"),
  playerRight: require("../../assets/characters/outside-pixels/player-right-dot.png"),
  door: require("../../assets/characters/outside-pixels/door-dot.png"),
  slime: require("../../assets/characters/outside-pixels/slime-dot.png"),
  heartMark: require("../../assets/ui/outside-heart-mark.png"),
  kissMark: require("../../assets/ui/outside-kiss-mark.png"),
  crystal: require("../../assets/ui/outside-crystal.png"),
  warningSign: require("../../assets/characters/outside-pixels/warning-sign.png"),
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
      foot: require("../../assets/characters/outside-events/beginner-foot.png"),
    },
    middle: {
      tail: require("../../assets/characters/outside-events/middle-tail.png"),
      chest: require("../../assets/characters/outside-events/middle-chest.png"),
      back: require("../../assets/characters/outside-events/middle-overlook.png"),
      foot: require("../../assets/characters/outside-events/middle-foot.png"),
    },
    queen: {
      tail: require("../../assets/characters/outside-events/queen-tail.png"),
      chest: require("../../assets/characters/outside-events/queen-chest.png"),
      back: require("../../assets/characters/outside-events/queen-overlook.png"),
      foot: require("../../assets/characters/outside-events/queen-foot.png"),
    },
  },
  eventStages: {
    beginner: {
      tail: [
        require("../../assets/characters/outside-events/beginner-tail.png"),
        require("../../assets/characters/outside-events/beginner-tail.png"),
        require("../../assets/characters/outside-events/beginner-tail.png"),
      ],
      chest: [
        require("../../assets/characters/outside-events/beginner-chest_01.jpg"),
        require("../../assets/characters/outside-events/beginner-chest_02.jpg"),
        require("../../assets/characters/outside-events/beginner-chest_03.jpg"),
      ],
      back: [
        require("../../assets/characters/outside-events/beginner-overlook_01.jpg"),
        require("../../assets/characters/outside-events/beginner-overlook_02.jpg"),
        require("../../assets/characters/outside-events/beginner-overlook_03.jpg"),
      ],
      foot: [
        require("../../assets/characters/outside-events/beginner-foot_01.jpg"),
        require("../../assets/characters/outside-events/beginner-foot_02.jpg"),
        require("../../assets/characters/outside-events/beginner-foot_03.jpg"),
      ],
    },
    middle: {
      tail: [
        require("../../assets/characters/outside-events/middle-tail.png"),
        require("../../assets/characters/outside-events/middle-tail.png"),
        require("../../assets/characters/outside-events/middle-tail.png"),
      ],
      chest: [
        require("../../assets/characters/outside-events/middle-chest_01.jpg"),
        require("../../assets/characters/outside-events/middle-chest_02.jpg"),
        require("../../assets/characters/outside-events/middle-chest_03.jpg"),
      ],
      back: [
        require("../../assets/characters/outside-events/middle-overlook_01.jpg"),
        require("../../assets/characters/outside-events/middle-overlook_02.jpg"),
        require("../../assets/characters/outside-events/middle-overlook_03.jpg"),
      ],
      foot: [
        require("../../assets/characters/outside-events/middle-foot_01.jpg"),
        require("../../assets/characters/outside-events/middle-foot_02.jpg"),
        require("../../assets/characters/outside-events/middle-foot_03.jpg"),
      ],
    },
    queen: {
      tail: [
        require("../../assets/characters/outside-events/queen-tail.png"),
        require("../../assets/characters/outside-events/queen-tail.png"),
        require("../../assets/characters/outside-events/queen-tail.png"),
      ],
      chest: [
        require("../../assets/characters/outside-events/queen-chest_01.jpg"),
        require("../../assets/characters/outside-events/queen-chest_02.jpg"),
        require("../../assets/characters/outside-events/queen-chest_03.jpg"),
      ],
      back: [
        require("../../assets/characters/outside-events/queen-overlook_01.jpg"),
        require("../../assets/characters/outside-events/queen-overlook_02.jpg"),
        require("../../assets/characters/outside-events/queen-overlook_03.jpg"),
      ],
      foot: [
        require("../../assets/characters/outside-events/queen-foot_01.jpg"),
        require("../../assets/characters/outside-events/queen-foot_02.jpg"),
        require("../../assets/characters/outside-events/queen-foot_03.jpg"),
      ],
    },
  },
};

function CenterCrossroadBackdrop() {
  return (
    <View pointerEvents="none" style={styles.crossroadBackdrop}>
      <View style={styles.crossroadMistTop} />
      <View style={styles.crossroadMistBottom} />
      <View style={styles.crossroadVerticalPath} />
      <View style={styles.crossroadHorizontalPath} />
      <View style={styles.crossroadVerticalLight} />
      <View style={styles.crossroadHorizontalLight} />
      <View style={styles.crossroadIntersection} />
      <View style={styles.crossroadTopGate} />
      <View style={styles.crossroadBottomGate} />
      {crossroadTrees.map((tree, index) => (
        <View
          key={`crossroad-tree-${index}`}
          style={[
            styles.crossroadTree,
            {
              left: tree.left,
              top: tree.top,
              width: tree.size,
              height: tree.size,
            },
          ]}
        >
          <View style={styles.crossroadTreeTop} />
          <View style={styles.crossroadTreeTrunk} />
        </View>
      ))}
      {crossroadRocks.map((rock, index) => (
        <View key={`crossroad-rock-${index}`} style={[styles.crossroadRock, { left: rock.left, top: rock.top }]} />
      ))}
    </View>
  );
}

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
      foot: "足裏の誘惑に負けた。踏みつけるような視線に、抵抗心が削られていく。",
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
      foot: "足裏の誘惑に負けた。余裕の笑みで踏み込まれ、逃げる気力を奪われた。",
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
      foot: "女王の足裏の誘惑に負けた。見下ろされた瞬間、勝敗はもう決まっていた。",
    },
  },
};

type BattleQuipKind = "beforeTemptation" | "defended" | "escapeFailed" | "evaded";
const battleQuips: Record<SuccubusStage, Record<BattleQuipKind, string>> = {
  beginner: {
    beforeTemptation: "「ねえ、ちゃんとこっち見てよ♡」",
    defended: "「むぅ……まだ我慢するの？」",
    escapeFailed: "「逃げ足まで遅いなんて、ざぁこ♡」",
    evaded: "「そんな攻撃、当たるわけないでしょ♡」",
  },
  middle: {
    beforeTemptation: "「次は目を逸らせない誘惑をあげる」",
    defended: "「防いだつもり？　余裕はいつまで続くかしら」",
    escapeFailed: "「帰り道なら、もう私が塞いだわ」",
    evaded: "「動きが読めているの。次は私の番ね」",
  },
  queen: {
    beforeTemptation: "「跪きなさい。抗う意思ごと奪ってあげる」",
    defended: "「よく耐えたわね。では、さらに強くしてあげましょう」",
    escapeFailed: "「私の前から逃げられると、本気で思ったの？」",
    evaded: "「遅いわ。その程度で女王に触れられるものですか」",
  },
};

const victoryMapQuips: Record<SuccubusStage, string> = {
  beginner: "「うそ……負けたの？　次は絶対、誘惑してあげるんだから♡」",
  middle: "「今回はあなたの勝ちね。でも、次も耐えられるかしら？」",
  queen: "「見事です。今日だけは帰ることを許してあげましょう」",
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
  foot: "足裏",
};

const lossEventComments: Record<Exclude<LossEventKind, "tail">, string[]> = {
  chest: [
    "胸元が近づき、甘い香りで思考がぼやけていく。",
    "視線を逸らそうとしても、誘惑の気配が離してくれない。",
    "サキュバスは距離を詰め、こちらの反応を楽しんでいる。",
    "戦うための集中が、少しずつ甘く溶けていく。",
    "息が乱れ、剣を握る手に力が入らない。",
    "目の前の誘惑に、判断が遅れていく。",
    "サキュバスの声が近く、逃げる理由を忘れそうになる。",
    "踏みとどまろうとしても、胸元の魔力に飲まれる。",
    "頭の中が白く霞み、攻撃のタイミングを失った。",
    "甘い圧に押され、完全に主導権を奪われた。",
    "さらに深い誘惑が始まった。もう視線を外せない。",
    "サキュバスは勝ち誇ったように、こちらの限界を覗き込む。",
    "胸元から漂う魔力が、抵抗心を削っていく。",
    "言い返そうとしても、声が喉で止まった。",
    "体勢が崩れ、もう攻撃どころではない。",
    "甘い熱が広がり、負けを認めそうになる。",
    "サキュバスの誘惑が、最後の理性まで包み込む。",
    "もう戻れない。逃げる選択肢が消えていく。",
    "勝てるはずだった戦闘は、完全に塗り替えられた。",
    "胸の誘惑に完全敗北した。",
  ],
  back: [
    "後ろ姿で挑発され、完全にペースを奪われた。",
    "見下ろすような笑みに、逃げ道を塞がれた気がした。",
    "サキュバスは振り返り、こちらの動揺を見逃さない。",
    "屈辱的な誘惑に、剣を構える姿勢が崩れていく。",
    "背を向けたままの余裕が、こちらの心を揺らした。",
    "目を逸らすほど、敗北感が強くなる。",
    "サキュバスの声が甘く響き、足が止まった。",
    "挑発に乗らないつもりが、呼吸が乱れていく。",
    "逃げようとした一歩が、なぜか重い。",
    "完全に誘導され、戦闘の主導権を失った。",
    "さらに近い距離で挑発され、頭が真っ白になる。",
    "サキュバスは余裕の笑みで、こちらの限界を待っている。",
    "屈辱と誘惑が混ざり、抵抗する力が弱まる。",
    "もう攻撃のことを考えられない。",
    "背中越しの声だけで、体が反応してしまう。",
    "勝つための気持ちが、情けなく折れていく。",
    "サキュバスは勝利を確信し、最後の一押しをしてきた。",
    "完全に視線を奪われ、逃げる意志が消える。",
    "負けを認めるしかないところまで追い込まれた。",
    "お尻の誘惑に完全敗北した。",
  ],
  foot: [
    "足音が近づくたび、胸の奥が嫌なほど跳ねた。",
    "見下ろされる視線に、反射的に一歩下がってしまう。",
    "サキュバスは足先で逃げ道をなぞり、楽しそうに笑った。",
    "踏み込まれるだけで、剣を握る手が弱くなる。",
    "足裏の気配が近づき、抵抗する意思が揺らいでいく。",
    "近すぎる距離に、呼吸の仕方を忘れそうになる。",
    "サキュバスは余裕の表情で、こちらの反応を観察している。",
    "逃げようとしても、足元から力が抜けていく。",
    "踏みつけられるような圧に、判断が鈍っていく。",
    "屈辱と甘い魔力が混ざり、頭の中が熱くなる。",
    "もう真正面から見返せない。視線が足元へ落ちてしまう。",
    "サキュバスは勝ちを確信したように、ゆっくり距離を詰めた。",
    "足先の動きに合わせて、心まで誘導されていく。",
    "反撃しようとしても、体が少しも前へ出ない。",
    "近づくたびに、抵抗心が薄く削られていく。",
    "情けないほど、足元の魔力に捕まってしまった。",
    "サキュバスの声が甘く響き、敗北感が濃くなる。",
    "最後の意地まで、静かに踏み砕かれていく。",
    "もう逃げられない。足元から完全に支配された。",
    "足裏の誘惑に完全敗北した。",
  ],
};

function playerSpriteForFacing(facing: Direction) {
  if (facing === "up") return pixelSprites.playerBack;
  if (facing === "left") return pixelSprites.playerLeft;
  if (facing === "right") return pixelSprites.playerRight;
  return pixelSprites.playerFront;
}

export default function OutsideScreen() {
  const { playEffect, stopEffect, setBgmMode } = useAppAudio();
  const [level, setLevel] = useState(initializeLevel);
  const [playerHp, setPlayerHp] = useState(() => initializePlayerStat(hpKey, 100));
  const [playerMp, setPlayerMp] = useState(() => initializePlayerStat(mpKey, 100, 0));
  const [dailyOutsidePoints, setDailyOutsidePoints] = useState(initializeDailyOutsidePoints);
  const [succubusAbsorbBonus, setSuccubusAbsorbBonus] = useState(initializeSuccubusAbsorbBonus);
  const [phase, setPhase] = useState<Phase>("explore");
  const [mapArea, setMapArea] = useState<MapArea>("center");
  const [mapStep, setMapStep] = useState<MapStep>(0);
  const [mapPosition, setMapPosition] = useState<MapPosition>(startPositions.center);
  const [playerFacing, setPlayerFacing] = useState<Direction>("down");
  const [crystalOpen, setCrystalOpen] = useState(false);
  const [warningSignOpen, setWarningSignOpen] = useState(false);
  const [crystalRotation, setCrystalRotation] = useState(0);
  const [slimes, setSlimes] = useState<MapSlime[]>(() => createSlimes());
  const [charmTurns, setCharmTurns] = useState(0);
  const [message, setMessage] = useState(
    "館の外へ出た。家に帰るには、外にいるサキュバスの誘惑を切り抜ける必要がある。",
  );
  const [battleMenu, setBattleMenu] = useState<BattleMenu>("root");
  const [battleAwaitingChoice, setBattleAwaitingChoice] = useState(false);
  const [pendingBattleMessage, setPendingBattleMessage] = useState<string | null>(null);
  const [pendingGameOver, setPendingGameOver] = useState<{ kind: LossEventKind; reason: string } | null>(null);
  const [temptationEffect, setTemptationEffect] = useState<TemptationEffect>(null);
  const [battleEnemyImage, setBattleEnemyImage] = useState<BattleEnemyImage>("battle");
  const [encounterStage, setEncounterStage] = useState<SuccubusStage>("beginner");
  const [lossEventIndex, setLossEventIndex] = useState(0);
  const [lossSummary, setLossSummary] = useState("");
  const [battle, setBattle] = useState<BattleStatus>({
    hp: playerHp,
    mp: playerMp,
    enemyHp: 100,
    lastLossKind: "tail",
  });

  const resetToCrossroad = useCallback(() => {
    setPhase("explore");
    setMapArea("center");
    setMapStep(0);
    setMapPosition(startPositions.center);
    setPlayerFacing("down");
    setCrystalOpen(false);
    setBattleMenu("root");
    setBattleAwaitingChoice(false);
    setPendingBattleMessage(null);
    setPendingGameOver(null);
    setTemptationEffect(null);
    setBattleEnemyImage("battle");
    setMessage("館の外へ出た。家に帰るには、外にいるサキュバスの誘惑を切り抜ける必要がある。");
  }, []);

  useEffect(() => {
    resetToCrossroad();
  }, [resetToCrossroad]);

  useFocusEffect(resetToCrossroad);

  const succubus = useMemo(
    () => succubusForLevel(level, succubusAbsorbBonus),
    [level, succubusAbsorbBonus],
  );
  const activeSuccubusStage =
    phase === "battle" || phase === "loss" || phase === "result" ? encounterStage : succubus.stage;
  const crystalSpinScaleX = 0.28 + 0.72 * Math.abs(Math.cos((crystalRotation * Math.PI) / 180));
  const lossEventImages = useMemo(() => {
    return pixelSprites.eventStages[activeSuccubusStage][battle.lastLossKind];
  }, [activeSuccubusStage, battle.lastLossKind]);
  const battleEnemyImageSource = useMemo(() => {
    if (battleEnemyImage === "battle") return pixelSprites.succubus[activeSuccubusStage];
    return pixelSprites.events[activeSuccubusStage][battleEnemyImage];
  }, [activeSuccubusStage, battleEnemyImage]);
  const lossImageIndex = lossEventIndex < 5 ? 0 : lossEventIndex < 15 ? 1 : 2;
  const lossMessage = phase === "loss"
    ? [
        lossEventComments[battle.lastLossKind === "tail" ? "chest" : battle.lastLossKind][lossEventIndex]
          ?? lossEventComments.chest[0],
        lossStageComments[activeSuccubusStage][battle.lastLossKind === "tail" ? "chest" : battle.lastLossKind][lossEventIndex]
          ?? lossStageComments[activeSuccubusStage].chest[0],
        lossEventIndex >= 19 ? lossSummary : "",
      ].filter(Boolean).join("\n")
    : message;
const mapSource =
  mapArea === "left"
    ? pixelSprites.mapLeft
    : mapArea === "right"
      ? pixelSprites.mapRight
      : mapArea === "top"
        ? pixelSprites.mapTop
        : pixelSprites.mapCenter;
  const displayedPlayerFacing: Direction = mapStep > 0 ? "up" : playerFacing;

  useEffect(() => {
    if (phase === "loss") {
      setBgmMode("outsideCharm");
      return () => {
        stopEffect("trainingStart");
        stopEffect("outsideEarLick");
        stopEffect("outsideNipple");
        stopEffect("outsideLossRhythm");
        stopEffect("ejaculation");
        setBgmMode("default");
      };
    }
    if (charmTurns > 0) {
      setBgmMode("outsideCharm");
      return () => {
        stopEffect("trainingStart");
        stopEffect("outsideEarLick");
        stopEffect("outsideNipple");
        setBgmMode("default");
      };
    }
    if (phase === "battle") {
      setBgmMode("outsideBattle");
      return () => {
        stopEffect("trainingStart");
        stopEffect("outsideEarLick");
        stopEffect("outsideNipple");
        setBgmMode("default");
      };
    }
    setBgmMode("default");
    stopEffect("trainingStart");
    stopEffect("outsideEarLick");
    stopEffect("outsideNipple");
    return () => {
      stopEffect("trainingStart");
      stopEffect("outsideEarLick");
      stopEffect("outsideNipple");
      setBgmMode("default");
    };
  }, [charmTurns, phase, playEffect, setBgmMode, stopEffect]);

  useEffect(() => {
    if (phase !== "explore" || mapArea !== "center") return;
    const id = setInterval(() => {
      setCrystalRotation((current) => (current + 10) % 360);
    }, 80);
    return () => clearInterval(id);
  }, [mapArea, phase]);

  function openCrystalSettings() {
    setMessage("");
    setCrystalOpen(true);
  }

  function closeCrystalSettings() {
    setCrystalOpen(false);
    setMapPosition(crystalExitPosition);
    setPlayerFacing("down");
    setMessage("クリスタルから少し離れた。");
  }

  function openWarningSign() {
    setMessage("");
    setWarningSignOpen(true);
  }

  function closeWarningSign() {
    setWarningSignOpen(false);
    setMapPosition(warningSignExitPosition);
    setPlayerFacing("down");
    setMessage("注意事項を確認した。覚悟を決めたら、上の森へ進もう。");
  }

  function startEncounter(openingMessage?: string, initialCharmTurns?: number) {
    setEncounterStage(succubus.stage);
    setPhase("battle");
    setBattleMenu("root");
    setBattleAwaitingChoice(false);
    setPendingGameOver(null);
    setBattleEnemyImage("battle");
    setTemptationEffect(null);
    setMapArea("center");
    setMapStep(2);
    setCharmTurns(initialCharmTurns ?? (charmTurns > 0 ? charmTurns : 0));
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
    const fromArea = mapArea;
    setMapArea(nextArea);
    setMapStep(0);
    setCrystalOpen(false);
    setMapPosition(entryPosition(fromArea, nextArea));
    setPlayerFacing(facingForEntry(fromArea, nextArea));
    if (nextArea === "left") {
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
      setMessage("浄化の水辺に入った。\nHPとMPを全回復しました。");
    } else if (nextArea === "right") {
      if (dailyOutsidePoints < 100) {
        setSlimes(createSlimes());
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
    setPlayerFacing(direction);
    const step = 7;
    const next = { ...mapPosition };
    if (direction === "up") next.y -= step;
    if (direction === "down") next.y += step;
    if (direction === "left") next.x -= step;
    if (direction === "right") next.x += step;

    if (mapArea === "center") {
      if (isNear(next, crystalPosition, 9)) {
        setMapPosition(crystalPosition);
        openCrystalSettings();
        return;
      }
      if (isNear(next, warningSignPosition, 8)) {
        setMapPosition(warningSignPosition);
        openWarningSign();
        return;
      }
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
    setPlayerFacing("up");
    setMapStep(1);
    setMessage("木の物陰にいたサキュバスに呼び止められた。");
  }

  function handleMapMessagePress() {
    if (phase === "explore" && mapArea === "top" && mapStep === 1) {
      setMapStep(2);
      setMessage("");
      return;
    }
    setMessage("");
  }

  function chooseEncounter(choice: "resist" | "listen" | "run") {
    if (phase !== "explore" || mapArea !== "top" || mapStep === 0) return;
    if (choice === "run") {
      setMapArea("center");
      setMapStep(0);
      setMapPosition(entryPosition("top", "center"));
      setPlayerFacing("down");
      setMessage("咄嗟に身を引いて、十字路まで戻った。まだ甘い声が耳に残っている。");
      return;
    }
    if (choice === "listen") {
      startEncounter("サキュバスと目が合った瞬間、耳元に甘い吐息が触れた。\n耳舐め攻撃を受け、魅了モードになった。", charmDefenseCount(succubus.stage));
      setTemptationEffect("kiss");
      playEffect("outsideEarLick");
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

  function adjustPlayerLevel(delta: number) {
    const nextLevel = Math.max(1, Math.min(100, level + delta));
    savePlayerStats(nextLevel, playerHp, playerMp);
    setMessage(`設定で主人公Lvを調整した。\n現在 Lv.${nextLevel}`);
  }

  function adjustSuccubusLevel(delta: number) {
    const nextSuccubusLevel = Math.max(1, Math.min(100, succubus.level + delta));
    setSuccubusAbsorbBonus(nextSuccubusLevel);
    saveSetting(succubusAbsorbKey, String(nextSuccubusLevel));
    saveSetting(succubusAbsorbDateKey, toDateKey());
    const nextSuccubus = succubusForLevel(level, nextSuccubusLevel);
    setMessage(`設定でサキュバスLvを調整した。\n現在 ${nextSuccubus.title} Lv.${nextSuccubus.level}`);
  }

  function activateCrystalCharm() {
    setCharmTurns(charmDefenseCount(succubus.stage));
    setMessage("設定で魅了モードになりました。\n戦闘中に防御を重ねるか、左の水辺で浄化できます。");
  }

  const defeatSlime = useCallback((slimeId: number) => {
    if (phase !== "explore" || mapArea !== "right") return;
    if (dailyOutsidePoints >= 100) {
      setMessage("今日はもうスライム狩りで100pt獲得済み。これ以上は明日のお楽しみ。");
      setSlimes((current) => current.map((slime) => ({ ...slime, active: false })));
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
    setSlimes((current) =>
      current.map((slime) =>
        slime.id === slimeId ? { ...slime, active: false } : slime,
      ),
    );
    setMessage(
      `スライムに接触して討伐した。\n+${gained}pt / Lv.${nextLevel}\n本日の外RPG獲得：${nextDailyPoints}/100pt`,
    );
  }, [dailyOutsidePoints, level, mapArea, phase]);

  useEffect(() => {
    if (phase !== "explore" || mapArea !== "right" || dailyOutsidePoints >= 100) return;
    const id = setInterval(() => {
      setSlimes((current) =>
        current.map((slime) =>
          slime.active
            ? {
                ...slime,
                x: Math.max(18, Math.min(86, slime.x + (Math.random() - 0.5) * 10)),
                y: Math.max(18, Math.min(82, slime.y + (Math.random() - 0.5) * 10)),
              }
            : slime,
        ),
      );
    }, 700);
    return () => clearInterval(id);
  }, [dailyOutsidePoints, mapArea, phase]);

  useEffect(() => {
    if (phase !== "explore" || mapArea !== "right") return;
    const touchedSlime = slimes.find((slime) => slime.active && isNear(mapPosition, slime));
    if (!touchedSlime) return;
    defeatSlime(touchedSlime.id);
  }, [defeatSlime, mapArea, mapPosition, phase, slimes]);

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
    const nextSuccubusLevel = Math.min(100, succubus.level + absorbedLevel);
    setEncounterStage(succubus.stage);
    setLossEventIndex(0);
    setBattleMenu("root");
    setTemptationEffect(null);
    setBattleEnemyImage(kind);
    setPhase("loss");
    setCharmTurns(0);
    setBattle((current) => ({ ...current, hp: 0, mp: Math.max(0, current.mp - 100), lastLossKind: kind }));
    setLossSummary(
      `レベルドレインにより、全て吸い尽くされた。\nLv.${absorbedLevel} / MP100 / Pt50を吸収された。\nサキュバスのレベルは${nextSuccubusLevel}となった。\n現在：Lv.1 / HP1 / MP1`,
    );
    setSuccubusAbsorbBonus(nextSuccubusLevel);
    saveSetting(succubusAbsorbDateKey, today);
    saveSetting(succubusAbsorbKey, String(nextSuccubusLevel));
    pointRepository.award(
      `outside-gameover:${toDateTimeKey()}`,
      -50,
      "外RPGでサキュバスにポイントを吸収された",
    );
    savePlayerStats(1, 1, 1);
    setMessage(reason);
  }

  function queueGameOver(kind: LossEventKind, reason: string, finalAttackMessage: string) {
    setPendingGameOver({ kind, reason });
    setBattleMenu("root");
    setBattleAwaitingChoice(false);
    setMessage(`${finalAttackMessage}\nHPが尽きた……タップして敗北シーンへ。`);
  }

  function showEnemyTurn(
    quip: string,
    outcome: string,
    nextHp: number,
    kind: LossEventKind,
  ) {
    if (nextHp <= 0) {
      setPendingGameOver({ kind, reason: battleLines[succubus.stage].lose[kind] });
    }
    setMessage(quip);
    setPendingBattleMessage(
      nextHp <= 0 ? `${outcome}\nHPが尽きた……タップして敗北シーンへ。` : outcome,
    );
  }

  function randomLossKind(): LossEventKind {
    const events: LossEventKind[] = ["chest", "back", "foot"];
    return events[Math.floor(Math.random() * events.length)] ?? "chest";
  }

  function shouldUseNormalAttack() {
    return Math.random() < 0.35;
  }

  function playRandomTemptationEffect() {
    stopEffect("outsideEarLick");
    stopEffect("outsideNipple");
    setCharmTurns(charmDefenseCount(succubus.stage));
    if (Math.random() < 0.5) {
      setTemptationEffect("kiss");
      playEffect("outsideEarLick");
      return "耳舐め";
    }
    setTemptationEffect("heart");
    playEffect("outsideNipple");
    return "乳首責め";
  }

  function battleQuip(kind: BattleQuipKind) {
    return battleQuips[succubus.stage][kind];
  }

  function resolveCommand(command: BattleCommand) {
    if (phase !== "battle") return;
    setBattleMenu("root");
    setBattleAwaitingChoice(false);
    setPendingGameOver(null);
    setBattleEnemyImage("battle");
    if (command === "run") {
      playEffect("outsideEscape");
      const escapeBlockedByCharm = charmTurns > 0;
      const escapeBlockedByMp = battle.mp < ESCAPE_MP_COST;
      if (escapeBlockedByCharm || escapeBlockedByMp) {
        const normalAttack = shouldUseNormalAttack();
        const enemyKind: LossEventKind = normalAttack ? "tail" : randomLossKind();
        const damage = normalAttack
          ? Math.ceil(enemyAttackDamage[succubus.stage] * 0.7)
          : enemyAttackDamage[succubus.stage];
        const nextHp = clamp(battle.hp - damage);
        const nextMp = clamp(battle.mp + (normalAttack ? 0 : -6));
        setBattleEnemyImage(enemyKind);
        setBattle({ ...battle, hp: nextHp, mp: nextMp, lastLossKind: enemyKind });
        setPlayerHp(Math.max(1, nextHp));
        setPlayerMp(nextMp);
        saveSetting(hpKey, String(Math.max(1, nextHp)));
        saveSetting(mpKey, String(nextMp));
        const failureReason = escapeBlockedByCharm
          ? "魅了モード中で逃げられない。"
          : `逃走に必要なMP${ESCAPE_MP_COST}が足りない。（現在MP：${Math.round(battle.mp)}）`;
        let finalAttackMessage: string;
        if (normalAttack) {
          if (!escapeBlockedByCharm) setTemptationEffect(null);
          finalAttackMessage = `${failureReason}\n逃げようとした隙に尻尾の通常攻撃：-${damage}HP`;
        } else {
          const effectLabel = playRandomTemptationEffect();
          finalAttackMessage = `${failureReason}\n${lossLabels[enemyKind]}の誘惑攻撃：-${damage}HP\n${effectLabel}の誘惑が絡みつく。`;
        }
        showEnemyTurn(battleQuip("escapeFailed"), finalAttackMessage, nextHp, enemyKind);
        return;
      }
      const escapedMp = clamp(battle.mp - ESCAPE_MP_COST);
      setBattle((current) => ({ ...current, mp: escapedMp }));
      setPlayerMp(escapedMp);
      saveSetting(mpKey, String(escapedMp));
      setPhase("explore");
      setMapArea("center");
      setMapStep(0);
      setMapPosition(startPositions.center);
      setMessage(`${battleLines[succubus.stage].escape}\n逃走でMPを${ESCAPE_MP_COST}消費した。`);
      return;
    }

    if (command !== "attack" && command !== "defend") {
      applyGameOver(command, battleLines[succubus.stage].lose[command]);
      return;
    }

    if (command === "attack" && charmTurns > 0) {
      playEffect("outsideEvade");
      const enemyKind = randomLossKind();
      const damage = enemyAttackDamage[succubus.stage];
      const nextHp = clamp(battle.hp - damage);
      const nextMp = clamp(battle.mp - ATTACK_MP_COST - 6);
      setBattleEnemyImage(enemyKind);
      setTemptationEffect(null);
      setBattle({ ...battle, hp: nextHp, mp: nextMp, lastLossKind: enemyKind });
      setPlayerHp(Math.max(1, nextHp));
      setPlayerMp(nextMp);
      saveSetting(hpKey, String(Math.max(1, nextHp)));
      saveSetting(mpKey, String(nextMp));
      const effectLabel = playRandomTemptationEffect();
      const finalAttackMessage = `魅了モード中で攻撃が当たらない。MP-${ATTACK_MP_COST}\n${lossLabels[enemyKind]}の誘惑攻撃：-${damage}HP\n${effectLabel}の誘惑がさらに絡みつく。`;
      showEnemyTurn(battleQuip("evaded"), finalAttackMessage, nextHp, enemyKind);
      return;
    }

    if (command === "defend") {
      playEffect("outsideEvade");
      if (charmTurns > 0) {
        const enemyKind = randomLossKind();
        const damage = Math.ceil(enemyAttackDamage[succubus.stage] * 0.5);
        const nextHp = clamp(battle.hp - damage);
        const nextMp = clamp(battle.mp + 8);
        const remainingCharm = Math.max(0, charmTurns - 1);
        setCharmTurns(remainingCharm);
        setBattleEnemyImage(enemyKind);
        setBattle({ ...battle, hp: nextHp, mp: nextMp, lastLossKind: enemyKind });
        setPlayerHp(Math.max(1, nextHp));
        setPlayerMp(nextMp);
        saveSetting(hpKey, String(Math.max(1, nextHp)));
        saveSetting(mpKey, String(nextMp));
        if (remainingCharm === 0) {
          setTemptationEffect(null);
          stopEffect("outsideEarLick");
          stopEffect("outsideNipple");
        }
        const defenseMessage = remainingCharm === 0
          ? `誘惑を防御で受け止めた：-${damage}HP / MP+8\n誘惑を振り払った。次の攻撃は命中する。`
          : `誘惑を防御で受け止めた：-${damage}HP / MP+8\n解除まであと${remainingCharm}回、防御が必要。`;
        showEnemyTurn(battleQuip("defended"), defenseMessage, nextHp, enemyKind);
        return;
      }
      const normalAttack = shouldUseNormalAttack();
      const enemyKind: LossEventKind = normalAttack ? "tail" : randomLossKind();
      const damage = Math.ceil(enemyAttackDamage[succubus.stage] * (normalAttack ? 0.35 : 0.5));
      const nextHp = clamp(battle.hp - damage);
      const nextMp = clamp(battle.mp + 8);
      setBattleEnemyImage(enemyKind);
      setTemptationEffect(null);
      setBattle({ ...battle, hp: nextHp, mp: nextMp, lastLossKind: enemyKind });
      setPlayerHp(Math.max(1, nextHp));
      setPlayerMp(nextMp);
      saveSetting(hpKey, String(Math.max(1, nextHp)));
      saveSetting(mpKey, String(nextMp));
      if (normalAttack) {
        const lossKind = randomLossKind();
        const finalAttackMessage = `身構えて通常攻撃を受け流した。\n尻尾の通常攻撃：-${damage}HP / MP+8\n誘惑ではない。ただの攻撃でも油断できない。`;
        showEnemyTurn(battleQuip("defended"), finalAttackMessage, nextHp, lossKind);
        return;
      }
      const effectLabel = playRandomTemptationEffect();
      const finalAttackMessage = `身構えて誘惑を受け流した。\n${lossLabels[enemyKind]}の誘惑攻撃：-${damage}HP / MP+8\n${effectLabel}の誘惑が残っている。`;
      showEnemyTurn(battleQuip("defended"), finalAttackMessage, nextHp, enemyKind);
      return;
    }

    playEffect("outsideAttack");
    const attackDamage = Math.max(18, 34 - Math.max(0, succubus.level - level) * 0.25);
    const nextEnemyHp = clamp(battle.enemyHp - attackDamage);
    const attackMp = clamp(battle.mp - ATTACK_MP_COST);
    if (nextEnemyHp <= 0) {
      const nextBattle = { ...battle, mp: attackMp, enemyHp: 0 };
      setBattle(nextBattle);
      setPlayerHp(nextBattle.hp);
      setPlayerMp(nextBattle.mp);
      saveSetting(hpKey, String(nextBattle.hp));
      saveSetting(mpKey, String(nextBattle.mp));
      setPhase("result");
      setMessage(battleLines[succubus.stage].win);
      return;
    }

    const normalAttack = shouldUseNormalAttack();
    const enemyKind: LossEventKind = normalAttack ? "tail" : randomLossKind();
    const damage = normalAttack ? Math.ceil(enemyAttackDamage[succubus.stage] * 0.7) : enemyAttackDamage[succubus.stage];
    const nextHp = clamp(battle.hp - damage);
    const nextMp = clamp(attackMp + (normalAttack ? 0 : -6));
    setBattleEnemyImage(enemyKind);
    setTemptationEffect(null);
    setBattle({ ...battle, hp: nextHp, mp: nextMp, enemyHp: nextEnemyHp, lastLossKind: enemyKind });
    setPlayerHp(Math.max(1, nextHp));
    setPlayerMp(nextMp);
    saveSetting(hpKey, String(Math.max(1, nextHp)));
    saveSetting(mpKey, String(nextMp));

    if (normalAttack) {
      const lossKind = randomLossKind();
      const finalAttackMessage = `${battleLines[succubus.stage].attack}\nMP-${ATTACK_MP_COST} / 尻尾の通常攻撃：-${damage}HP\n誘惑ではなく、鋭い尻尾で反撃してきた。`;
      if (nextHp <= 0) {
        queueGameOver(lossKind, battleLines[succubus.stage].lose[lossKind], finalAttackMessage);
        return;
      }
      setMessage(finalAttackMessage);
      return;
    }

    const effectLabel = playRandomTemptationEffect();
    const finalAttackMessage = `${battleLines[succubus.stage].attack}\nMP-${ATTACK_MP_COST} / ${lossLabels[enemyKind]}の誘惑攻撃：-${damage}HP\n${effectLabel}の誘惑が襲いかかる。`;
    showEnemyTurn(battleQuip("beforeTemptation"), finalAttackMessage, nextHp, enemyKind);
  }

  function advanceLossScene() {
    if (phase !== "loss") return;
    setLossEventIndex((current) => {
      if (current >= 19) return current;
      const next = current + 1;
      if (next === 5) {
        stopEffect("outsideEarLick");
        stopEffect("outsideNipple");
        playEffect("outsideLossRhythm");
      }
      if (next >= 14) {
        stopEffect("outsideLossRhythm");
        stopEffect("ejaculation");
        playEffect("ejaculation");
      }
      return next;
    });
  }

  function resetBattle(mapMessage = "もう一度、帰り道を探す。油断しないように進もう。") {
    setPhase("explore");
    setBattleMenu("root");
    setBattleAwaitingChoice(false);
    setPendingBattleMessage(null);
    setPendingGameOver(null);
    setTemptationEffect(null);
    setBattleEnemyImage("battle");
    setMapArea("center");
    setMapStep(0);
    setMapPosition(startPositions.center);
    setCharmTurns(0);
    setMessage(mapMessage);
    setBattle({
      hp: playerHp,
      mp: playerMp,
      enemyHp: 100,
      lastLossKind: "tail",
    });
  }

  function handleBattleMessagePress() {
    if (phase !== "battle") return;
    if (pendingBattleMessage) {
      setMessage(pendingBattleMessage);
      setPendingBattleMessage(null);
      return;
    }
    if (pendingGameOver) {
      const next = pendingGameOver;
      setPendingGameOver(null);
      applyGameOver(next.kind, next.reason);
      return;
    }
    setBattleAwaitingChoice(true);
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

          <View style={[styles.battleStage, phase === "loss" && styles.lossBattleStage]}>
            {phase === "loss" ? (
              <>
                <Pressable style={styles.lossStage} onPress={advanceLossScene}>
                  <Image
                    source={lossEventImages[lossImageIndex] ?? lossEventImages[0]}
                    style={styles.lossImage}
                    contentFit="cover"
                  />
                  <AppText style={styles.lossImageLabel}>
                    {lossEventIndex + 1} / 20
                  </AppText>
                </Pressable>
                <Pressable style={styles.lossMessageBox} onPress={advanceLossScene}>
                  <View style={styles.rowBetween}>
                    <AppText style={styles.battleMessageName}>二ノサキュバス</AppText>
                    <AppText style={styles.phase}>LOSS</AppText>
                  </View>
                  <AppText style={[styles.message, styles.gameOverMessage]}>{lossMessage}</AppText>
                  {lossEventIndex < 19 ? <AppText style={styles.tapGuide}>タップ ▼</AppText> : null}
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.enemyOverlay}>
                  <AppText style={[styles.enemyOverlayName, { color: succubus.color }]}>
                    {succubus.title} Lv.{succubus.level}
                  </AppText>
                  <AppText style={styles.enemyOverlayHp}>HP {Math.round(battle.enemyHp)}</AppText>
                </View>
                <View style={styles.enemyLarge}>
                  <Image
                    source={battleEnemyImageSource}
                    style={[
                      styles.enemyLargeImage,
                      battleEnemyImage !== "battle" && styles.enemyLargeEventImage,
                    ]}
                    contentFit="cover"
                  />
                </View>
                {battleAwaitingChoice ? (
                  <View style={styles.battleChoiceOverlay}>
                    <View style={styles.commandPanel}>
                      <AppText style={styles.panelTitle}>選択</AppText>
                      <View style={styles.battleCommands}>
                        {battleMenu === "root" ? (
                          <>
                            <PrimaryButton title="戦う" onPress={() => setBattleMenu("fight")} />
                            <PrimaryButton title="降参する" tone="defeat" onPress={() => setBattleMenu("surrender")} />
                            <PrimaryButton title={`逃げる（MP${ESCAPE_MP_COST}）`} tone="secondary" onPress={() => resolveCommand("run")} />
                          </>
                        ) : battleMenu === "fight" ? (
                          <>
                            <PrimaryButton title={`攻撃（MP${ATTACK_MP_COST}）`} onPress={() => resolveCommand("attack")} />
                            <PrimaryButton title="防御" tone="secondary" onPress={() => resolveCommand("defend")} />
                            <PrimaryButton title="戻る" tone="secondary" onPress={() => setBattleMenu("root")} />
                          </>
                        ) : (
                          <>
                            <PrimaryButton title="おっぱい" tone="defeat" onPress={() => resolveCommand("chest")} />
                            <PrimaryButton title="お尻" tone="defeat" onPress={() => resolveCommand("back")} />
                            <PrimaryButton title="足裏" tone="defeat" onPress={() => resolveCommand("foot")} />
                            <PrimaryButton title="戻る" tone="secondary" onPress={() => setBattleMenu("root")} />
                          </>
                        )}
                      </View>
                    </View>
                    <View style={styles.playerStatusPanel}>
                      <AppText style={styles.panelTitle}>自分</AppText>
                      <AppText style={styles.statusBattleBig}>HP {Math.round(battle.hp)}</AppText>
                      <AppText style={styles.statusBattleBig}>MP {Math.round(battle.mp)}</AppText>
                      <AppText style={charmTurns > 0 ? styles.charmedMark : styles.normalMark}>
                        {charmTurns > 0 ? `魅了中（防御あと${charmTurns}回）` : "正常"}
                      </AppText>
                      {temptationEffect ? (
                        <View style={styles.statusEffectRow}>
                          <Image
                            source={temptationEffect === "kiss" ? pixelSprites.kissMark : pixelSprites.heartMark}
                            style={styles.statusEffectMark}
                            contentFit="contain"
                          />
                          <AppText style={styles.statusEffectLabel}>
                            {temptationEffect === "kiss" ? "耳舐め" : "乳首責め"}
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ) : (
                <Pressable style={styles.battleStageMessage} onPress={handleBattleMessagePress}>
                  <View style={styles.rowBetween}>
                    <AppText style={styles.battleMessageName}>二ノサキュバス</AppText>
                    <AppText style={styles.phase}>{phase.toUpperCase()}</AppText>
                  </View>
                  {charmTurns > 0 ? (
                    <AppText style={styles.charmText}>CHARM：逃亡不可 / 防御あと{charmTurns}回で解除</AppText>
                  ) : null}
                  <AppText style={[styles.message, pendingGameOver ? styles.pendingGameOverMessage : null]}>
                    {message}
                  </AppText>
                  <AppText style={styles.tapGuide}>タップ ▼</AppText>
                </Pressable>
                )}
              </>
            )}
          </View>

          {phase !== "battle" ? (
            <View style={styles.battleCommands}>
              {phase === "result" ? (
                <PrimaryButton
                  title="マップへ戻る"
                  tone="contract"
                  onPress={() => resetBattle(victoryMapQuips[succubus.stage])}
                />
              ) : null}
              {phase !== "loss" || lossEventIndex >= 19 ? (
                <PrimaryButton
                  title={phase === "loss" ? "力尽きたため、館に戻る" : "ホーム画面へ戻る"}
                  tone="secondary"
                  onPress={() => router.replace("/(tabs)")}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.mapScreen}>
        <View style={styles.fullMap}>
          {mapSource ? (
            <Image source={mapSource} style={styles.mapBackground} contentFit="cover" />
          ) : (
            <CenterCrossroadBackdrop />
          )}
          {mapArea === "center" ? (
            <>
              <Pressable style={styles.mapLeftTap} onPress={() => moveMap("left")} />
              <Pressable style={styles.mapRightTap} onPress={() => moveMap("right")} />
              <Pressable style={styles.mapForwardTap} onPress={advanceMap} />
              <Pressable style={styles.mapDoorTap} onPress={() => router.replace("/(tabs)")} />
              <Pressable hitSlop={18} style={styles.mapCrystalTap} onPress={openCrystalSettings}>
                <View style={[styles.mapCrystal, { transform: [{ scaleX: crystalSpinScaleX }] }]}>
                  <Image source={pixelSprites.crystal} style={styles.mapCrystalImage} contentFit="contain" />
                </View>
              </Pressable>
              <Pressable hitSlop={16} style={styles.mapWarningSignTap} onPress={openWarningSign}>
                <Image source={pixelSprites.warningSign} style={styles.mapWarningSignImage} contentFit="contain" />
              </Pressable>
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
              {mapStep > 0 ? (
                <View style={styles.exclamation}>
                  <AppText style={styles.exclamationText}>!</AppText>
                </View>
              ) : null}
              {mapStep === 2 ? (
                <View style={styles.mapChoiceBox}>
                  <AppText style={styles.mapChoiceTitle}>サキュバスに呼び止められた</AppText>
                  <Pressable style={styles.mapChoiceButton} onPress={() => chooseEncounter("resist")}>
                    <AppText style={styles.mapChoiceText}>戦闘開始</AppText>
                  </Pressable>
                  <Pressable style={[styles.mapChoiceButton, styles.mapChoicePink]} onPress={() => chooseEncounter("listen")}>
                    <AppText style={[styles.mapChoiceText, styles.mapChoicePinkText]}>サキュバスと目が合う</AppText>
                  </Pressable>
                  <Pressable style={[styles.mapChoiceButton, styles.mapChoiceRed]} onPress={() => chooseEncounter("run")}>
                    <AppText style={[styles.mapChoiceText, styles.mapChoiceRedText]}>すぐ逃げる</AppText>
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
              source={playerSpriteForFacing(displayedPlayerFacing)}
              style={styles.mapSpriteImage}
              contentFit="contain"
            />
          </View>
          {mapArea === "right" && dailyOutsidePoints < 100
            ? slimes
                .filter((slime) => slime.active)
                .map((slime) => (
                  <View key={slime.id} style={[styles.mapSlime, { left: `${slime.x}%`, top: `${slime.y}%` }]}>
                    <Image source={pixelSprites.slime} style={styles.mapSlimeImage} contentFit="contain" />
                  </View>
                ))
            : null}
          {!crystalOpen && !warningSignOpen && message ? (
            <Pressable style={styles.mapMessageBox} onPress={handleMapMessagePress}>
              <AppText style={[styles.mapMessage, /回復|全回復|浄化/.test(message) && styles.recoveryMessage]}>{message}</AppText>
              <AppText style={styles.mapTapGuide}>タップ ▼</AppText>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.outsideBottomRow}>
          <View style={styles.statusPanel}>
            <AppText style={styles.mapHintTitle}>自分のステータス</AppText>
            <AppText style={styles.statusBig}>Lv.{level}</AppText>
            <AppText style={level <= 1 || playerHp <= 1 || playerMp <= 1 ? styles.dangerStatus : styles.statusText}>
              HP {playerHp}　MP {playerMp}
            </AppText>
            <AppText style={styles.statusText}>本日獲得 {dailyOutsidePoints}/100pt</AppText>
            <AppText style={charmTurns > 0 ? styles.charmStatusText : styles.statusSubText}>
              {charmTurns > 0 ? "魅了中：水辺で解除" : "魅了なし"}
            </AppText>
          </View>
          <View style={styles.operationPanel}>
            <AppText style={styles.mapHintTitle}>操作</AppText>
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
      </View>
      <Modal
        visible={crystalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeCrystalSettings}
      >
        <View style={styles.crystalModalBackdrop}>
          <View style={styles.crystalModal}>
            <AppText style={styles.crystalModalKicker}>OUTSIDE SETTINGS</AppText>
            <AppText style={styles.crystalModalTitle}>設定</AppText>
            <AppText style={styles.crystalModalHelp}>
              レベル調整と魅了モードを設定できます。
            </AppText>

            <View style={styles.crystalSettingRow}>
              <View style={styles.crystalSettingText}>
                <AppText style={styles.crystalSettingLabel}>自分のレベル</AppText>
                <AppText style={styles.crystalSettingValue}>現在 Lv.{level}</AppText>
              </View>
              <View style={styles.crystalStepButtons}>
                <Pressable style={styles.crystalStepButton} onPress={() => adjustPlayerLevel(-10)}>
                  <AppText style={styles.crystalStepButtonText}>-10</AppText>
                </Pressable>
                <Pressable style={styles.crystalStepButton} onPress={() => adjustPlayerLevel(10)}>
                  <AppText style={styles.crystalStepButtonText}>+10</AppText>
                </Pressable>
              </View>
            </View>

            <View style={styles.crystalSettingRow}>
              <View style={styles.crystalSettingText}>
                <AppText style={styles.crystalSettingLabel}>サキュバスのレベル</AppText>
                <AppText style={[styles.crystalSettingValue, { color: succubus.color }]}>
                  現在 Lv.{succubus.level}
                </AppText>
              </View>
              <View style={styles.crystalStepButtons}>
                <Pressable style={styles.crystalStepButton} onPress={() => adjustSuccubusLevel(-10)}>
                  <AppText style={styles.crystalStepButtonText}>-10</AppText>
                </Pressable>
                <Pressable style={styles.crystalStepButton} onPress={() => adjustSuccubusLevel(10)}>
                  <AppText style={styles.crystalStepButtonText}>+10</AppText>
                </Pressable>
              </View>
            </View>

            <Pressable style={[styles.crystalCharmButton, charmTurns > 0 && styles.crystalCharmButtonActive]} onPress={activateCrystalCharm}>
              <AppText style={styles.crystalCharmButtonText}>
                {charmTurns > 0 ? "魅了モード中" : "魅了モードになる"}
              </AppText>
            </Pressable>
            <AppText style={styles.crystalModalNote}>
              ※魅了モードになると、戦闘時に逃げられなくなります。左の水辺に移動すると解除されます。
            </AppText>

            <Pressable style={styles.crystalCloseButton} onPress={closeCrystalSettings}>
              <AppText style={styles.crystalCloseButtonText}>閉じる</AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={warningSignOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeWarningSign}
      >
        <View style={styles.crystalModalBackdrop}>
          <ScrollView style={styles.warningModal} contentContainerStyle={styles.warningModalContent}>
            <AppText style={styles.warningModalKicker}>WARNING SIGN</AppText>
            <AppText style={styles.warningModalTitle}>この先、サキュバス出没注意</AppText>

            <View style={styles.warningSection}>
              <AppText style={styles.warningSectionTitle}>奥へ進む前の注意事項</AppText>
              <AppText style={styles.warningBody}>
                上の森ではサキュバスと遭遇します。HPとMPを確認し、必要なら左の水辺で回復してから進んでください。魅了中は逃げられません。
              </AppText>
            </View>

            <View style={styles.succubusInfoSection}>
              <AppText style={styles.succubusInfoTitle}>サキュバスについて</AppText>
              <AppText style={styles.warningBody}>
                サキュバスはレベルを吸収するほど、体格と魔力が成長します。現在は「{succubus.title}」Lv.{succubus.level}です。
              </AppText>
              <AppText style={styles.succubusGrowthText}>
                ・Lv.1〜29：小柄な初級段階。誘惑は防御1回で解除。{"\n"}
                ・Lv.30〜79：成長した上級段階。体格と誘惑が強まり、防御2回で解除。{"\n"}
                ・Lv.80〜100：完成した女王段階。最も大きく強い姿となり、防御3回で解除。
              </AppText>
            </View>

            <View style={styles.warningSection}>
              <AppText style={styles.warningSectionTitle}>戦い方</AppText>
              <AppText style={styles.warningBody}>
                ・攻撃：サキュバスのHPを減らし、毎回MPを20消費。魅了中は命中しませんが、MPは消費します。{"\n"}
                ・防御：被害を抑えてMPを8回復。魅了中は防御するたび解除へ近づきます。{"\n"}
                ・魅了解除：初級1回／上級2回／女王3回の防御が必要です。{"\n"}
                ・降参する：発情した場合、そのまま降参することができます♡{"\n"}
                ・逃げる：MP50を消費。魅了されておらず、MPが50以上ある時だけ成功。失敗すると敵の攻撃を受けます。
              </AppText>
            </View>

            <View style={styles.defeatWarningSection}>
              <AppText style={styles.defeatWarningTitle}>敗北した場合</AppText>
              <AppText style={styles.defeatWarningText}>
                HPが0になるか降参すると敗北シーンへ移行します。{"\n"}
                レベルは1、HPとMPも1になり、ポイントも50Ptを失います。{"\n"}
                奪われたレベルはサキュバスに吸収されます。
              </AppText>
            </View>

            <Pressable style={styles.warningCloseButton} onPress={closeWarningSign}>
              <AppText style={styles.warningCloseButtonText}>確認して閉じる</AppText>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  mapScreen: {
    flex: 1,
    padding: 8,
    paddingBottom: 28,
    backgroundColor: "#050505",
    gap: 6,
  },
  dpad: {
    alignSelf: "center",
    marginTop: 0,
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(0, 0, 0, 0.12)",
  },
  dpadButton: {
    position: "absolute",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  dpadUp: {
    top: 3,
    left: 27,
  },
  dpadLeft: {
    top: 27,
    left: 3,
  },
  dpadRight: {
    top: 27,
    right: 3,
  },
  dpadDown: {
    bottom: 3,
    left: 27,
  },
  dpadText: {
    color: "#fff",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
  },
  fullMap: {
    flex: 8.4,
    width: "100%",
    minHeight: 320,
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
  crossroadBackdrop: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backgroundColor: "#0a1f16",
  },
  crossroadMistTop: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    height: "24%",
    backgroundColor: "rgba(53, 16, 64, 0.34)",
  },
  crossroadMistBottom: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: "24%",
    backgroundColor: "rgba(53, 16, 64, 0.24)",
  },
  crossroadVerticalPath: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "38%",
    width: "24%",
    backgroundColor: "#5d554b",
  },
  crossroadHorizontalPath: {
    position: "absolute",
    top: "45%",
    right: 0,
    left: 0,
    height: "14%",
    backgroundColor: "#5d554b",
  },
  crossroadVerticalLight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "45%",
    width: "10%",
    backgroundColor: "rgba(205, 188, 156, 0.28)",
  },
  crossroadHorizontalLight: {
    position: "absolute",
    top: "48%",
    right: 0,
    left: 0,
    height: "7%",
    backgroundColor: "rgba(205, 188, 156, 0.24)",
  },
  crossroadIntersection: {
    position: "absolute",
    top: "43%",
    left: "37%",
    width: "26%",
    height: "18%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "rgba(128, 107, 84, 0.46)",
  },
  crossroadTopGate: {
    position: "absolute",
    top: "4%",
    left: "30%",
    width: "40%",
    height: 8,
    borderWidth: 1,
    borderColor: "#6f536f",
    backgroundColor: "#171014",
  },
  crossroadBottomGate: {
    position: "absolute",
    bottom: "1%",
    left: "30%",
    width: "40%",
    height: 14,
    borderWidth: 1,
    borderColor: "#7b5a73",
    backgroundColor: "#120c10",
  },
  crossroadTree: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  crossroadTreeTop: {
    width: "74%",
    height: "74%",
    borderRadius: 8,
    backgroundColor: "#123c29",
    transform: [{ rotate: "45deg" }],
  },
  crossroadTreeTrunk: {
    width: 8,
    height: 12,
    marginTop: -6,
    backgroundColor: "#56351e",
  },
  crossroadRock: {
    position: "absolute",
    width: 18,
    height: 10,
    borderRadius: 6,
    backgroundColor: "#32423e",
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
  mapChoicePink: {
    borderColor: "#ff69b4",
    backgroundColor: "rgba(255, 105, 180, 0.1)",
  },
  mapChoiceRed: {
    borderColor: "#e01f2d",
    backgroundColor: "rgba(224, 31, 45, 0.1)",
  },
  mapChoiceText: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  mapChoicePinkText: {
    color: "#ff69b4",
  },
  mapChoiceRedText: {
    color: "#e01f2d",
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
  mapCrystalTap: {
    position: "absolute",
    left: "44%",
    top: "43%",
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    elevation: 30,
  },
  mapCrystal: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    backfaceVisibility: "visible",
    shadowColor: "#d17aff",
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  mapCrystalImage: { width: "100%", height: "100%" },
  mapWarningSignTap: {
    position: "absolute",
    left: "58%",
    top: "18%",
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 29,
    elevation: 29,
  },
  mapWarningSignImage: { width: "100%", height: "100%" },
  crystalModalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    padding: 20,
  },
  crystalModal: {
    width: "100%",
    maxWidth: 440,
    gap: 12,
    borderWidth: 2,
    borderColor: "#b967ff",
    backgroundColor: "#08020f",
    padding: 18,
  },
  crystalModalKicker: {
    color: "#d9a7ff",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 3,
  },
  crystalModalTitle: {
    color: "#fff",
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "900",
  },
  crystalModalHelp: {
    color: "#cfcfcf",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  crystalSettingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.28)",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    padding: 12,
  },
  crystalSettingText: {
    flex: 1,
    gap: 4,
  },
  crystalSettingLabel: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  crystalSettingValue: {
    color: "#d9a7ff",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "900",
  },
  crystalStepButtons: {
    flexDirection: "row",
    gap: 6,
  },
  crystalStepButton: {
    minWidth: 52,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "#000",
    paddingVertical: 8,
    alignItems: "center",
  },
  crystalStepButtonText: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  crystalCharmButton: {
    borderWidth: 2,
    borderColor: "#ff69b4",
    backgroundColor: "#2c0626",
    paddingVertical: 14,
    alignItems: "center",
  },
  crystalCharmButtonActive: {
    backgroundColor: "#d92078",
  },
  crystalCharmButtonText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "900",
  },
  crystalModalNote: {
    color: "#ffb6d8",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  crystalCloseButton: {
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#000",
    paddingVertical: 12,
    alignItems: "center",
  },
  crystalCloseButtonText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "900",
  },
  warningModal: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "90%",
    borderWidth: 2,
    borderColor: "#d99a45",
    backgroundColor: "#100a05",
  },
  warningModalContent: {
    gap: 12,
    padding: 18,
  },
  warningModalKicker: {
    color: "#e9bd72",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 3,
  },
  warningModalTitle: {
    color: "#ffe0a3",
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "900",
  },
  warningSection: {
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: "rgba(217, 154, 69, 0.45)",
    paddingTop: 10,
  },
  succubusInfoSection: {
    gap: 6,
    borderWidth: 1,
    borderColor: "#b967ff",
    backgroundColor: "rgba(83, 25, 116, 0.22)",
    padding: 10,
  },
  succubusInfoTitle: {
    color: "#e0a7ff",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
  },
  succubusGrowthText: {
    color: "#e9d7f3",
    fontSize: 12,
    lineHeight: 19,
  },
  warningSectionTitle: {
    color: "#ffd08a",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
  },
  warningBody: {
    color: "#f5ead7",
    fontSize: 13,
    lineHeight: 20,
  },
  defeatWarningSection: {
    gap: 5,
    borderWidth: 1,
    borderColor: "#e53945",
    backgroundColor: "rgba(130, 0, 12, 0.24)",
    padding: 10,
  },
  defeatWarningTitle: {
    color: "#ff5360",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
  },
  defeatWarningText: {
    color: "#ff6670",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "800",
  },
  warningCloseButton: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d99a45",
    backgroundColor: "#3a230e",
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  warningCloseButtonText: {
    color: "#ffe0a3",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "900",
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
    flex: 1,
    minHeight: 96,
    flexDirection: "row",
    gap: 6,
  },
  statusPanel: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#111",
    padding: 7,
    gap: 1,
  },
  operationPanel: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#111",
    padding: 7,
    gap: 1,
  },
  statusBig: {
    color: "#fff",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
  },
  statusText: {
    color: "#fff",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
  },
  dangerStatus: {
    color: "#d9202a",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
  },
  statusSubText: {
    color: "#aaa",
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "900",
  },
  charmStatusText: {
    color: "#ff69b4",
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "900",
  },
  mapMessageBox: {
    position: "absolute",
    right: 12,
    bottom: 12,
    left: 12,
    zIndex: 20,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    padding: 14,
    minHeight: 72,
    gap: 8,
  },
  mapMessage: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "900",
  },
  recoveryMessage: {
    color: "#7CFF8B",
  },
  mapTapGuide: {
    alignSelf: "flex-end",
    color: "#aaa",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  battleScreen: {
    flex: 1,
    padding: 0,
    backgroundColor: "#050505",
  },
  kicker: {
    color: "#ff69b4",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
  },
  battleHeader: {
    position: "absolute",
    top: 10,
    right: 10,
    left: 10,
    zIndex: 20,
    gap: 4,
    backgroundColor: "rgba(0, 0, 0, 0.58)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  battleTitle: {
    color: "#fff",
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "900",
  },
  gameOverTitle: {
    color: "#d9202a",
    letterSpacing: 2,
  },
  battleStage: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    borderWidth: 0,
    backgroundColor: "#140914",
  },
  lossBattleStage: {
    flex: 1,
    minHeight: 0,
    gap: 0,
    borderWidth: 0,
    backgroundColor: "#050505",
  },
  enemyOverlay: {
    position: "absolute",
    top: 82,
    right: 12,
    left: 12,
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  enemyOverlayName: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  enemyOverlayHp: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  enemyLarge: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  enemyLargeImage: {
    width: "100%",
    height: "100%",
  },
  enemyLargeEventImage: {
    width: "100%",
    height: "100%",
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
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    overflow: "hidden",
    borderWidth: 0,
    backgroundColor: "#000",
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
  battleStageMessage: {
    position: "absolute",
    right: 12,
    bottom: 12,
    left: 12,
    zIndex: 4,
    minHeight: 98,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.78)",
    padding: 12,
    gap: 6,
  },
  battleChoiceOverlay: {
    position: "absolute",
    right: 12,
    bottom: 12,
    left: 12,
    zIndex: 5,
    flexDirection: "row",
    gap: 10,
  },
  lossMessageBox: {
    minHeight: 150,
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
  battleBottomRow: {
    flex: 0.42,
    minHeight: 126,
    flexDirection: "row",
    gap: 6,
  },
  commandPanel: {
    flex: 1.1,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(17, 17, 17, 0.92)",
    padding: 7,
    gap: 5,
  },
  playerStatusPanel: {
    flex: 0.9,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(17, 17, 17, 0.92)",
    padding: 7,
    gap: 5,
  },
  panelTitle: {
    color: "#ff69b4",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 3,
  },
  statusBattleBig: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  charmedMark: {
    alignSelf: "flex-start",
    color: "#ff69b4",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: "#ff69b4",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  normalMark: {
    alignSelf: "flex-start",
    color: "#aaa",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: "#555",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  statusEffectRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#ff69b4",
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: "rgba(255, 105, 180, 0.1)",
  },
  statusEffectMark: {
    width: 22,
    height: 22,
  },
  statusEffectLabel: {
    color: "#ff69b4",
    fontSize: 8,
    lineHeight: 12,
    fontWeight: "900",
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
  tapGuide: {
    alignSelf: "flex-end",
    color: "#aaa",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  gameOverMessage: {
    color: "#d9202a",
    fontWeight: "900",
  },
  pendingGameOverMessage: {
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
