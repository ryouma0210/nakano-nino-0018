export type NinoOutfit = {
  key: string;
  name: string;
  unlock: string;
  cost: number;
  source: number;
  video?: number;
  lines: string[];
};

export const ninoOutfits: NinoOutfit[] = [
  {
    key: "default",
    name: "通常衣装",
    unlock: "初期衣装",
    cost: 0,
    source: require("../../assets/characters/home-nino.png"),
    video: require("../../assets/videos/nino-room/home-nino_01.mp4"),
    lines: [
      "今日はいつもの私よ。落ち着くでしょ？",
      "この姿の私に戻ってくるなんて、やっぱり基本が好きなのね。",
      "まずはここで深呼吸しなさい。私を見る準備はできた？",
    ],
  },
  {
    key: "school",
    name: "制服",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-school.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-school_01.mp4"),
    lines: [
      "制服姿の私に見下ろされたいの？ほんと素直ね。",
      "学生みたいに、ちゃんと返事しなさい。はい、二ノ様。",
      "この格好だと少し優しく見える？勘違いしないでね。",
    ],
  },
  {
    key: "maid",
    name: "メイド服",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-maid.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-maid_01.mp4"),
    lines: [
      "ご主人様？……違うわよ。アンタが私に仕えるの。",
      "メイド服だからって甘やかすと思った？残念、命令する側は私よ。",
      "掃除するなら、まずそのだらしない顔から綺麗にしなさい。",
    ],
  },
  {
    key: "nurse",
    name: "ナース服",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-nurse.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-nurse_01.mp4"),
    lines: [
      "診察してあげる。まずは情けないところ、全部見せなさい。",
      "脈が速いわね。私の格好だけでそんなに反応するの？",
      "処方箋は服従よ。毎日きちんと守りなさい。",
    ],
  },
  {
    key: "bunny",
    name: "バニー",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-bunny.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-bunny_01.mp4"),
    lines: [
      "この格好が好きなの？視線が分かりやすいわね。",
      "バニーの私に見惚れるのはいいけど、命令は聞き逃さないで。",
      "ほら、もっと嬉しそうな顔しなさい。せっかく見せてあげてるんだから。",
    ],
  },
  {
    key: "rubber",
    name: "ラバー",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-rubber.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-rubber_01.mp4"),
    lines: [
      "黒くて艶々なの、好きでしょ？目、逸らさないで。",
      "この質感に弱いのね。ほんと分かりやすいマゾ。",
      "緊張してる？いいわ、そのまま私に管理されなさい。",
    ],
  },
  {
    key: "pink-bondage",
    name: "ピンクゴシック",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-pink-gothic.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-pink-gothic_01.mp4"),
    lines: [
      "可愛い私も好き？でも中身は甘くないわよ。",
      "ピンクで油断した？可愛い顔で命令されるの、好きなんでしょ。",
      "今日は少しだけ甘くしてあげる。……態度が良ければね。",
    ],
  },
  {
    key: "black-dress",
    name: "黒ドレス",
    unlock: "300ptで交換",
    cost: 300,
    source: require("../../assets/characters/nino-outfit-black-dress.png"),
    video: require("../../assets/videos/nino-room/nino-outfit-black-dress_01.mp4"),
    lines: [
      "特別な私よ。ちゃんと跪いて見上げなさい。",
      "黒ドレスの私に会えるなんて、今日は運がいいわね。",
      "見惚れてないで、ちゃんと褒めなさい。聞いてあげるから。",
    ],
  },
];

export const exchangeableNinoOutfits = ninoOutfits.filter(
  (outfit) => outfit.key !== "default",
);
