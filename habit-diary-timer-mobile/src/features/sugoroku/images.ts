import type { ImageSourcePropType } from "react-native";

/**
 * すごろくの画像設定。画像は assets/sugoroku/ に配置します。
 *
 * スタートのスライド順は SUGOROKU_START_IMAGES、各マスは SUGOROKU_IMAGES で設定します。
 * 画像を差し替えるときは、対応する require(...) のファイル名を変更してください。
 *
 * require() は実在するファイルへのパスを文字列で直接指定します。
 * 詳しい手順: assets/sugoroku/README.md
 */
export const SUGOROKU_START_IMAGES: readonly ImageSourcePropType[] = [
  require("../../../assets/sugoroku/Map1.jpg"),
  require("../../../assets/sugoroku/Map2.jpg"),
];

export const SUGOROKU_IMAGES: Readonly<Partial<Record<string, ImageSourcePropType>>> = {
  // スタート
  start: SUGOROKU_START_IMAGES[0],

  // マイナスゾーン
  "-6": require("../../../assets/sugoroku/No.-6.jpg"),
  "-5": require("../../../assets/sugoroku/No.-5.jpg"),
  "-4": require("../../../assets/sugoroku/No.-4.jpg"),
  "-3": require("../../../assets/sugoroku/No.-3.jpg"),
  "-2": require("../../../assets/sugoroku/No.-2.jpg"),
  "-1": require("../../../assets/sugoroku/No.-1.jpg"),

  // 通常マス（強制停止の 7・14・21・25 も、この番号で設定）
  "1": require("../../../assets/sugoroku/No.1.jpg"),
  "2": require("../../../assets/sugoroku/No.2.jpg"),
  "3": require("../../../assets/sugoroku/No.3.jpg"),
  "4": require("../../../assets/sugoroku/No.4.jpg"),
  "5": require("../../../assets/sugoroku/No.5.jpg"),
  "6": require("../../../assets/sugoroku/No.6.jpg"),
  "7": require("../../../assets/sugoroku/No.7_kyouseistop.jpg"),
  "8": require("../../../assets/sugoroku/No.8.jpg"),
  "9": require("../../../assets/sugoroku/No.9.jpg"),
  "10": require("../../../assets/sugoroku/No.10.jpg"),
  "11": require("../../../assets/sugoroku/No.11.jpg"),
  "12": require("../../../assets/sugoroku/No.12.jpg"),
  "13": require("../../../assets/sugoroku/No.13.jpg"),
  "14": require("../../../assets/sugoroku/No.14_kyouseistop.jpg"),
  "15": require("../../../assets/sugoroku/No.15.jpg"),
  "16": require("../../../assets/sugoroku/No.16.jpg"),
  "17": require("../../../assets/sugoroku/No.17.jpg"),
  "18": require("../../../assets/sugoroku/No.18.jpg"),
  "19": require("../../../assets/sugoroku/No.19.jpg"),
  "20": require("../../../assets/sugoroku/No.20.jpg"),
  "21": require("../../../assets/sugoroku/No.21_kyouseistop.jpg"),
  "22": require("../../../assets/sugoroku/No.22.jpg"),
  "23": require("../../../assets/sugoroku/No.23.jpg"),
  "24": require("../../../assets/sugoroku/No.24.jpg"),
  "25": require("../../../assets/sugoroku/No.25.jpg"),
  "26": require("../../../assets/sugoroku/No.26.jpg"),
  "27": require("../../../assets/sugoroku/No.27.jpg"),
  "28": require("../../../assets/sugoroku/No.28.jpg"),
  "29": require("../../../assets/sugoroku/No.29.jpg"),
  "30": require("../../../assets/sugoroku/No.30.jpg"),
  "31": require("../../../assets/sugoroku/No.31.jpg"),
  "32": require("../../../assets/sugoroku/No.32.jpg"),
  "33": require("../../../assets/sugoroku/No.33.jpg"),
  "34": require("../../../assets/sugoroku/No.34.jpg"),
  "35": require("../../../assets/sugoroku/No.35.jpg"),
  "36": require("../../../assets/sugoroku/No.36.jpg"),
  "37": require("../../../assets/sugoroku/No.37.jpg"),
  "38": require("../../../assets/sugoroku/No.38.jpg"),
  "39": require("../../../assets/sugoroku/No.39.jpg"),
  "40": require("../../../assets/sugoroku/No.40.jpg"),

  // 延長コースに挿入されるストップ
  "stop-1": require("../../../assets/sugoroku/kyouseistop1.jpg"),
  "stop-2": require("../../../assets/sugoroku/kyouseistop2.jpg"),
  "stop-3": require("../../../assets/sugoroku/kyouseistop3.jpg"),
  "stop-4": require("../../../assets/sugoroku/kyouseiidou4.jpg"),

  // ゴール・終了イベント
  "goal-1": require("../../../assets/sugoroku/Map1_GOAL.jpg"),
  "goal-2": require("../../../assets/sugoroku/Map2_GOAL.jpg"),
  retire: require("../../../assets/sugoroku/kyouseiidou.jpg"),
  penalty: require("../../../assets/sugoroku/batuge-mu.jpg"),
};

export function getSugorokuImages(tileId: string): readonly ImageSourcePropType[] {
  if (tileId === "start") return SUGOROKU_START_IMAGES;
  const source = SUGOROKU_IMAGES[tileId];
  return source ? [source] : [];
}
