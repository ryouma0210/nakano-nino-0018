import type { ImageSourcePropType } from "react-native";

export type NinoOutfit = {
  key: string;
  name: string;
  unlock: string;
  cost: number;
  source: ImageSourcePropType;
  video?: number;
};

export const ninoOutfits: NinoOutfit[] = [
  {
    key: "default",
    name: "通常衣装",
    unlock: "初期衣装",
    cost: 0,
    source: require("../../assets/characters/home-nino.png"),
  },
  {
    key: "school",
    name: "制服",
    unlock: "50ptで交換",
    cost: 50,
    source: require("../../assets/characters/nino-outfit-school.png"),
  },
  {
    key: "black-suit",
    name: "黒スーツ",
    unlock: "50ptで交換",
    cost: 50,
    source: require("../../assets/characters/nino-outfit-black-suit.png"),
  },
  {
    key: "maid",
    name: "メイド服",
    unlock: "50ptで交換",
    cost: 50,
    source: require("../../assets/characters/nino-outfit-maid.png"),
  },
  {
    key: "nurse",
    name: "ナース服",
    unlock: "50ptで交換",
    cost: 50,
    source: require("../../assets/characters/nino-outfit-nurse.png"),
  },
  {
    key: "bunny",
    name: "バニー",
    unlock: "50ptで交換",
    cost: 50,
    source: require("../../assets/characters/nino-outfit-bunny.png"),
  },
  {
    key: "queen",
    name: "女王様",
    unlock: "50ptで交換",
    cost: 50,
    source: require("../../assets/characters/nino-outfit-queen.png"),
  },
  {
    key: "rubber",
    name: "ラバー",
    unlock: "50ptで交換",
    cost: 50,
    source: require("../../assets/characters/nino-outfit-rubber.png"),
  },
  {
    key: "pink-bondage",
    name: "ピンクゴシック",
    unlock: "50ptで交換",
    cost: 50,
    source: require("../../assets/characters/nino-outfit-pink-gothic.png"),
  },
  {
    key: "black-dress",
    name: "黒ドレス",
    unlock: "50ptで交換",
    cost: 50,
    source: require("../../assets/characters/nino-outfit-black-dress.png"),
  },
];

export const exchangeableNinoOutfits = ninoOutfits.filter(
  (outfit) => outfit.key !== "default",
);
