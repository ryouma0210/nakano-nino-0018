import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Animated, Image as NativeImage, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { contractService } from "@/services/gameRoomService";
import { AppText } from "@/components/AppText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppAudio } from "@/audio/AudioProvider";
import { pointRepository, rewardRepository } from "@/repositories/rewardRepository";
import { toDateKey, toDateTimeKey } from "@/utils/date";
import {
  ATTACK_MP_COST, charmDefenseCount, clamp, createSlimes, entryPosition, ESCAPE_MP_COST,
  facingForEntry, isNear, startPositions,
  succubusForLevel, type Direction, type MapArea, type MapPosition, type MapSlime,
  type SuccubusStage,
} from "@/features/outside/gameLogic";
import {
  dailyPointDateKey, dailyPointKey, deepSuccubusMarkKey, hpKey, initializeDailyOutsidePoints,
  initializeDeepSuccubusMark,
  initializeLevel, initializePlayerStat, initializeSuccubusAbsorbBonus, initializeSuccubusMark,
  levelDateKey, levelKey, mpKey, saveSetting,
  succubusAbsorbDateKey, succubusAbsorbKey, succubusMarkKey,
} from "@/features/outside/gameState";
import { lossStageComments } from "@/features/outside/lossDialogue";
import { recordOutsideAchievement } from "@/features/outside/achievements";
import { CenterArea, LeftArea, RightArea, TopArea } from "@/components/outside/areas";

type Phase = "explore" | "battle" | "result" | "loss";
type LossEventKind = "tail" | "chest" | "back" | "foot";
type BattleCommand = "attack" | "defend" | "grip" | "stroke" | "nipple" | LossEventKind | "run";
type BattleMenu = "root" | "fight" | "surrender";
type TemptationEffect = "kiss" | "heart" | null;
type BattleEnemyImage = "battle" | "status" | LossEventKind;
type BattleStatus = {
  hp: number;
  mp: number;
  enemyHp: number;
  lastLossKind: LossEventKind;
};
type MapStep = 0 | 1 | 2;
type BattleAilments = { bound: boolean; weakened: boolean; illusion: boolean; feared: boolean };
const noBattleAilments: BattleAilments = { bound: false, weakened: false, illusion: false, feared: false };
const LOSS_MEMORY_STORAGE_KEY = "nino-room:outside-loss-memories";
type LossMemoryKind = Exclude<LossEventKind, "tail">;

