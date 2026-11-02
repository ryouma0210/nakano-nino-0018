export type PointMilestone = {
  id: string;
  points: number;
  title: string;
  message: string;
};

export const POINT_MILESTONES: readonly PointMilestone[] = [
  { id: "points-100", points: 100, title: "はじめの一歩", message: "100Pt達成、おめでとう。少しずつ続けた成果が形になったね。" },
  { id: "points-500", points: 500, title: "積み重ねの証", message: "500Pt達成。毎日の積み重ね、ちゃんと見ているよ。これからも自分のペースでね。" },
  { id: "points-1000", points: 1000, title: "最初の大きな節目", message: "1,000Pt達成、おめでとう。今日はここまで頑張った自分を褒めてあげてね。" },
  { id: "points-3000", points: 3000, title: "続ける力", message: "3,000Pt達成。続けるって簡単なことじゃないよ。ここまでの歩みを大切にしてね。" },
  { id: "points-5000", points: 5000, title: "たくさんの思い出", message: "5,000Pt達成、おめでとう。一緒に過ごした時間が、こんなにたくさん積み重なったね。" },
  { id: "points-10000", points: 10000, title: "一万ポイントの記念日", message: "10,000Pt達成。本当におめでとう。これからも、あなたのペースで思い出を増やしていこうね。" },
];

export const POINT_MILESTONE_SETTING_KEY = "point-milestones:v1";
export const pointMilestoneDataError = "ポイントイベントの記録を読み込めませんでした。";

export type PointMilestoneState = {
  version: 1;
  unlocked: string[];
  acknowledged: string[];
};

export type PointMilestoneSnapshot = {
  earned: number;
  unlocked: PointMilestone[];
  pending: PointMilestone[];
  next: PointMilestone | null;
};

const milestoneIds = new Set(POINT_MILESTONES.map((milestone) => milestone.id));

function validIds(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every((id) => typeof id === "string" && milestoneIds.has(id))
    && new Set(value).size === value.length;
}

export function parsePointMilestoneState(raw: string | null): PointMilestoneState {
  if (raw === null) return { version: 1, unlocked: [], acknowledged: [] };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(pointMilestoneDataError); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(pointMilestoneDataError);
  const state = value as PointMilestoneState;
  if (state.version !== 1 || !validIds(state.unlocked) || !validIds(state.acknowledged)
    || !state.acknowledged.every((id) => state.unlocked.includes(id))) throw new Error(pointMilestoneDataError);
  return { version: 1, unlocked: [...state.unlocked], acknowledged: [...state.acknowledged] };
}

export function pointMilestoneSnapshot(earned: number, state: PointMilestoneState): PointMilestoneSnapshot {
  return {
    earned,
    unlocked: POINT_MILESTONES.filter((milestone) => state.unlocked.includes(milestone.id)),
    pending: POINT_MILESTONES.filter((milestone) => state.unlocked.includes(milestone.id) && !state.acknowledged.includes(milestone.id)),
    next: POINT_MILESTONES.find((milestone) => !state.unlocked.includes(milestone.id)) ?? null,
  };
}

/** Validate before backup restoration; never award points or unlock events here. */
export function validatePointMilestoneSettings(rows: Record<string, unknown>[]) {
  const matches = rows.filter((row) => row.setting_key === POINT_MILESTONE_SETTING_KEY);
  if (matches.length > 1) throw new Error(pointMilestoneDataError);
  for (const row of matches) {
    if (typeof row.setting_value !== "string") throw new Error(pointMilestoneDataError);
    parsePointMilestoneState(row.setting_value);
  }
}
