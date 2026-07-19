import type { ContractSettings } from "@/services/gameRoomService";

export const requiredContractRuleTexts = [
  "私の命令は絶対服従すること。",
  "私の許可なしに射精しないこと。",
  "私のATMになること。",
  "調教を受ける際は、首輪を着用すること。",
] as const;

export const chastityContractRule =
  "調教を受ける際は、貞操帯を着用すること。（任意）";

export function additionalContractRules(contract: ContractSettings) {
  const notes = contract.note
    .split(/\r?\n/)
    .map((line) => line.replace(/^[・●✅□\-\s]+/, "").trim())
    .filter(Boolean);
  return [
    `お仕置きは最低${contract.maxPunishmentMinutes}分受けること。`,
    ...notes,
  ];
}