const crystalPosition: MapPosition = { x: 17, y: 65 };
const crystalExitPosition: MapPosition = { x: 30, y: 65 };
const warningSignPosition: MapPosition = { x: 66, y: 31 };
const warningSignExitPosition: MapPosition = { x: 66, y: 43 };
const pixelSprites = {
  playerFront: require("../../assets/characters/outside-pixels/player-front-dot-v2.png"),
  playerBack: require("../../assets/characters/outside-pixels/player-back-dot.png"),
  playerLeft: require("../../assets/characters/outside-pixels/player-left-dot.png"),
  playerRight: require("../../assets/characters/outside-pixels/player-right-dot.png"),
  door: require("../../assets/characters/outside-pixels/door-dot.png"),
  slime: require("../../assets/characters/outside-pixels/slime-dot.png"),
  heartMark: require("../../assets/ui/outside-heart-mark.png"),
  kissMark: require("../../assets/ui/outside-kiss-mark.png"),
  crystal: require("../../assets/ui/outside-crystal.png"),
  succubusMark: require("../../assets/ui/outside-succubus-mark.png"),
  statusFear: require("../../assets/ui/outside-status-fear.png"),
  statusWeakness: require("../../assets/ui/outside-status-weakness.png"),
  statusIllusion: require("../../assets/ui/outside-status-illusion.png"),
  statusObedience: require("../../assets/ui/outside-status-obedience.png"),
  statusDeepMark: require("../../assets/ui/outside-status-deep-mark.png"),
  warningSign: require("../../assets/characters/outside-pixels/warning-sign.png"),
  mapCenter: require("../../assets/characters/outside-pixels/outside-map-center-crossroad-v2.png"),
  mapLeft: require("../../assets/characters/outside-pixels/outside-map-left.png"),
  mapRight: require("../../assets/characters/outside-pixels/outside-map-right.png"),
  succubus: {
    beginner: require("../../assets/characters/outside-events/beginner-battle-v2.png"),
    middle: require("../../assets/characters/outside-events/middle-battle-v2.png"),
    queen: require("../../assets/characters/outside-events/queen-battle-v2.png"),
  },
  statusAttack: {
    beginner: require("../../assets/characters/outside-events/beginner-status-attack.png"),
    middle: require("../../assets/characters/outside-events/middle-status-attack.png"),
    queen: require("../../assets/characters/outside-events/queen-status-attack.png"),
  },
  events: {
    beginner: {
      tail: require("../../assets/characters/outside-events/beginner-tail.png"),
      chest: require("../../assets/characters/outside-events/beginner-chest_01.jpg"),
      back: require("../../assets/characters/outside-events/beginner-overlook_01.jpg"),
      foot: require("../../assets/characters/outside-events/beginner-foot_01.jpg"),
    },
    middle: {
      tail: require("../../assets/characters/outside-events/middle-tail.png"),
      chest: require("../../assets/characters/outside-events/middle-chest_01.jpg"),
      back: require("../../assets/characters/outside-events/middle-overlook_01.jpg"),
      foot: require("../../assets/characters/outside-events/middle-foot_01.jpg"),
    },
    queen: {
      tail: require("../../assets/characters/outside-events/queen-tail.png"),
      chest: require("../../assets/characters/outside-events/queen-chest_01.jpg"),
      back: require("../../assets/characters/outside-events/queen-overlook_01.jpg"),
      foot: require("../../assets/characters/outside-events/queen-foot_01.jpg"),
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

function StatGauge({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const percent = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const gaugeColor = label === "HP"
    ? percent >= 80
      ? "#35c759"
      : percent >= 30
        ? "#f2c94c"
        : "#e3364f"
    : color;
  return (
    <View style={styles.statGaugeWrap}>
      <View style={styles.statGaugeLabelRow}>
        <AppText style={styles.statGaugeLabel}>{label}</AppText>
        <AppText style={styles.statGaugeValue}>{Math.round(value)} / {max}</AppText>
      </View>
      <View style={styles.statGaugeTrack}>
        <View style={[styles.statGaugeFill, { width: `${percent}%`, backgroundColor: gaugeColor }]} />
      </View>
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
    appear: "初級サキュバスが現れました。普通に戦えば勝てるはず……油断しないでください♡",
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

const passiveActionQuips: Record<SuccubusStage, Record<"grip" | "stroke" | "nipple", string>> = {
  beginner: {
    grip: "「えっ、自分から握ってるの？　戦うよりそっちが大事なんだ、ざぁこ♡」",
    stroke: "「シコシコしてる場合？　そんなに余裕ないくせに、ほんと馬鹿だね♡」",
    nipple: "「乳首まで弄り始めたの？　戦う気ゼロじゃん。そんな弱点、見逃すわけないでしょ♡」",
  },
  middle: {
    grip: "「武器ではなく、そこを握るのね。自分から隙を見せるなんて愚かだわ」",
    stroke: "「私の前で自分を慰めるの？　では、その無防備な姿へご褒美をあげる」",
    nipple: "「自分から乳首を弄って感じているのね。そこまで隙だらけなら、遠慮なく堕としてあげる」",
  },
  queen: {
    grip: "「戦場で何を握っているのです。そこまで判断力を失った者に慈悲はありません」",
    stroke: "「女王の御前でその醜態……よろしい。身の程を攻撃で教えてあげましょう」",
    nipple: "「女王の前で自ら乳首を弄るとは、随分と従順ですね。その弱さに相応しい罰を与えましょう」",
  },
};

const victoryMapQuips: Record<SuccubusStage, string> = {
  beginner: "「うそ……負けたの？　次は絶対、誘惑してあげるんだから♡」",
  middle: "「今回はあなたの勝ちね。でも、次も耐えられるかしら？」",
  queen: "「見事です。今日だけは帰ることを許してあげましょう」",
};

const defeatMapQuips: Record<SuccubusStage, string> = {
  beginner: "「沢山レベルありがとう♡　もっと弱くなって、また会いに来てね♡」",
  middle: "「たっぷり吸わせてくれてありがとう♡　その情けない姿で、また私に挑みに来るのかしら？」",
  queen: "「力を捧げてくれたこと、感謝します。弱くなったあなたが再び敗北しに来る日を楽しみにしています」",
};

const enemyAttackDamage: Record<SuccubusStage, number> = {
  beginner: 10,
  middle: 20,
  queen: 50,
};
const enemyMaxHp: Record<SuccubusStage, number> = { beginner: 100, middle: 300, queen: 500 };

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
  const insets = useSafeAreaInsets();
  const fadeOpacity = useRef(new Animated.Value(0)).current;
  const [level, setLevel] = useState(initializeLevel);
  const [playerHp, setPlayerHp] = useState(() => initializePlayerStat(hpKey, 100));
  const [playerMp, setPlayerMp] = useState(() => initializePlayerStat(mpKey, 100, 0));
  const [dailyOutsidePoints, setDailyOutsidePoints] = useState(initializeDailyOutsidePoints);
  const [availablePoints, setAvailablePoints] = useState(() => rewardRepository.balance().available);
  const [succubusAbsorbBonus, setSuccubusAbsorbBonus] = useState(initializeSuccubusAbsorbBonus);
  const [hasSuccubusMark, setHasSuccubusMark] = useState(initializeSuccubusMark);
  const [deepSuccubusMark, setDeepSuccubusMark] = useState(initializeDeepSuccubusMark);
  const [slaveContractSigned, setSlaveContractSigned] = useState(false);
  const [battleAilments, setBattleAilments] = useState<BattleAilments>(noBattleAilments);
  const [returnCharmTurns, setReturnCharmTurns] = useState(0);
  const [phase, setPhase] = useState<Phase>("explore");
  const [mapArea, setMapArea] = useState<MapArea>("center");
  const [isMovingArea, setIsMovingArea] = useState(false);
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapStep, setMapStep] = useState<MapStep>(0);
  const [mapPosition, setMapPosition] = useState<MapPosition>(startPositions.center);
  const [playerFacing, setPlayerFacing] = useState<Direction>("down");
  const [crystalOpen, setCrystalOpen] = useState(false);
  const [warningSignOpen, setWarningSignOpen] = useState(false);
  const [crystalRotation, setCrystalRotation] = useState(0);
  const [slimes, setSlimes] = useState<MapSlime[]>(() => createSlimes());
  const [charmTurns, setCharmTurns] = useState(0);
  const [temptationGauge, setTemptationGauge] = useState(0);
  const [message, setMessage] = useState(
    "館の外へ出た。家に帰るには、外にいるサキュバスの誘惑を切り抜ける必要がある。",
  );
  const [battleMenu, setBattleMenu] = useState<BattleMenu>("root");
  const [battleAwaitingChoice, setBattleAwaitingChoice] = useState(false);
  const [pendingBattleMessage, setPendingBattleMessage] = useState<string | null>(null);
  const [pendingGameOver, setPendingGameOver] = useState<{
    kind: LossEventKind;
    reason: string;
    surrendered: boolean;
  } | null>(null);
  const [, setTemptationEffect] = useState<TemptationEffect>(null);
  const [battleEnemyImage, setBattleEnemyImage] = useState<BattleEnemyImage>("battle");
  const [encounterStage, setEncounterStage] = useState<SuccubusStage>("beginner");
  const [lossEventIndex, setLossEventIndex] = useState(0);
  const [isLossReplay, setIsLossReplay] = useState(false);
  const [unlockedLossMemories, setUnlockedLossMemories] = useState<string[]>([]);
  const [lossSummary, setLossSummary] = useState("");
  const [resultSummary, setResultSummary] = useState("");
  const [queuedMapMessages, setQueuedMapMessages] = useState<string[]>([]);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [playerStatusModalOpen, setPlayerStatusModalOpen] = useState(false);
  const [levelDownFlash, setLevelDownFlash] = useState({ visible: false, left: 18, top: 22 });
  const playerShake = useRef(new Animated.Value(0)).current;
  const enemyShake = useRef(new Animated.Value(0)).current;
  const [damageFlash, setDamageFlash] = useState<{ target: "player" | "enemy"; amount: number } | null>(null);
  const [battleMessageHeight, setBattleMessageHeight] = useState(98);
  const damageFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingDamageQueue, setPendingDamageQueue] = useState<{ target: "player" | "enemy"; amount: number }[]>([]);
  const [battle, setBattle] = useState<BattleStatus>({
    hp: playerHp,
    mp: playerMp,
    enemyHp: 100,
    lastLossKind: "tail",
  });
  const [displayedBattle, setDisplayedBattle] = useState<BattleStatus>({ hp: playerHp, mp: playerMp, enemyHp: 100, lastLossKind: "tail" });
  const [displayedCharmTurns, setDisplayedCharmTurns] = useState(0);
  const [displayedTemptationGauge, setDisplayedTemptationGauge] = useState(0);
  const [displayedBattleAilments, setDisplayedBattleAilments] = useState<BattleAilments>(noBattleAilments);

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

  useFocusEffect(useCallback(() => {
    let active = true;
    contractService.load().then((contract) => {
      if (active) setSlaveContractSigned(Boolean(contract.signedAt));
    });
    return () => { active = false; };
  }, []));

  useEffect(() => {
    AsyncStorage.getItem(LOSS_MEMORY_STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setUnlockedLossMemories(parsed.filter((value): value is string => typeof value === "string"));
      })
      .catch(console.error);
  }, []);

  useEffect(() => pointRepository.subscribe(() => {
    setAvailablePoints(rewardRepository.balance().available);
  }), []);

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
    if (battleEnemyImage === "status") return pixelSprites.statusAttack[activeSuccubusStage];
    return pixelSprites.events[activeSuccubusStage][battleEnemyImage];
  }, [activeSuccubusStage, battleEnemyImage]);
  const lossImageIndex = lossEventIndex < 5 ? 0 : lossEventIndex < 15 ? 1 : 2;
  const lossMessage = phase === "loss"
    ? [
      lossEventComments[battle.lastLossKind === "tail" ? "chest" : battle.lastLossKind][lossEventIndex]
      ?? lossEventComments.chest[0],
      lossStageComments[activeSuccubusStage][battle.lastLossKind === "tail" ? "chest" : battle.lastLossKind][lossEventIndex]
      ?? lossStageComments[activeSuccubusStage].chest[0],
    ].filter(Boolean).join("\n")
    : message;
  const isSuccubusMapQuip = [
    ...Object.values(victoryMapQuips),
    ...Object.values(defeatMapQuips),
  ].includes(message);
  const hasMapStatus = charmTurns > 0
    || battleAilments.bound
    || battleAilments.weakened
    || battleAilments.illusion
    || battleAilments.feared
    || hasSuccubusMark
    || deepSuccubusMark
    || slaveContractSigned;
  const displayedPlayerFacing: Direction = mapStep > 0 ? "up" : playerFacing;

  useEffect(() => () => {
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    if (damageFlashTimerRef.current) clearTimeout(damageFlashTimerRef.current);
  }, []);

  useEffect(() => {
    if (phase !== "loss" || lossEventIndex < 14) {
      setLevelDownFlash((current) => ({ ...current, visible: false }));
      return undefined;
    }
    const timer = setInterval(() => {
      setLevelDownFlash((current) => ({
        visible: !current.visible,
        left: 8 + Math.round(Math.random() * 58),
        top: 12 + Math.round(Math.random() * 58),
      }));
    }, 430);
    return () => clearInterval(timer);
  }, [lossEventIndex, phase]);

  useEffect(() => {
    if (phase === "loss") {
      setBgmMode("outsideCharm");
      return () => {
        stopEffect("trainingStart");
        stopEffect("outsideLossRhythm");
        stopEffect("ejaculation");
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
    if (phase === "explore" && (charmTurns > 0 || hasSuccubusMark || deepSuccubusMark)) {
      setBgmMode("outsideCharm");
      return () => {
        stopEffect("trainingStart");
        setBgmMode("default");
      };
    }
    if (phase === "explore" && mapArea !== "top") {
      setBgmMode("outsideBright");
      return () => setBgmMode("default");
    }
    setBgmMode("default");
    stopEffect("trainingStart");
    return () => {
      stopEffect("trainingStart");
      setBgmMode("default");
    };
  }, [charmTurns, deepSuccubusMark, hasSuccubusMark, mapArea, phase, playEffect, setBgmMode, stopEffect]);

  useEffect(() => {
    const permanentControl = hasSuccubusMark || deepSuccubusMark || slaveContractSigned;
    const playEarLick = phase === "battle"
      ? charmTurns > 0 || battleAilments.illusion || permanentControl
      : phase === "explore" && (charmTurns > 0 || hasSuccubusMark || deepSuccubusMark);
    const playNipple = phase === "battle"
      && (battleAilments.bound || battleAilments.weakened || permanentControl);

    if (playEarLick) playEffect("outsideEarLick");
    else stopEffect("outsideEarLick");
    if (playNipple) playEffect("outsideNipple");
    else stopEffect("outsideNipple");

    return () => {
      stopEffect("outsideEarLick");
      stopEffect("outsideNipple");
    };
  }, [battleAilments.bound, battleAilments.illusion, battleAilments.weakened, charmTurns, deepSuccubusMark, hasSuccubusMark, phase, playEffect, slaveContractSigned, stopEffect]);

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
    setCharmTurns(initialCharmTurns ?? charmTurns);
    setTemptationGauge((initialCharmTurns ?? charmTurns) > 0 ? 100 : temptationGauge);
    const initialBattle = {
      hp: playerHp,
      mp: playerMp,
      enemyHp: enemyMaxHp[succubus.stage],
      lastLossKind: "tail",
    } satisfies BattleStatus;
    setBattle(initialBattle);
    setDisplayedBattle(initialBattle);
    setDisplayedCharmTurns(initialCharmTurns ?? charmTurns);
    setDisplayedTemptationGauge((initialCharmTurns ?? charmTurns) > 0 ? 100 : temptationGauge);
    setDisplayedBattleAilments(noBattleAilments);
    setBattleAilments(noBattleAilments);
    setMessage(`${openingMessage ?? "サキュバスがこちらに近づいてきた。"}\n${battleLines[succubus.stage].appear}`);
  }

  function advanceMap() {
    if (phase !== "explore" || mapArea !== "center") return;
    moveMap("top");
  }

  function moveMap(nextArea: MapArea) {
    if (phase !== "explore" || isMovingArea || nextArea === mapArea) return;
    const fromArea = mapArea;
    setIsMovingArea(true);
    setMessage("");
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    moveTimerRef.current = setTimeout(() => {
      setMapArea(nextArea);
      setMapStep(0);
      setCrystalOpen(false);
      setMapPosition(entryPosition(fromArea, nextArea));
      setPlayerFacing(facingForEntry(fromArea, nextArea));
      setIsMovingArea(false);
      if (nextArea === "left") {
        setCharmTurns(0);
        setTemptationGauge(0);
        setBattleAilments(noBattleAilments);
        setHasSuccubusMark(false);
        setDeepSuccubusMark(false);
        saveSetting(succubusMarkKey, "0");
        saveSetting(deepSuccubusMarkKey, "0");
        setPlayerHp(100);
        setPlayerMp(100);
        saveSetting(hpKey, "100");
        saveSetting(mpKey, "100");
        setBattle((current) => ({
          ...current,
          hp: 100,
          mp: 100,
        }));
        setMessage(`浄化の水辺に入った。\nHPとMPが全回復し、状態異常も解除されました。${slaveContractSigned ? "\n※奴隷契約による服従は解除されません。" : ""}`);
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
    }, 450);
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
      if (next.y <= 18 && next.x >= 40 && next.x <= 60) {
        moveMap("top");
        return;
      }
      if (next.y >= 88 && next.x >= 40 && next.x <= 60) {
        router.replace("/(tabs)");
        return;
      }
      if (next.x <= 14 && next.y >= 40 && next.y <= 62) {
        moveMap("left");
        return;
      }
      if (next.x >= 82 && next.y >= 40 && next.y <= 62) {
        moveMap("right");
        return;
      }
    }

    if (mapArea === "left" && next.x >= 86 && next.y >= 40 && next.y <= 62) {
      moveMap("center");
      return;
    }
    if (mapArea === "right" && next.x <= 14 && next.y >= 40 && next.y <= 62) {
      moveMap("center");
      return;
    }
    if (mapArea === "top") {
      if (next.y >= 88 && next.x >= 40 && next.x <= 60) {
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
    if (queuedMapMessages.length > 0) {
      const [next, ...rest] = queuedMapMessages;
      setQueuedMapMessages(rest);
      setMessage(next ?? "");
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
      if (hasSuccubusMark || deepSuccubusMark || slaveContractSigned) {
        const forcedLines: Record<SuccubusStage, string> = {
          beginner: "「戦うふりもできない弱者さん、最初から負けに来たんだね♡」",
          middle: "「その印を抱えて来た時点で、結末は決まっているわ」",
          queen: "「服従した者に選択権はありません。望みどおり敗北を与えましょう」",
        };
        startEncounter(forcedLines[succubus.stage]);
        return;
      }
      startEncounter("サキュバスと目が合った瞬間、耳元に甘い吐息が触れた。\n耳舐め攻撃を受け、魅了で戦闘が始まった。", charmDefenseCount(succubus.stage));
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
    setTemptationGauge(0);
    setBattleAilments(noBattleAilments);
    setHasSuccubusMark(false);
    setDeepSuccubusMark(false);
    saveSetting(succubusMarkKey, "0");
    saveSetting(deepSuccubusMarkKey, "0");
    setPlayerHp(100);
    setPlayerMp(100);
    saveSetting(hpKey, "100");
    saveSetting(mpKey, "100");
    setBattle((current) => ({
      ...current,
      hp: 100,
      mp: 100,
    }));
    recordOutsideAchievement("purify");
    setMessage(`浄化の水辺に触れた。\nHPとMPが全回復し、状態異常も解除されました。${slaveContractSigned ? "\n※奴隷契約による服従は解除されません。" : ""}`);
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
    setTemptationGauge(100);
    setMessage("設定で魅了になりました。\n戦闘中に防御を重ねるか、左の水辺で浄化できます。");
  }

  function activateCrystalSuccubusMark() {
    setHasSuccubusMark(true);
    saveSetting(succubusMarkKey, "1");
    setMessage("設定で淫紋モードになりました。\n戦闘と逃走が封じられ、左の水辺でのみ浄化できます。");
  }

  function activateCrystalDeepMark() {
    setHasSuccubusMark(true);
    setDeepSuccubusMark(true);
    saveSetting(succubusMarkKey, "1");
    saveSetting(deepSuccubusMarkKey, "1");
    setMessage("設定で刻印深化モードになりました。\n敗北時の吸収基準が100になり、左の水辺でのみ浄化できます。");
  }

  async function releaseSlaveContractAtCrystal() {
    await contractService.clear();
    setSlaveContractSigned(false);
    setCrystalOpen(false);
    setMessage("クリスタルの力で奴隷契約を解除しました。\n服従状態も解除され、再び戦闘と逃走を選べます。");
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
    recordOutsideAchievement("slimeDefeat");
    setDailyOutsidePoints(nextDailyPoints);
    saveSetting(dailyPointDateKey, today);
    saveSetting(dailyPointKey, String(nextDailyPoints));
    setLevel(nextLevel);
    if (nextLevel > level) playEffect("levelUp");
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
  }, [dailyOutsidePoints, level, mapArea, phase, playEffect]);

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

  function applyGameOver(kind: LossEventKind, reason: string, surrendered = false) {
    const today = toDateKey();
    const grantsSuccubusMark = surrendered || level === 1;
    const deepensMark = hasSuccubusMark && grantsSuccubusMark;
    const absorptionTarget = deepSuccubusMark || deepensMark ? 100 : 50;
    const absorbedLevel = surrendered ? level : level <= 1 ? 0 : Math.min(absorptionTarget, level);
    const nextPlayerLevel = surrendered ? 1 : Math.max(1, level - absorptionTarget);
    const missingLevel = surrendered ? 0 : absorptionTarget - absorbedLevel;
    const nextSuccubusLevel = Math.min(100, succubus.level + absorbedLevel);
    const pointsBeforeDefeat = rewardRepository.balance().available;
    recordOutsideAchievement("defeat", succubus.stage);
    if (surrendered) recordOutsideAchievement("surrender");
    const absorbedPoints = surrendered ? (deepensMark ? 100 : 50) : missingLevel;
    const memoryKind: LossMemoryKind = kind === "tail" ? "chest" : kind;
    const memoryKey = `${succubus.stage}:${memoryKind}`;
    setUnlockedLossMemories((current) => {
      if (current.includes(memoryKey)) return current;
      const next = [...current, memoryKey];
      AsyncStorage.setItem(LOSS_MEMORY_STORAGE_KEY, JSON.stringify(next)).catch(console.error);
      return next;
    });
    setIsLossReplay(false);
    setEncounterStage(succubus.stage);
    setLossEventIndex(0);
    setBattleMenu("root");
    setTemptationEffect(null);
    setBattleEnemyImage(kind);
    setPhase("loss");
    setCharmTurns(0);
    setTemptationGauge(0);
    setReturnCharmTurns(surrendered ? charmDefenseCount(succubus.stage) : 0);
    if (grantsSuccubusMark) {
      recordOutsideAchievement("mark");
      setHasSuccubusMark(true);
      saveSetting(succubusMarkKey, "1");
    }
    if (deepensMark) {
      recordOutsideAchievement("deepMark");
      setDeepSuccubusMark(true);
      saveSetting(deepSuccubusMarkKey, "1");
    }
    setBattle((current) => ({ ...current, hp: 0, mp: Math.max(0, current.mp - 100), lastLossKind: kind }));
    setSuccubusAbsorbBonus(nextSuccubusLevel);
    saveSetting(succubusAbsorbDateKey, today);
    saveSetting(succubusAbsorbKey, String(nextSuccubusLevel));
    if (absorbedPoints > 0) {
      pointRepository.award(
        `outside-gameover:${toDateTimeKey()}`,
        -absorbedPoints,
        surrendered
          ? "外RPGで降参し50ポイントをサキュバスに吸収された"
          : "外RPGでレベル不足分のポイントをサキュバスに吸収された",
      );
    }
    const pointsAfterDefeat = rewardRepository.balance().available;
    setLossSummary(
      surrendered
        ? `自ら降参したため、全レベルとなるLv.${absorbedLevel}と50Ptを吸収された。\nサキュバスのレベルが${succubus.level} → ${nextSuccubusLevel}になった。\n現在：Lv.1 / HP1 / MP1 / 魅了中\n所持${pointsBeforeDefeat}Pt → ${pointsAfterDefeat}Ptになりました。\n淫紋を刻まれました。淫紋と魅了を解除できるのは左の水辺だけです。`
        : `レベルドレインにより、Lv.${absorbedLevel}を吸収された。\n${missingLevel > 0 ? `不足分${missingLevel}の代わりに、所持Ptから${absorbedPoints}Ptを吸収された。` : `${absorptionTarget}レベル吸収されたため、所持Ptの吸収はありません。`}\nサキュバスのレベルが${succubus.level} → ${nextSuccubusLevel}になった。\n現在：Lv.${nextPlayerLevel} / HP1 / MP1\n所持${pointsBeforeDefeat}Pt → ${pointsAfterDefeat}Ptになりました。${deepensMark ? "\n淫紋が再び刻まれ、刻印深化しました。次回の吸収基準は100です。" : grantsSuccubusMark ? "\n吸収できるレベルがないため、淫紋を刻まれました。解除できるのは左の水辺だけです。" : ""}`,
    );
    savePlayerStats(nextPlayerLevel, 1, 1);
    setMessage(reason);
  }

  function specialDefeatQuip() {
    if (deepSuccubusMark) {
      return "「刻印を深められても、まだ負けに来るなんて救いようがありませんね。今度こそ何も残らないほど吸い尽くしてあげます」";
    }
    if (hasSuccubusMark) {
      return "「淫紋を刻まれたまま、また負けたの？　もう自分が誰のものか、体のほうがよく分かっているみたいですね♡」";
    }
    if (level === 1) {
      return "「もう奪えるレベルすら残っていないの？　そこまで弱いのに挑んでくるなんて、本当に学習できないんですね♡」";
    }
    return "「これで終わりです。あなたの負けを、その体にしっかり覚えさせてあげます」";
  }

  function queueGameOver(
    kind: LossEventKind,
    reason: string,
    finalAttackMessage: string,
    surrendered = false,
  ) {
    setPendingGameOver({ kind, reason, surrendered });
    setBattleMenu("root");
    setBattleAwaitingChoice(false);
    setMessage(`${finalAttackMessage}\n\n${specialDefeatQuip()}\nタップして敗北シーンへ。`);
  }

  function showEnemyTurn(
    quip: string,
    outcome: string,
    nextHp: number,
    kind: LossEventKind,
  ) {
    const receivedDamage = Math.max(0, Math.round(battle.hp - nextHp));
    if (receivedDamage > 0) setPendingDamageQueue((items) => [...items, { target: "player", amount: receivedDamage }]);
    if (nextHp <= 0) {
      setPendingGameOver({ kind, reason: battleLines[succubus.stage].lose[kind], surrendered: false });
    }
    setMessage(quip);
    setPendingBattleMessage(
      nextHp <= 0
        ? `${outcome}\n\n${specialDefeatQuip()}\nタップして敗北シーンへ。`
        : outcome,
    );
  }

  function randomLossKind(): LossEventKind {
    const events: LossEventKind[] = ["chest", "back", "foot"];
    return events[Math.floor(Math.random() * events.length)] ?? "chest";
  }

  function shouldUseNormalAttack() {
    return Math.random() < 0.35;
  }

  function applyEnemyAilment(kind: LossEventKind) {
    if (kind === "chest") { addTemptation(25); setBattleAilments((v) => ({ ...v, illusion: true })); setTemptationEffect("heart"); return "幻惑"; }
    if (kind === "back") { setBattleAilments((v) => ({ ...v, weakened: true })); setCharmTurns(charmDefenseCount(succubus.stage)); setTemptationGauge(100); setTemptationEffect("kiss"); return "魅了＆衰弱"; }
    if (kind === "foot") { addTemptation(25); setBattleAilments((v) => ({ ...v, feared: true })); setTemptationEffect("heart"); return "恐怖"; }
    setBattleAilments((v) => ({ ...v, bound: true }));
    return "束縛";
  }

  function addTemptation(amount: number) {
    setTemptationGauge((current) => {
      const next = Math.min(100, current + amount);
      if (next >= 100) {
        if (current < 100) recordOutsideAchievement("temptationMax");
        setCharmTurns(charmDefenseCount(succubus.stage));
        setTemptationEffect("heart");
      }
      return next;
    });
  }

  function applyStatusOnlyAttack() {
    recordOutsideAchievement("statusAttack");
    const statusCandidates: LossEventKind[] = ["tail", "chest", "back", "foot"];
    const randomStatus = statusCandidates[Math.floor(Math.random() * statusCandidates.length)] ?? "tail";
    const label = applyEnemyAilment(randomStatus);
    setCharmTurns(charmDefenseCount(succubus.stage));
    setTemptationGauge(100);
    setTemptationEffect("heart");
    setBattleEnemyImage("status");
    return label === "魅了＆衰弱" ? label : `魅了＆${label}`;
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

    if (hasSuccubusMark && !["chest", "back", "foot"].includes(command)) {
      setMessage("淫紋に支配され、戦うことも逃げることもできない。降参するしかありません。");
      return;
    }
    if (slaveContractSigned && (command === "attack" || command === "run")) {
      setMessage("奴隷契約による服従状態のため、戦うことも逃げることもできない。");
      return;
    }
    if (command === "run") {
      playEffect("outsideEscape");
      const escapeBlockedByCharm = charmTurns > 0 || battleAilments.bound;
      const escapeBlockedByMp = battle.mp < ESCAPE_MP_COST;
      if (escapeBlockedByCharm || escapeBlockedByMp) {
        const normalAttack = shouldUseNormalAttack();
        if (normalAttack) applyEnemyAilment("tail");
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
        const failureReason = battleAilments.bound
          ? "束縛されているため逃げられない。"
          : charmTurns > 0
            ? "魅了中で逃げられない。"
            : `逃走に必要なMP${ESCAPE_MP_COST}が足りない。（現在MP：${Math.round(battle.mp)}）`;
        let finalAttackMessage: string;
        if (normalAttack) {
          if (!escapeBlockedByCharm) setTemptationEffect(null);
          finalAttackMessage = `${failureReason}\n逃げようとした隙に尻尾の通常攻撃：-${damage}HP`;
        } else {
          const effectLabel = applyEnemyAilment(enemyKind);
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
      recordOutsideAchievement("escape");
      return;
    }

    if (command === "grip" || command === "stroke" || command === "nipple") {
      recordOutsideAchievement(command);
      const playerAction = command === "grip"
        ? "おちんぽを握った。"
        : command === "stroke"
          ? "シコシコし始めた。"
          : "乳首を弄り始めた。";
      const mockingQuip = `${playerAction}\n${passiveActionQuips[succubus.stage][command]}`;
      addTemptation(40);

      // These deliberately defenseless actions always invite a temptation
      // attack. The separate status-only attack remains available during
      // ordinary enemy turns, but is not used as the response here.
      const enemyKind = randomLossKind();
      const damage = enemyAttackDamage[succubus.stage];
      const nextHp = clamp(battle.hp - damage);
      const nextMp = clamp(battle.mp - 6);
      setBattleEnemyImage(enemyKind);
      setBattle({ ...battle, hp: nextHp, mp: nextMp, lastLossKind: enemyKind });
      setPlayerHp(Math.max(1, nextHp));
      setPlayerMp(nextMp);
      saveSetting(hpKey, String(Math.max(1, nextHp)));
      saveSetting(mpKey, String(nextMp));
      const outcome = `無防備なところへ${lossLabels[enemyKind]}の誘惑攻撃：-${damage}HP\n${applyEnemyAilment(enemyKind)}を付与された。`;
      showEnemyTurn(mockingQuip, outcome, nextHp, enemyKind);
      return;
    }

    if (command !== "attack" && command !== "defend") {
      queueGameOver(
        command,
        battleLines[succubus.stage].lose[command],
        "自ら武器を捨て、サキュバスへ降参した。",
        true,
      );
      return;
    }

    if (command === "attack" && (charmTurns > 0 || slaveContractSigned)) {
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
      const effectLabel = applyEnemyAilment(enemyKind);
      const finalAttackMessage = `魅了中で攻撃が当たらない。MP-${ATTACK_MP_COST}\n${lossLabels[enemyKind]}の誘惑攻撃：-${damage}HP\n${effectLabel}の誘惑がさらに絡みつく。`;
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
        const defenseTotal = charmDefenseCount(succubus.stage);
        setTemptationGauge(remainingCharm === 0 ? 0 : Math.round((remainingCharm / defenseTotal) * 100));
        setBattleEnemyImage(enemyKind);
        setBattle({ ...battle, hp: nextHp, mp: nextMp, lastLossKind: enemyKind });
        setPlayerHp(Math.max(1, nextHp));
        setPlayerMp(nextMp);
        saveSetting(hpKey, String(Math.max(1, nextHp)));
        saveSetting(mpKey, String(nextMp));
        if (remainingCharm === 0) {
          recordOutsideAchievement("charmClear");
          setTemptationEffect(null);
        }
        const defenseMessage = remainingCharm === 0
          ? `魅了を防御で振り払った：-${damage}HP / MP+8\n次の攻撃は命中する。`
          : `魅了を防御で受け止めた：-${damage}HP / MP+8\n解除まであと${remainingCharm}回、防御が必要。`;
        showEnemyTurn(battleQuip("defended"), defenseMessage, nextHp, enemyKind);
        return;
      }
      setTemptationGauge((current) => Math.max(0, current - 25));
      const normalAttack = shouldUseNormalAttack();
      if (normalAttack) applyEnemyAilment("tail");
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
      const effectLabel = applyEnemyAilment(enemyKind);
      const finalAttackMessage = `身構えて誘惑を受け流した。\n${lossLabels[enemyKind]}の誘惑攻撃：-${damage}HP / MP+8\n${effectLabel}の誘惑が残っている。`;
      showEnemyTurn(battleQuip("defended"), finalAttackMessage, nextHp, enemyKind);
      return;
    }

    playEffect("outsideAttack");
    if (command === "attack" && battle.mp < ATTACK_MP_COST) {
      setMessage(`攻撃に必要なMP${ATTACK_MP_COST}が足りない。`);
      return;
    }
    if (command === "attack" && battleAilments.feared && Math.random() < 0.5) {
      setMessage("恐怖で体がすくみ、攻撃できなかった。");
      return;
    }
    const baseAttackDamage = Math.max(18, 34 - Math.max(0, succubus.level - level) * 0.25);
    const attackDamage = battleAilments.weakened ? baseAttackDamage * 0.5 : baseAttackDamage;
    const nextEnemyHp = clamp(battle.enemyHp - attackDamage);
    const attackMp = clamp(battle.mp - ATTACK_MP_COST);
    setPendingDamageQueue((items) => [...items, { target: "enemy", amount: Math.round(attackDamage) }]);
    if (nextEnemyHp <= 0) {
      const nextBattle = { ...battle, mp: attackMp, enemyHp: 0 };
      const victoryLevel = Math.min(100, level + 20);
      setBattle(nextBattle);
      if (victoryLevel > level) playEffect("levelUp");
      savePlayerStats(victoryLevel, nextBattle.hp, nextBattle.mp);
      setPhase("result");
      recordOutsideAchievement("victory", succubus.stage);
      setResultSummary(`勝利経験値を獲得しました。\nLv.${level} → Lv.${victoryLevel}（+${victoryLevel - level}）\nサキュバス戦でのPt獲得はありません。`);
      setMessage(battleLines[succubus.stage].win);
      return;
    }

    if (Math.random() < 0.5) {
      const effectLabel = applyStatusOnlyAttack();
      setBattle({ ...battle, mp: attackMp, enemyHp: nextEnemyHp });
      setPlayerMp(attackMp);
      saveSetting(mpKey, String(attackMp));
      setMessage(battleQuip("beforeTemptation"));
      setPendingBattleMessage(`サキュバスの瞳が妖しく輝いた。\nダメージはないが、${effectLabel}を付与された。`);
      return;
    }

    const normalAttack = shouldUseNormalAttack();
    if (normalAttack) applyEnemyAilment("tail");
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

    const effectLabel = applyEnemyAilment(enemyKind);
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

  function replayLossScene(stage: SuccubusStage, kind: LossMemoryKind) {
    setEncounterStage(stage);
    setBattle((current) => ({ ...current, lastLossKind: kind }));
    setLossEventIndex(0);
    setIsLossReplay(true);
    setCrystalOpen(false);
    setPhase("loss");
  }

  function purchaseLossScene(stage: SuccubusStage, kind: LossMemoryKind) {
    const memoryKey = `${stage}:${kind}`;
    if (unlockedLossMemories.includes(memoryKey)) return;
    if (rewardRepository.balance().available < 500) {
      setCrystalOpen(false);
      setMessage("所持Ptが不足しています。\n敗北シーンの解放には500Pt必要です。");
      return;
    }
    const purchased = pointRepository.award(
      `outside-loss-memory:${memoryKey}:${toDateTimeKey()}`,
      -500,
      `敗北シーン回想「${memoryKey}」を解放`,
    );
    if (!purchased) return;
    setUnlockedLossMemories((current) => {
      const next = [...current, memoryKey];
      AsyncStorage.setItem(LOSS_MEMORY_STORAGE_KEY, JSON.stringify(next)).catch(console.error);
      return next;
    });
  }

  const resetBattle = useCallback((mapMessages: string[] = ["もう一度、帰り道を探す。油断しないように進もう。"]) => {
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
    setCharmTurns(returnCharmTurns);
    setTemptationGauge(returnCharmTurns > 0 ? 100 : 0);
    setReturnCharmTurns(0);
    setMessage(mapMessages[0] ?? "");
    setQueuedMapMessages(mapMessages.slice(1));
    setPendingDamageQueue([]);
    setBattle({
      hp: playerHp,
      mp: playerMp,
      enemyHp: enemyMaxHp[encounterStage],
      lastLossKind: "tail",
    });
  }, [encounterStage, playerHp, playerMp, returnCharmTurns]);

  useEffect(() => {
    const finishedVictory = phase === "result";
    const finishedDefeat = phase === "loss" && lossEventIndex >= 19;
    if (!finishedVictory && !finishedDefeat) {
      fadeOpacity.setValue(0);
      return undefined;
    }

    fadeOpacity.setValue(0);
    const animation = Animated.timing(fadeOpacity, {
      toValue: 1,
      duration: 5000,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (!finished) return;
      if (finishedDefeat && isLossReplay) {
        setIsLossReplay(false);
        setPhase("explore");
        setMapArea("center");
        setMapStep(0);
        setMapPosition(startPositions.center);
        setPlayerFacing("down");
        setLossEventIndex(0);
        setMessage("敗北シーンの回想を終了しました。");
        return;
      }
      resetBattle(finishedVictory
        ? [resultSummary, victoryMapQuips[encounterStage]]
        : [lossSummary, defeatMapQuips[encounterStage]]);
    });
    return () => animation.stop();
  }, [encounterStage, fadeOpacity, isLossReplay, lossEventIndex, lossSummary, phase, resetBattle, resultSummary]);

  function handleBattleMessagePress() {
    if (phase !== "battle") return;
    setDisplayedBattle(battle);
    setDisplayedCharmTurns(charmTurns);
    setDisplayedTemptationGauge(temptationGauge);
    setDisplayedBattleAilments(battleAilments);
    if (pendingDamageQueue.length > 0) {
      const [effect, ...rest] = pendingDamageQueue;
      setPendingDamageQueue(rest);
      const value = effect?.target === "player" ? playerShake : enemyShake;
      if (effect) {
        if (damageFlashTimerRef.current) clearTimeout(damageFlashTimerRef.current);
        setDamageFlash(effect);
        Animated.sequence([
          Animated.timing(value, { toValue: -7, duration: 55, useNativeDriver: true }),
          Animated.timing(value, { toValue: 7, duration: 70, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 55, useNativeDriver: true }),
        ]).start();
        damageFlashTimerRef.current = setTimeout(() => {
          setDamageFlash(null);
          damageFlashTimerRef.current = null;
        }, 3000);
      }
    }
    if (pendingBattleMessage) {
      setMessage(pendingBattleMessage);
      setPendingBattleMessage(null);
      return;
    }
    if (pendingGameOver) {
      const next = pendingGameOver;
      setPendingGameOver(null);
      applyGameOver(next.kind, next.reason, next.surrendered);
      return;
    }
    setBattleAwaitingChoice(true);
  }

  if (phase === "battle" || phase === "result" || phase === "loss") {
    return (
      <View style={styles.root}>
        <View style={[styles.battleScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.battleStage, phase === "loss" && styles.lossBattleStage]}>
            {phase === "loss" ? (
              <>
                <Pressable style={styles.lossStage} onPress={advanceLossScene}>
                  <NativeImage
                    key={`loss-${isLossReplay ? "replay" : "battle"}-${activeSuccubusStage}-${battle.lastLossKind}-${lossImageIndex}`}
                    source={lossEventImages[lossImageIndex] ?? lossEventImages[0]}
                    style={styles.lossImage}
                    resizeMode="cover"
                  />
                  <AppText style={styles.lossImageLabel}>
                    {lossEventIndex + 1} / 20
                  </AppText>
                  {levelDownFlash.visible ? (
                    <AppText style={[styles.levelDownFlash, { left: `${levelDownFlash.left}%`, top: `${levelDownFlash.top}%` }]}>レベルダウン⤵⤵⤵</AppText>
                  ) : null}
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
                <Animated.View style={[styles.enemyOverlay, { transform: [{ translateX: enemyShake }] }]}>
                  <AppText style={[styles.enemyOverlayName, { color: succubus.color }]}>{succubus.title} Lv.{succubus.level}</AppText>
                  <StatGauge label="HP" value={displayedBattle.enemyHp} max={enemyMaxHp[activeSuccubusStage]} color="#ff4fa3" />
                </Animated.View>
                <View style={styles.enemyLarge}>
                  {battleEnemyImage === "battle" ? (
                    <>
                      <Image
                        source={battleEnemyImageSource}
                        style={styles.enemyBattleBackdrop}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                      <Image
                        source={battleEnemyImageSource}
                        style={styles.enemyLargeImage}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    </>
                  ) : (
                    <Image
                      source={battleEnemyImageSource}
                      style={styles.enemyLargeEventImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  )}
                </View>
                {battleAwaitingChoice ? (
                  <View style={styles.battleChoiceOverlay}>
                    <View style={styles.commandPanel}>
                      <AppText style={styles.panelTitle}>選択</AppText>
                      <View style={styles.battleCommands}>
                        {!hasSuccubusMark && !slaveContractSigned ? <PrimaryButton title="戦う" onPress={() => setBattleMenu("fight")} /> : null}
                        <PrimaryButton title="降参する" tone="defeat" onPress={() => setBattleMenu("surrender")} />
                        {!hasSuccubusMark && !slaveContractSigned ? (
                          <PrimaryButton title={`逃げる（MP${ESCAPE_MP_COST}）`} tone="secondary" onPress={() => resolveCommand("run")} />
                        ) : (
                          <View style={styles.succubusMarkBattleNotice}>
                            <Image source={hasSuccubusMark ? pixelSprites.succubusMark : pixelSprites.statusObedience} style={styles.succubusMarkBattleIcon} contentFit="contain" />
                            <AppText style={styles.succubusMarkBattleText}>{hasSuccubusMark ? "淫紋：戦闘・逃亡不可" : "服従：戦闘・逃亡不可"}</AppText>
                          </View>
                        )}
                      </View>
                    </View>
                    <Animated.View style={[styles.playerStatusPanel, { transform: [{ translateX: playerShake }] }]}>
                      <AppText style={styles.panelTitle}>自分</AppText>
                      <StatGauge label="HP" value={displayedBattle.hp} max={100} color="#e3364f" />
                      <StatGauge label="MP" value={displayedBattle.mp} max={100} color="#3f8cff" />
                      <StatGauge label="誘惑" value={displayedTemptationGauge} max={100} color="#ff69b4" />
                      {displayedCharmTurns > 0 ? <AppText style={styles.charmedMark}>魅了（防御あと{displayedCharmTurns}回）</AppText> : null}
                      <View style={styles.statusGrid}>
                      {displayedCharmTurns > 0 ? (
                        <View style={styles.statusEffectRow}>
                          <Image
                            source={pixelSprites.heartMark}
                            style={styles.statusEffectMark}
                            contentFit="contain"
                          />
                          <AppText style={styles.statusEffectLabel}>魅了</AppText>
                        </View>
                      ) : null}
                      {displayedBattleAilments.weakened ? (
                        <View style={styles.statusEffectRow}>
                          <Image source={pixelSprites.statusWeakness} style={styles.statusEffectMark} contentFit="contain" />
                          <AppText style={styles.statusEffectLabel}>衰弱</AppText>
                        </View>
                      ) : null}
                      {displayedBattleAilments.illusion ? (
                        <View style={styles.statusEffectRow}>
                          <Image source={pixelSprites.statusIllusion} style={styles.statusEffectMark} contentFit="contain" />
                          <AppText style={styles.statusEffectLabel}>幻惑</AppText>
                        </View>
                      ) : null}
                      {displayedBattleAilments.feared ? (
                        <View style={styles.statusEffectRow}>
                          <Image source={pixelSprites.statusFear} style={styles.statusEffectMark} contentFit="contain" />
                          <AppText style={styles.statusEffectLabel}>恐怖</AppText>
                        </View>
                      ) : null}
                      {displayedBattleAilments.bound ? (
                        <View style={styles.statusEffectRow}>
                          <Image source={pixelSprites.statusObedience} style={styles.statusEffectMark} contentFit="contain" />
                          <AppText style={styles.statusEffectLabel}>束縛</AppText>
                        </View>
                      ) : null}
                      {hasSuccubusMark ? (
                        <View style={styles.statusEffectRow}>
                          <Image source={pixelSprites.succubusMark} style={styles.statusEffectMark} contentFit="contain" />
                          <AppText style={styles.statusEffectLabel}>淫紋</AppText>
                        </View>
                      ) : null}
                      {slaveContractSigned ? (
                        <View style={styles.statusEffectRow}>
                          <Image source={pixelSprites.statusObedience} style={styles.statusEffectMark} contentFit="contain" />
                          <AppText style={styles.statusEffectLabel}>服従</AppText>
                        </View>
                      ) : null}
                      </View>
                    </Animated.View>
                  </View>
                ) : (
                  <Pressable
                    style={styles.battleStageMessage}
                    onPress={handleBattleMessagePress}
                    onLayout={(event) => setBattleMessageHeight(event.nativeEvent.layout.height)}
                  >
                    <View style={styles.rowBetween}>
                      <AppText style={styles.battleMessageName}>二ノサキュバス</AppText>
                      <AppText style={styles.phase}>{phase.toUpperCase()}</AppText>
                    </View>
                    {charmTurns > 0 ? (
                      <AppText style={styles.charmText}>魅了：逃亡不可 / 防御あと{charmTurns}回で解除</AppText>
                    ) : null}
                    <AppText style={[styles.message, pendingGameOver ? styles.pendingGameOverMessage : null]}>
                      {message}
                    </AppText>
                    <AppText style={styles.tapGuide}>タップ ▼</AppText>
                  </Pressable>
                )}
                {damageFlash ? (
                  <AppText
                    style={[
                      styles.damageFlash,
                      damageFlash.target === "enemy"
                        ? styles.damageFlashEnemy
                        : [styles.damageFlashPlayer, { bottom: battleMessageHeight + 22 }],
                    ]}
                  >
                    ダメージ -{damageFlash.amount}
                  </AppText>
                ) : null}
              </>
            )}
          </View>

          <Modal visible={battleAwaitingChoice && battleMenu !== "root"} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setBattleMenu("root")}>
            <View style={styles.crystalModalBackdrop}>
              <View style={styles.battleCommandModal}>
                <AppText style={styles.crystalModalTitle}>{battleMenu === "fight" ? "戦う" : "降参する"}</AppText>
                <View style={styles.battleCommandModalList}>
                  {battleMenu === "fight" ? (
                    <>
                      <PrimaryButton title={`攻撃（MP${ATTACK_MP_COST}）`} tone="battleAttack" disabled={battle.mp < ATTACK_MP_COST} onPress={() => resolveCommand("attack")} />
                      <PrimaryButton title="防御" tone="battleDefense" onPress={() => resolveCommand("defend")} />
                      <PrimaryButton title="おちんぽ握る♡" tone="battleSpecial" onPress={() => resolveCommand("grip")} />
                      <PrimaryButton title="シコシコする♡" tone="battleSpecial" onPress={() => resolveCommand("stroke")} />
                      <PrimaryButton title="乳首を弄る♡" tone="battleSpecial" onPress={() => resolveCommand("nipple")} />
                    </>
                  ) : (
                    <>
                      <PrimaryButton title="おっぱい" tone="defeat" onPress={() => resolveCommand("chest")} />
                      <PrimaryButton title="お尻" tone="defeat" onPress={() => resolveCommand("back")} />
                      <PrimaryButton title="足裏" tone="defeat" onPress={() => resolveCommand("foot")} />
                    </>
                  )}
                </View>
                <PrimaryButton title="戻る" tone="secondary" onPress={() => setBattleMenu("root")} />
              </View>
            </View>
          </Modal>

          <Animated.View
            pointerEvents="none"
            style={[styles.fadeOverlay, { opacity: fadeOpacity }]}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[
        styles.mapScreen,
        {
          paddingTop: Math.max(8, insets.top),
          paddingBottom: Math.max(8, insets.bottom),
        },
      ]}>
        <View key={`outside-area-${mapArea}`} style={styles.fullMap}>
          {mapArea === "center" ? (
            <CenterArea
              crystalSource={pixelSprites.crystal}
              warningSignSource={pixelSprites.warningSign}
              crystalScaleX={crystalSpinScaleX}
              onMoveLeft={() => moveMap("left")}
              onMoveRight={() => moveMap("right")}
              onMoveForward={advanceMap}
              onReturnHome={() => router.replace("/(tabs)")}
              onOpenCrystal={openCrystalSettings}
              onOpenWarningSign={openWarningSign}
            />
          ) : mapArea === "left" ? (
            <LeftArea onExplore={exploreLeftArea} onReturn={() => moveMap("center")} />
          ) : mapArea === "right" ? (
            <RightArea onReturn={() => moveMap("center")} />
          ) : (
            <TopArea onExplore={exploreTopArea} onReturn={() => moveMap("center")} />
          )}
          {isMovingArea ? (
            <View style={styles.mapMovingOverlay}>
              <AppText style={styles.mapMovingText}>移動中です…</AppText>
            </View>
          ) : null}
          {mapArea === "top" ? (
            <>
              {mapStep > 0 ? (
                <View style={styles.exclamation}>
                  <AppText style={styles.exclamationText}>!</AppText>
                </View>
              ) : null}
              {mapStep === 2 ? (
                <View style={styles.mapChoiceBox}>
                  <AppText style={styles.mapChoiceTitle}>サキュバスに呼び止められた</AppText>
                  {!hasSuccubusMark && !deepSuccubusMark && !slaveContractSigned ? (
                    <Pressable style={styles.mapChoiceButton} onPress={() => chooseEncounter("resist")}>
                      <AppText style={styles.mapChoiceText}>戦闘開始</AppText>
                    </Pressable>
                  ) : null}
                  <Pressable style={[styles.mapChoiceButton, styles.mapChoicePink]} onPress={() => chooseEncounter("listen")}>
                    <AppText style={[styles.mapChoiceText, styles.mapChoicePinkText]}>
                      {hasSuccubusMark || deepSuccubusMark || slaveContractSigned ? "敗北する（弱者用）" : "サキュバスと目が合う"}
                    </AppText>
                  </Pressable>
                  <Pressable style={[styles.mapChoiceButton, styles.mapChoiceRed]} onPress={() => chooseEncounter("run")}>
                    <AppText style={[styles.mapChoiceText, styles.mapChoiceRedText]}>すぐ逃げる</AppText>
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}
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
              {isSuccubusMapQuip ? (
                <AppText style={styles.battleMessageName}>二ノサキュバス</AppText>
              ) : null}
              <AppText style={[styles.mapMessage, /回復|全回復|浄化/.test(message) && styles.recoveryMessage]}>{message}</AppText>
              <AppText style={styles.mapTapGuide}>タップ ▼</AppText>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.outsideBottomRow}>
          <View style={styles.statusPanel}>
            <Pressable style={styles.mapInfoButton} onPress={() => setPlayerStatusModalOpen(true)}>
              <AppText style={styles.mapInfoButtonText}>自分のステータス</AppText>
            </Pressable>
            {hasMapStatus ? (
              <Pressable style={styles.mapInfoButton} onPress={() => setStatusModalOpen(true)}>
                <AppText style={styles.mapInfoButtonText}>状態異常を確認</AppText>
              </Pressable>
            ) : null}
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
      <Modal visible={playerStatusModalOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPlayerStatusModalOpen(false)}>
        <View style={styles.crystalModalBackdrop}>
          <View style={styles.statusModal}>
            <AppText style={styles.crystalModalTitle}>自分のステータス</AppText>
            <View style={styles.playerStatusModalList}>
              <AppText style={styles.playerStatusModalLevel}>Lv.{level}</AppText>
              <StatGauge label="HP" value={playerHp} max={100} color="#e3364f" />
              <StatGauge label="MP" value={playerMp} max={100} color="#3f8cff" />
              <AppText style={styles.playerStatusModalText}>館の外獲得Pt　{dailyOutsidePoints}/100pt</AppText>
              <AppText style={styles.playerStatusModalText}>所持Pt　{availablePoints}pt</AppText>
            </View>
            <Pressable style={styles.crystalCloseButton} onPress={() => setPlayerStatusModalOpen(false)}>
              <AppText style={styles.crystalCloseButtonText}>閉じる</AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={statusModalOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setStatusModalOpen(false)}>
        <View style={styles.crystalModalBackdrop}>
          <View style={styles.statusModal}>
            <AppText style={styles.crystalModalTitle}>状態異常</AppText>
            <ScrollView contentContainerStyle={styles.statusModalList}>
              {[
                charmTurns > 0 ? { name: "魅了", image: pixelSprites.heartMark, effect: "攻撃が命中せず、逃走もできなくなります。", cure: `防御をあと${charmTurns}回、または左の水辺で解除` } : null,
                battleAilments.bound ? { name: "束縛", image: pixelSprites.statusObedience, effect: "逃走できなくなります。", cure: "左の水辺で解除" } : null,
                battleAilments.weakened ? { name: "衰弱", image: pixelSprites.statusWeakness, effect: "攻撃力が半減します。", cure: "左の水辺で解除" } : null,
                battleAilments.illusion ? { name: "幻惑", image: pixelSprites.statusIllusion, effect: "サキュバスのHPが見えなくなります。", cure: "左の水辺で解除" } : null,
                battleAilments.feared ? { name: "恐怖", image: pixelSprites.statusFear, effect: "攻撃が50%の確率で失敗します。", cure: "左の水辺で解除" } : null,
                hasSuccubusMark ? { name: "淫紋", image: pixelSprites.succubusMark, effect: "戦闘と逃走ができず、降参しか選べません。", cure: "左の水辺でのみ解除" } : null,
                deepSuccubusMark ? { name: "刻印深化", image: pixelSprites.statusDeepMark, effect: "敗北時のレベル・Pt吸収基準が100になります。", cure: "左の水辺でのみ解除" } : null,
                slaveContractSigned ? { name: "服従", image: pixelSprites.statusObedience, effect: "戦闘と逃走ができず、降参しか選べません。", cure: "クリスタルの設定から奴隷契約を解除" } : null,
              ].filter(Boolean).map((status) => status ? (
                <View key={status.name} style={styles.statusModalRow}>
                  <Image source={status.image} style={styles.statusModalImage} contentFit="contain" />
                  <View style={styles.statusModalCopy}>
                    <AppText style={styles.statusModalName}>{status.name}</AppText>
                    <AppText style={styles.statusModalCure}>効果：{status.effect}</AppText>
                    <AppText style={styles.statusModalCure}>解除方法：{status.cure}</AppText>
                  </View>
                </View>
              ) : null)}
              {!charmTurns && !battleAilments.bound && !battleAilments.weakened && !battleAilments.illusion && !battleAilments.feared && !hasSuccubusMark && !deepSuccubusMark && !slaveContractSigned ? (
                <AppText style={styles.statusModalEmpty}>付与中の状態異常はありません。</AppText>
              ) : null}
            </ScrollView>
            <Pressable style={styles.crystalCloseButton} onPress={() => setStatusModalOpen(false)}>
              <AppText style={styles.crystalCloseButtonText}>閉じる</AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={crystalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeCrystalSettings}
      >
        <View style={styles.crystalModalBackdrop}>
          <View style={styles.crystalModal}>
            <ScrollView contentContainerStyle={styles.crystalModalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.crystalTutorialSection}>
              <AppText style={styles.crystalTutorialTitle}>チュートリアル</AppText>
              {[
                { title: "移動", action: "画面の矢印に触れるか、タップしてエリアを移動します。", image: pixelSprites.mapCenter },
                { title: "水辺", action: "左の水辺に触れると、HP・MPと状態異常を回復できます。", image: pixelSprites.mapLeft },
                { title: "戦闘", action: "右のエリアでスライムと戦い、レベルを上げます。", image: pixelSprites.mapRight },
                { title: "状態異常", action: "付与された効果と解除方法を確認して行動します。", image: pixelSprites.statusDeepMark },
                { title: "誘惑ゲージ", action: "100％になる前に防御し、誘惑ゲージを減らします。", image: pixelSprites.heartMark },
                { title: "看板", action: "詳しい戦い方、状態異常、勝利・敗北時のルールは十字路の看板を確認してください。", image: pixelSprites.warningSign },
              ].map((item) => (
                <View key={item.title} style={styles.crystalTutorialRow}>
                  <Image source={item.image} style={styles.crystalTutorialRowImage} contentFit="contain" />
                  <View style={styles.crystalTutorialRowCopy}>
                    <AppText style={styles.crystalTutorialRowTitle}>{item.title}</AppText>
                    <AppText style={styles.crystalTutorialRowAction}>{item.action}</AppText>
                  </View>
                </View>
              ))}
            </View>
            <AppText style={styles.crystalSettingsTitle}>設定</AppText>
            <AppText style={styles.crystalModalHelp}>
              レベル調整と状態異常を設定できます。
            </AppText>

            <View style={styles.crystalSettingsGroup}>
              <AppText style={styles.crystalSettingsGroupTitle}>レベル</AppText>
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
            </View>

            <View style={styles.crystalSettingsGroup}>
              <AppText style={styles.crystalSettingsGroupTitle}>状態異常</AppText>
              <Pressable style={[styles.crystalCharmButton, charmTurns > 0 && styles.crystalCharmButtonActive]} onPress={activateCrystalCharm}>
                <AppText style={styles.crystalCharmButtonText}>
                  {charmTurns > 0 ? "魅了中" : "魅了になる"}
                </AppText>
              </Pressable>
              <AppText style={styles.crystalModalNote}>
                ※魅了モード中になると、戦闘時に攻撃が当たらず逃げられません。防御または左の水辺で解除できます。
              </AppText>

              <Pressable style={[styles.crystalCharmButton, hasSuccubusMark && !deepSuccubusMark && styles.crystalCharmButtonActive]} onPress={activateCrystalSuccubusMark}>
                <AppText style={styles.crystalCharmButtonText}>
                  {hasSuccubusMark && !deepSuccubusMark ? "淫紋モード中" : "淫紋モードになる"}
                </AppText>
              </Pressable>
              <AppText style={styles.crystalModalNote}>
                ※淫紋モード中は戦闘と逃走ができず、降参のみ選択できます。左の水辺で解除できます。
              </AppText>

              <Pressable style={[styles.crystalCharmButton, deepSuccubusMark && styles.crystalCharmButtonActive]} onPress={activateCrystalDeepMark}>
                <AppText style={styles.crystalCharmButtonText}>
                  {deepSuccubusMark ? "刻印深化モード中" : "刻印深化モードになる"}
                </AppText>
              </Pressable>
              <AppText style={styles.crystalModalNote}>
                ※刻印深化モード中は敗北時の吸収基準が100になります。左の水辺で解除できます。
              </AppText>

              {slaveContractSigned ? (
                <>
                  <Pressable style={styles.crystalContractReleaseButton} onPress={releaseSlaveContractAtCrystal}>
                    <AppText style={styles.crystalContractReleaseButtonText}>奴隷契約を解除する</AppText>
                  </Pressable>
                  <AppText style={styles.crystalModalNote}>
                    ※契約データを削除し、服従状態を解除します。
                  </AppText>
                </>
              ) : null}
            </View>

            <View style={styles.battleEncyclopedia}>
              <AppText style={styles.battleEncyclopediaTitle}>戦闘図鑑</AppText>
              {([
                ["beginner", "初級サキュバス", 100, "防御1回で魅了解除"],
                ["middle", "上級サキュバス", 300, "防御2回で魅了解除"],
                ["queen", "女王サキュバス", 500, "防御3回で魅了解除"],
              ] as const).map(([stage, name, hp, charmRule]) => (
                <View key={stage} style={styles.battleEncyclopediaRow}>
                  <Image source={pixelSprites.succubus[stage]} style={styles.battleEncyclopediaImage} contentFit="contain" />
                  <View style={styles.battleEncyclopediaCopy}>
                    <AppText style={styles.battleEncyclopediaName}>{name}</AppText>
                    <AppText style={styles.battleEncyclopediaMeta}>HP {hp}／{charmRule}</AppText>
                  </View>
                </View>
              ))}
              <AppText style={styles.battleEncyclopediaMoves}>
                攻撃：尻尾／おっぱい／お尻／足裏／状態異常攻撃
              </AppText>
            </View>

            <View style={styles.lossMemorySection}>
              <AppText style={styles.lossMemoryTitle}>敗北シーン回想</AppText>
              <AppText style={styles.lossMemoryHelp}>
                一度見た敗北シーンは無料で再生できます。{"\n"}
                未閲覧シーンは各500Ptで解放できます。{"\n"}
                回想ではレベル・Pt・状態異常は変化しません。
              </AppText>
              <View style={styles.lossMemoryList}>
                {(["beginner", "middle", "queen"] as const).map((stage) => {
                  const stageLabel = stage === "beginner" ? "初級サキュバス" : stage === "middle" ? "上級サキュバス" : "女王サキュバス";
                  return (
                    <View key={stage} style={styles.lossMemoryStageGroup}>
                      <AppText style={styles.lossMemoryStageTitle}>{stageLabel}</AppText>
                      <View style={styles.lossMemoryStageButtons}>
                        {(["chest", "back", "foot"] as const).map((kind) => {
                          const key = `${stage}:${kind}`;
                          const unlocked = unlockedLossMemories.includes(key);
                          const kindLabel = kind === "chest" ? "おっぱい" : kind === "back" ? "お尻" : "足裏";
                          return (
                            <Pressable
                              key={key}
                              disabled={!unlocked && availablePoints < 500}
                              style={[styles.lossMemoryButton, !unlocked && styles.lossMemoryPurchaseButton, !unlocked && availablePoints < 500 && styles.lossMemoryButtonDisabled]}
                              onPress={() => unlocked ? replayLossScene(stage, kind) : purchaseLossScene(stage, kind)}
                            >
                              <AppText style={styles.lossMemoryButtonText}>{kindLabel}</AppText>
                              <AppText style={styles.lossMemoryButtonState}>{unlocked ? "見る" : "500Ptで解放"}</AppText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            <Pressable style={styles.crystalSettingsCloseButton} onPress={closeCrystalSettings}>
              <AppText style={styles.crystalSettingsCloseButtonText}>閉じる</AppText>
            </Pressable>
            </ScrollView>
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
            <AppText style={styles.warningModalTitle}>この先、サキュバス出没注意</AppText>

            <View style={styles.advanceWarningSection}>
              <View pointerEvents="none" style={[styles.guideTopBorder, styles.advanceWarningTopBorder]} />
              <AppText style={styles.advanceWarningTitle}>奥へ進む前の注意事項</AppText>
              <AppText style={styles.warningBody}>
                上の森ではサキュバスと遭遇します。{"\n"}
                右のエリアでレベルを上げて強くすること。{"\n"}                
                HPとMPを確認し、必要なら左の水辺で回復してから進んでください。
              </AppText>
              <AppText style={styles.slaveContractWarning}>
                ※奴隷契約している方へ{"\n"}
                【敗北】することしかできません。{"\n"}
                戦闘も楽しく遊びたい場合は、{"\n"}  
                クリスタルから「契約書・契約ルール」の{"\n"} 
                初期化をおこなってください。
              </AppText>
            </View>

            <View style={styles.succubusInfoSection}>
              <AppText style={styles.succubusInfoTitle}>サキュバスについて</AppText>
              <AppText style={styles.warningBody}>
                サキュバスはレベルを吸収するほど、体格と魔力が成長します。{"\n"}
                現在は「{succubus.title}」Lv.{succubus.level}です。
              </AppText>
              <AppText style={styles.succubusGrowthText}>
                ・Lv.1〜29：小柄な初級段階。誘惑は防御1回で解除。{"\n"}
                ・Lv.30〜79：成長した上級段階。体格と誘惑が強まり、防御2回で解除。{"\n"}
                ・Lv.80〜100：完成した女王段階。最も大きく強い姿となり、防御3回で解除。
              </AppText>
            </View>

            <View style={styles.battleGuideSection}>
              <View pointerEvents="none" style={[styles.guideTopBorder, styles.battleGuideTopBorder]} />
              <AppText style={styles.battleGuideTitle}>戦い方</AppText>
              <AppText style={styles.warningBody}>
                ・攻撃：サキュバスのHPを減らし、毎回MPを20消費。魅了中は命中しませんが、MPは消費します。{"\n"}
                ・防御：被害を抑えてMPを8回復。魅了中は防御するたび解除へ近づきます。{"\n"}
                ・魅了解除：初級1回／上級2回／女王3回の防御が必要です。{"\n"}
                ・降参する：発情＆我慢できなくなった場合、そのまま降参することができます♡{"\n"}
                ・逃げる：MP50を消費。魅了されておらず、MPが50以上ある時だけ成功。失敗すると敵の攻撃を受けます。
              </AppText>
            </View>

            <View style={styles.warningSection}>
              <AppText style={styles.warningSectionTitle}>状態異常について</AppText>
              {[
                { name: "魅了", image: pixelSprites.heartMark, effect: "攻撃が命中せず、逃走もできなくなります。", cure: "難易度に応じた回数を防御するか、左の水辺で解除。" },
                { name: "束縛", image: pixelSprites.statusObedience, effect: "逃走できなくなります。", cure: "左の水辺で解除。" },
                { name: "幻惑", image: pixelSprites.statusIllusion, effect: "サキュバスのHPが見えなくなります。", cure: "左の水辺で解除。" },
                { name: "衰弱", image: pixelSprites.statusWeakness, effect: "攻撃力が半減します。", cure: "左の水辺で解除。" },
                { name: "恐怖", image: pixelSprites.statusFear, effect: "攻撃が50%の確率で失敗します。", cure: "左の水辺で解除。" },
                { name: "服従", image: pixelSprites.statusObedience, effect: "戦闘と逃走ができず、降参しか選べません。", cure: "水辺では解除不可。設定画面から「契約書・契約ルール」を初期化。" },
                { name: "淫紋", image: pixelSprites.succubusMark, effect: "戦闘と逃走ができず、降参しか選べません。", cure: "左の水辺でのみ解除。" },
                { name: "刻印深化", image: pixelSprites.statusDeepMark, effect: "敗北時のレベル・Pt吸収基準が50から100になります。", cure: "左の水辺でのみ解除。" },
              ].map((status) => (
                <View key={status.name} style={styles.statusGuideRow}>
                  <Image source={status.image} style={styles.statusGuideIcon} contentFit="contain" />
                  <View style={styles.statusGuideText}>
                    <AppText style={styles.statusGuideName}>{status.name}</AppText>
                    <AppText style={styles.warningBody}>効果：{status.effect}{"\n"}解除方法：{status.cure}</AppText>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.victoryGuideSection}>
              <View pointerEvents="none" style={[styles.guideTopBorder, styles.victoryGuideTopBorder]} />
              <AppText style={styles.victoryGuideTitle}>勝利した場合</AppText>
              <AppText style={styles.warningBody}>
                ・スライム勝利：1体につきレベルが1上がり、10Ptを獲得します（一日最大100Pt）。{"\n"}
                ・サキュバス勝利：経験値としてレベルが20上がります。Ptは付与されません。
              </AppText>
            </View>

            <View style={styles.defeatWarningSection}>
              <AppText style={styles.defeatWarningTitle}>敗北した場合</AppText>
              <AppText style={styles.defeatWarningText}>
                HPが0になるか降参すると敗北シーンへ移行{"\n"}
                {"\n"}
                最大50レベルを吸収され、HPとMPは1になります。{"\n"}
                50レベルに足りない分は、1レベルにつき1Ptとして所持Ptから吸収されます。{"\n"}
                （例）Lv.45の場合：{"\n"}
                　Lv.1になり5Pt吸収されます。{"\n"}
                （例）Lv.1の場合：{"\n"}
                　50Pt吸収されます。{"\n"}
                ※所持Ptが不足している場合：{"\n"}
                所持Ptは【マイナス】となります。{"\n"}
                {"\n"}
                【Lv.1】で【敗北した】場合：{"\n"}
                淫紋を刻まれ、戦闘と逃亡ができず、降参しか選べなくなります。{"\n"}
                {"\n"}
                【淫紋】の状態で【敗北した】場合：{"\n"}
                刻印深化を刻まれ、戦闘と逃亡ができず、降参しか選べなくなります。{"\n"}
                敗北時のレベル・Pt吸収基準が50から100になります。{"\n"}
                {"\n"}
                自ら【降参する】を選んだ場合：{"\n"}
                【全レベル】と【50Pt】を吸収され、{"\n"}
                魅了と淫紋を付与されます。
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
  crossroadRouteOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    width: "100%",
    height: "100%",
    opacity: 0.72,
  },
  crossroadReturnOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    width: "100%",
    height: "100%",
    opacity: 0.62,
    transform: [{ rotate: "180deg" }],
  },
  areaReturnArrow: {
    position: "absolute",
    zIndex: 3,
    width: "24%",
    height: "14%",
    opacity: 0.72,
  },
  areaReturnArrowLeft: { right: 0, top: "43%" },
  areaReturnArrowRight: { left: 0, top: "43%", transform: [{ rotate: "180deg" }] },
  areaReturnArrowTop: { bottom: "1%", left: "38%", transform: [{ rotate: "90deg" }] },
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
    left: "40%",
    right: "40%",
    height: "26%",
    backgroundColor: "transparent",
    zIndex: 4,
  },
  mapLeftTap: {
    position: "absolute",
    top: "40%",
    height: "22%",
    left: 0,
    width: "24%",
    backgroundColor: "transparent",
    zIndex: 4,
  },
  mapRightTap: {
    position: "absolute",
    top: "40%",
    right: 0,
    height: "22%",
    width: "24%",
    backgroundColor: "transparent",
    zIndex: 4,
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
    top: "40%",
    right: 0,
    width: "20%",
    height: "22%",
    backgroundColor: "transparent",
  },
  mapBackFromRightTap: {
    position: "absolute",
    top: "40%",
    left: 0,
    width: "20%",
    height: "22%",
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
    left: "40%",
    bottom: 0,
    width: "20%",
    height: "18%",
    backgroundColor: "transparent",
  },
  mapDoorTap: {
    position: "absolute",
    left: "40%",
    bottom: 0,
    width: "20%",
    height: "22%",
    backgroundColor: "transparent",
    zIndex: 4,
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
    maxHeight: "88%",
    borderWidth: 2,
    borderColor: "#d84f92",
    backgroundColor: "#fffafc",
  },
  crystalModalContent: {
    gap: 12,
    padding: 18,
  },
  crystalTutorialSection: {
    gap: 8,
    borderWidth: 2,
    borderColor: "#ff69b4",
    padding: 12,
    backgroundColor: "#fff0f6",
  },
  crystalTutorialTitle: {
    color: "#ff69b4",
    fontSize: 20,
    fontWeight: "900",
  },
  crystalTutorialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e4b5ca",
    backgroundColor: "#fff",
    padding: 7,
  },
  crystalTutorialRowImage: {
    width: 82,
    height: 66,
    borderWidth: 1,
    borderColor: "#d7c4cd",
    backgroundColor: "#150d17",
  },
  crystalTutorialRowCopy: {
    flex: 1,
    gap: 3,
  },
  crystalTutorialRowTitle: {
    color: "#c22973",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
  },
  crystalTutorialRowAction: {
    color: "#33232c",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
  },
  crystalTutorialBody: {
    color: "#2d2027",
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "700",
  },
  crystalModalKicker: {
    color: "#a62c6b",
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
  crystalSettingsTitle: {
    color: "#21151d",
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "900",
  },
  crystalModalHelp: {
    color: "#4c4148",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  crystalSettingsGroup: {
    gap: 10,
    borderWidth: 2,
    borderColor: "#33232c",
    backgroundColor: "#fff",
    padding: 10,
  },
  crystalSettingsGroupTitle: {
    color: "#21151d",
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
  },
  crystalSettingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: "#d8c8d0",
    backgroundColor: "#fff",
    padding: 12,
  },
  crystalSettingText: {
    flex: 1,
    gap: 4,
  },
  crystalSettingLabel: {
    color: "#271b22",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  crystalSettingValue: {
    color: "#8c3270",
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
    borderColor: "#7c6673",
    backgroundColor: "#fff",
    paddingVertical: 8,
    alignItems: "center",
  },
  crystalStepButtonText: {
    color: "#33232c",
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
  crystalContractReleaseButton: {
    borderWidth: 2,
    borderColor: "#ff3b45",
    backgroundColor: "#8f111a",
    paddingVertical: 14,
    alignItems: "center",
  },
  crystalContractReleaseButtonText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "900",
  },
  crystalModalNote: {
    color: "#743653",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  lossMemorySection: {
    gap: 9,
    borderWidth: 2,
    borderColor: "#9b3d72",
    backgroundColor: "#fff3f8",
    padding: 12,
  },
  lossMemoryTitle: { color: "#ff69b4", fontSize: 16, lineHeight: 22, fontWeight: "900" },
  lossMemoryHelp: { color: "#46353e", fontSize: 11, lineHeight: 17, fontWeight: "700" },
  lossMemoryList: { gap: 12 },
  lossMemoryStageGroup: {
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: "#dfc4d2",
    paddingTop: 9,
  },
  lossMemoryStageTitle: {
    color: "#2a1d24",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "900",
  },
  lossMemoryStageButtons: {
    gap: 7,
    paddingLeft: 12,
  },
  lossMemoryButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#ff69b4",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  lossMemoryButtonText: { color: "#72214e", fontSize: 13, lineHeight: 18, fontWeight: "900" },
  lossMemoryButtonState: { color: "#8b6577", fontSize: 11, lineHeight: 16, fontWeight: "800" },
  lossMemoryPurchaseButton: { borderColor: "#d9a441", backgroundColor: "#fff7df" },
  lossMemoryButtonDisabled: { opacity: 0.42 },
  lossMemoryEmpty: { color: "#aaa", fontSize: 11, lineHeight: 17, fontWeight: "700" },
  battleEncyclopedia: {
    gap: 8,
    borderWidth: 2,
    borderColor: "#ff69b4",
    backgroundColor: "#fff3f8",
    padding: 12,
  },
  battleEncyclopediaTitle: {
    color: "#ff69b4",
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
  },
  battleEncyclopediaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#e1cbd5",
    paddingTop: 8,
  },
  battleEncyclopediaImage: {
    width: 54,
    height: 62,
  },
  battleEncyclopediaCopy: {
    flex: 1,
    gap: 2,
  },
  battleEncyclopediaName: {
    color: "#2a1d24",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  battleEncyclopediaMeta: {
    color: "#9d356a",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
  },
  battleEncyclopediaMoves: {
    color: "#51434a",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
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
  crystalSettingsCloseButton: {
    borderWidth: 2,
    borderColor: "#a62c6b",
    backgroundColor: "#a62c6b",
    paddingVertical: 12,
    alignItems: "center",
  },
  crystalSettingsCloseButtonText: {
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
    backgroundColor: "#fffdf8",
  },
  warningModalContent: {
    gap: 12,
    padding: 18,
  },
  warningModalKicker: {
    color: "#9b651d",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 3,
  },
  warningModalTitle: {
    color: "#5c3510",
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "900",
  },
  warningSection: {
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: "#d9b77f",
    paddingTop: 10,
  },
  battleGuideSection: {
    gap: 5,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: "#171717",
    borderStyle: "solid",
    backgroundColor: "#fff",
    padding: 10,
    overflow: "hidden",
  },
  guideTopBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 2,
  },
  battleGuideTopBorder: {
    backgroundColor: "#171717",
  },
  victoryGuideTopBorder: {
    backgroundColor: "#2776d2",
  },
  advanceWarningTopBorder: {
    backgroundColor: "#e0ad20",
  },
  battleGuideTitle: {
    color: "#171717",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
  },
  victoryGuideSection: {
    gap: 5,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: "#2776d2",
    borderStyle: "solid",
    backgroundColor: "#fff",
    padding: 10,
    overflow: "hidden",
  },
  victoryGuideTitle: {
    color: "#185fae",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
  },
  advanceWarningSection: {
    gap: 7,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: "#e0ad20",
    borderStyle: "solid",
    backgroundColor: "#fffdf3",
    padding: 10,
    overflow: "hidden",
  },
  advanceWarningTitle: {
    color: "#7a4b00",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
  },
  succubusInfoSection: {
    gap: 6,
    borderWidth: 1,
    borderColor: "#b967ff",
    backgroundColor: "#f8efff",
    padding: 10,
  },
  succubusInfoTitle: {
    color: "#713593",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
  },
  succubusGrowthText: {
    color: "#3d3044",
    fontSize: 12,
    lineHeight: 19,
  },
  warningSectionTitle: {
    color: "#774612",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
  },
  warningBody: {
    color: "#29231d",
    fontSize: 13,
    lineHeight: 20,
  },
  slaveContractWarning: {
    color: "#c51624",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "900",
  },
  statusGuideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 105, 180, 0.34)",
    backgroundColor: "#fff5fa",
    padding: 9,
  },
  statusGuideIcon: {
    width: 58,
    height: 58,
  },
  statusGuideText: {
    flex: 1,
    gap: 2,
  },
  statusGuideName: {
    color: "#b72872",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  defeatWarningSection: {
    gap: 5,
    borderWidth: 1,
    borderColor: "#e53945",
    backgroundColor: "#fff0f1",
    padding: 10,
  },
  defeatWarningTitle: {
    color: "#c51624",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
  },
  defeatWarningText: {
    color: "#c51624",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "800",
  },
  warningCloseButton: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d99a45",
    backgroundColor: "#9b651d",
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  warningCloseButtonText: {
    color: "#fff",
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
    gap: 8,
    justifyContent: "center",
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
  mapSuccubusMarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mapSuccubusMarkIcon: {
    width: 18,
    height: 18,
  },
  succubusMarkStatusText: {
    color: "#ff45e6",
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
  mapMovingOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 90,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.82)",
  },
  mapMovingText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  statGaugeWrap: { flexGrow: 0, flexShrink: 0, minWidth: 86, gap: 2 },
  statGaugeLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 5 },
  statGaugeLabel: { color: "#fff", fontSize: 9, fontWeight: "900" },
  statGaugeValue: { color: "#fff", fontSize: 8, fontWeight: "900" },
  statGaugeTrack: { height: 9, overflow: "hidden", borderWidth: 1, borderColor: "#fff", backgroundColor: "#242424" },
  statGaugeFill: { height: "100%" },
  statusCheckButton: { width: "100%", minHeight: 25, marginTop: 2, borderWidth: 1, borderColor: "#ff69b4", paddingVertical: 3, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,180,0.13)", overflow: "hidden" },
  statusCheckButtonText: { color: "#ff86c5", fontSize: 8, lineHeight: 11, fontWeight: "900", textAlign: "center" },
  mapInfoButton: {
    width: "100%",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  mapInfoButtonText: { color: "#111", fontSize: 11, lineHeight: 16, fontWeight: "900", textAlign: "center" },
  statusModal: { width: "88%", maxHeight: "78%", gap: 14, borderWidth: 2, borderColor: "#ff69b4", backgroundColor: "#111", padding: 16 },
  playerStatusModalList: { gap: 12 },
  playerStatusModalLevel: { color: "#fff", fontSize: 28, lineHeight: 34, fontWeight: "900" },
  playerStatusModalText: { color: "#fff", fontSize: 14, lineHeight: 20, fontWeight: "900" },
  battleCommandModal: { width: "88%", maxHeight: "88%", gap: 12, borderWidth: 2, borderColor: "#ff69b4", backgroundColor: "#111", padding: 16 },
  battleCommandModalList: { gap: 8 },
  statusModalList: { gap: 10 },
  statusModalRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#683252", padding: 9, backgroundColor: "#1d1119" },
  statusModalImage: { width: 48, height: 48 },
  statusModalCopy: { flex: 1, gap: 3 },
  statusModalName: { color: "#ff69b4", fontSize: 14, fontWeight: "900" },
  statusModalCure: { color: "#fff", fontSize: 11, lineHeight: 17, fontWeight: "700" },
  statusModalEmpty: { color: "#ddd", fontSize: 12, lineHeight: 18 },
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
  fadeOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    elevation: 100,
    backgroundColor: "#000",
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
    zIndex: 1,
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
    top: 10,
    right: 12,
    left: 12,
    zIndex: 5,
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
    zIndex: 2,
  },
  enemyLargeImage: {
    width: "100%",
    height: "100%",
    zIndex: 2,
  },
  enemyBattleBackdrop: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
    opacity: 0.24,
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
    zIndex: 20,
    elevation: 20,
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
    zIndex: 20,
    elevation: 20,
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
  battleCommandGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  battleCommandGridItem: {
    width: "48%",
  },
  succubusMarkBattleNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#ff45e6",
    backgroundColor: "rgba(87, 0, 92, 0.68)",
    padding: 8,
  },
  succubusMarkBattleIcon: {
    width: 30,
    height: 30,
  },
  succubusMarkBattleText: {
    color: "#ff8cf0",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
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
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#ff69b4",
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: "rgba(255, 105, 180, 0.1)",
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  statusEffectMark: {
    width: 22,
    height: 22,
  },
  statusEffectLabel: {
    flex: 1,
    color: "#ff69b4",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  damageFlash: { position: "absolute", zIndex: 60, color: "#ff263d", fontSize: 20, fontWeight: "900", textShadowColor: "#000", textShadowRadius: 4 },
  damageFlashEnemy: { top: 70, alignSelf: "center" },
  damageFlashPlayer: { right: 20 },
  levelDownFlash: { position: "absolute", zIndex: 40, color: "#4da6ff", fontSize: 20, fontWeight: "900", textShadowColor: "#001a35", textShadowRadius: 5 },
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
