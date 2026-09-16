export const requiredContractRuleTexts = [
  "私の命令は絶対服従すること。",
  "私の許可なしに射精しないこと。",
  "私のATMになること。",
  "調教を受ける際は、首輪を着用すること。",
] as const;

export const chastityContractRule =
  "調教を受ける際は、貞操帯を着用すること。（任意）";

export const contractReleaseDescription =
  "契約中は追加ルールが適用されます。解除は館の外の紫のクリスタルで行えます。";

export function additionalContractRules() {
  return [
    "敗北部屋を解放する。",
    "ループ音声を解放する。",
    "お仕置き部屋のタイマーは最低30分になります。",
    "各画面に契約者向けコメントを追加（赤文字表記）",
    "館の外では状態異常「服従」が追加（詳細は看板で確認）",
  ];
}
