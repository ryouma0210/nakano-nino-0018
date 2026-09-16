import { pointRepository } from "@/repositories/rewardRepository";
import { outsideAchievementStats } from "@/features/outside/achievements";
import { readSetting, saveSetting } from "@/features/outside/gameState";
import { toDateKey } from "@/utils/date";

type QuestMetric = "slimeDefeat" | "purify" | "escape" | "victory" | "victoryQueen";

export type QuestView = {
  id: string;
  title: string;
  condition: string;
  reward: number;
  current: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  locked?: boolean;
};

type QuestDefinition = {
  id: string;
  title: string;
  condition: string;
  metric: QuestMetric;
  target: number;
};

const dailyDefinitions: QuestDefinition[] = [
  { id: "slime", title: "毎日の討伐", condition: "スライムを5体倒す", metric: "slimeDefeat", target: 5 },
  { id: "purify", title: "毎日の浄化", condition: "浄化の水辺を1回利用する", metric: "purify", target: 1 },
  { id: "escape", title: "生還訓練", condition: "サキュバスから1回逃走する", metric: "escape", target: 1 },
];

const storyDefinitions: QuestDefinition[] = [
  { id: "stage-1", title: "第1段階　百体討伐", condition: "スライムを100体倒す", metric: "slimeDefeat", target: 100 },
  { id: "stage-2", title: "第2段階　浄化の巡礼", condition: "浄化の水辺を50回利用する", metric: "purify", target: 50 },
  { id: "stage-3", title: "第3段階　逃走の極意", condition: "サキュバスから30回逃走する", metric: "escape", target: 30 },
  { id: "stage-4", title: "第4段階　誘惑狩り", condition: "サキュバスに30回勝利する", metric: "victory", target: 30 },
  { id: "stage-5", title: "第5段階　女王征服", condition: "女王サキュバスに10回勝利する", metric: "victoryQueen", target: 10 },
];

const dailyDateKey = "outside_daily_quest_date";
const dailyBaselineKey = "outside_daily_quest_baseline";
const dailyClaimPrefix = "outside_daily_quest_claimed_";
const storyClaimPrefix = "outside_story_quest_claimed_";

function metricValue(metric: QuestMetric) {
  const stats = outsideAchievementStats();
  return metric === "victoryQueen" ? stats.victoryQueen : stats[metric];
}

function dailyBaseline(): Record<QuestMetric, number> {
  const today = toDateKey();
  if (readSetting(dailyDateKey) !== today) {
    const baseline = {
      slimeDefeat: metricValue("slimeDefeat"),
      purify: metricValue("purify"),
      escape: metricValue("escape"),
      victory: metricValue("victory"),
      victoryQueen: metricValue("victoryQueen"),
    };
    saveSetting(dailyDateKey, today);
    saveSetting(dailyBaselineKey, JSON.stringify(baseline));
    return baseline;
  }
  try {
    return JSON.parse(readSetting(dailyBaselineKey) ?? "{}") as Record<QuestMetric, number>;
  } catch {
    return { slimeDefeat: 0, purify: 0, escape: 0, victory: 0, victoryQueen: 0 };
  }
}

export function dailyQuestViews(): QuestView[] {
  const today = toDateKey();
  const baseline = dailyBaseline();
  return dailyDefinitions.map((quest) => {
    const current = Math.max(0, metricValue(quest.metric) - Number(baseline[quest.metric] ?? 0));
    return {
      ...quest,
      reward: 10,
      current: Math.min(current, quest.target),
      completed: current >= quest.target,
      claimed: readSetting(`${dailyClaimPrefix}${today}_${quest.id}`) === "1",
    };
  });
}

export function storyQuestViews(): QuestView[] {
  let previousClaimed = true;
  return storyDefinitions.map((quest) => {
    const current = metricValue(quest.metric);
    const claimed = readSetting(`${storyClaimPrefix}${quest.id}`) === "1";
    const view = {
      ...quest,
      reward: 50,
      current: Math.min(current, quest.target),
      completed: current >= quest.target,
      claimed,
      locked: !previousClaimed,
    };
    previousClaimed = claimed;
    return view;
  });
}

export function claimQuest(kind: "daily" | "story", questId: string) {
  const quests = kind === "daily" ? dailyQuestViews() : storyQuestViews();
  const quest = quests.find((item) => item.id === questId);
  if (!quest || quest.locked || !quest.completed || quest.claimed) return false;
  const datePart = kind === "daily" ? `${toDateKey()}:` : "";
  const sourceKey = `outside-quest:${kind}:${datePart}${questId}`;
  if (!pointRepository.award(sourceKey, quest.reward, `${quest.title}を達成`)) return false;
  saveSetting(
    kind === "daily" ? `${dailyClaimPrefix}${toDateKey()}_${questId}` : `${storyClaimPrefix}${questId}`,
    "1",
  );
  return true;
}
