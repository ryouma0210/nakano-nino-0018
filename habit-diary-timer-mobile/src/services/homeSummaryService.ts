import AsyncStorage from "@react-native-async-storage/async-storage";
import { query, queryOne } from "../database/client";
import { contractSettingsSchema, dailyOrderSchema } from "../schemas/storage";
import { toDateKey } from "../utils/date";
import { trainingNeedsPunishment } from "../features/training/trainingOutcome";
import type { ManagementCycle, ManagementDailyTask } from "../repositories/roomRepository";
import type { DailyOrder } from "./gameRoomService";

export type HomeTask = {
  id: string;
  title: string;
  detail?: string;
  dayProgress?: { currentDay: number; totalDays: number };
  pointProgress?: { earned: number; limit: number };
  eligible: boolean;
  completed: boolean;
  status: string;
  href: string;
};

export type HomeSummary = {
  date: string;
  availablePoints: number;
  todayEarnedPoints: number;
  completedCount: number;
  eligibleCount: number;
  tasks: HomeTask[];
};

type HomeSnapshot = {
  date: string;
  availablePoints: number;
  todayEarnedPoints: number;
  outsideEarnedPoints: number;
  loginClaimed: boolean;
  order: DailyOrder | null;
  contractSigned: boolean;
  journals: HomeJournal[];
  preparations: HomePreparation[];
  punishmentHistories: HomePunishmentHistory[];
  cycles: ManagementCycle[];
  managementTasks: ManagementDailyTask[];
};

type HomeJournal = {
  id?: number;
  record_date: string;
  tags: string | null;
  created_at?: string;
  duration_seconds?: number | null;
};
type HomePreparation = { record_date: string; completed_at: string };
type HomePunishmentHistory = {
  timer_name: string;
  ended_at: string | null;
  completion_status: string;
  actual_duration_seconds: number;
};

const taskDisplayOrder: Record<string, number> = {
  "login-bonus": 0,
  defeat: 1,
  brainwash: 2,
  preparation: 3,
  "daily-order": 4,
  training: 5,
  management: 6,
  punishment: 7,
  outside: 8,
};
const outsideDailyPointLimit = 100;

export function buildHomeSummary(snapshot: HomeSnapshot): HomeSummary {
  const order = snapshot.order?.date === snapshot.date ? snapshot.order : null;
  const todayJournals = snapshot.journals.filter((journal) => journal.record_date === snapshot.date);
  const journalHasTags = (journal: HomeJournal, ...tags: string[]) => {
    const savedTags = new Set((journal.tags ?? "").split(",").map((tag) => tag.trim()));
    return tags.every((tag) => savedTags.has(tag));
  };
  const hasJournalTags = (...tags: string[]) => todayJournals.some((journal) => journalHasTags(journal, ...tags));
  const latestTraining = todayJournals
    .filter((journal) => journalHasTags(journal, "調教", "完了", "射精記録"))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || (b.id ?? 0) - (a.id ?? 0))[0];
  const punishmentRequired = Boolean(latestTraining && trainingNeedsPunishment(latestTraining) === true);
  const latestTrainingAt = latestTraining?.created_at;
  const punishmentCompleted = punishmentRequired && snapshot.punishmentHistories.some((history) => history.timer_name === "お仕置き"
    && history.completion_status === "completed"
    && history.ended_at?.slice(0, 10) === snapshot.date
    && latestTrainingAt != null
    && history.ended_at >= latestTrainingAt
    && Number(history.actual_duration_seconds) > 0);
  const defeatCompleted = snapshot.contractSigned && hasJournalTags("敗北部屋");
  const outsideEarnedPoints = Number.isFinite(snapshot.outsideEarnedPoints)
    ? Math.max(0, Math.min(outsideDailyPointLimit, snapshot.outsideEarnedPoints)) : 0;
  const outsideCompleted = outsideEarnedPoints >= outsideDailyPointLimit;
  const tasks: HomeTask[] = [
    {
      id: "login-bonus",
      title: "ログインボーナス",
      eligible: true,
      completed: snapshot.loginClaimed,
      status: snapshot.loginClaimed ? "受取済み" : "未受取",
      href: "/(tabs)/today",
    },
    {
      id: "daily-order",
      title: "本日の命令",
      eligible: true,
      completed: order?.completed ?? false,
      status: order?.completed ? "完了済み" : order ? "未完了" : "未抽選",
      href: "/(tabs)/orders",
    },
  ];

  const rooms = [
    {
      id: "preparation", title: "準備部屋", href: "/(tabs)/preparation",
      completed: snapshot.preparations.some((record) => record.record_date === snapshot.date && Boolean(record.completed_at))
        && hasJournalTags("準備部屋"),
    },
    {
      id: "brainwash", title: "洗脳部屋", href: "/(tabs)/brainwash",
      completed: hasJournalTags(`洗脳部屋${snapshot.date}`),
    },
    {
      id: "training", title: "調教部屋", href: "/(tabs)/habits",
      completed: hasJournalTags("調教", "完了", "射精記録"),
    },
  ];
  tasks.push(...rooms.map((room) => ({ ...room, eligible: true, status: room.completed ? "完了済み" : "未完了" })));
  tasks.push(
    {
      id: "outside", title: "館の外", detail: "スライム倒し", href: "/(tabs)/outside",
      pointProgress: { earned: outsideEarnedPoints, limit: outsideDailyPointLimit },
      eligible: true,
      completed: outsideCompleted,
      status: outsideCompleted ? "完了済み" : "未完了",
    },
    {
      id: "punishment", title: "お仕置き部屋", href: "/(tabs)/timer",
      eligible: punishmentRequired,
      completed: punishmentCompleted,
      status: !punishmentRequired ? "対象外" : punishmentCompleted ? "完了済み" : "未完了",
    },
    {
      id: "defeat", title: "敗北部屋",
      href: snapshot.contractSigned ? "/(tabs)/defeat" : "/(tabs)/contract",
      eligible: snapshot.contractSigned,
      completed: defeatCompleted,
      status: !snapshot.contractSigned ? "未契約" : defeatCompleted ? "完了済み" : "未完了",
    },
  );

  const latestActiveCycles = new Map<string, number>();
  for (const cycle of snapshot.cycles) {
    if (Number(cycle.is_active) === 1) {
      latestActiveCycles.set(cycle.mode, Math.max(latestActiveCycles.get(cycle.mode) ?? 0, cycle.id));
    }
  }

  let hasManagementTask = false;
  for (const cycle of snapshot.cycles) {
    if (cycle.start_date > snapshot.date || cycle.end_date < snapshot.date) continue;
    const task = snapshot.managementTasks.find((item) => item.cycle_id === cycle.id && item.record_date === snapshot.date);
    const active = Number(cycle.is_active) === 1 && latestActiveCycles.get(cycle.mode) === cycle.id;
    // Completing the final day marks the cycle inactive. Keep that completed
    // task in today's total so finishing it does not reduce the progress count.
    const finishedToday = Number(cycle.is_active) === 0 && cycle.end_date === snapshot.date && Boolean(task?.completed_at);
    if (!active && !finishedToday) continue;
    // Calendar dates in UTC avoid local daylight-saving changes affecting day counts.
    const start = Date.parse(`${cycle.start_date}T00:00:00Z`);
    const currentDay = Math.round((Date.parse(`${snapshot.date}T00:00:00Z`) - start) / 86400000) + 1;
    const totalDays = Math.round((Date.parse(`${cycle.end_date}T00:00:00Z`) - start) / 86400000) + 1;
    if (!Number.isFinite(currentDay) || !Number.isFinite(totalDays) || currentDay < 1 || currentDay > totalDays) continue;
    tasks.push({
      id: `management:${cycle.id}`,
      title: "射精管理部屋",
      detail: cycle.mode === "release" ? "貞操帯なし" : "貞操帯あり",
      dayProgress: { currentDay, totalDays },
      eligible: true,
      completed: Boolean(task?.completed_at),
      status: task?.completed_at ? "完了済み" : "未完了",
      href: "/(tabs)/management",
    });
    hasManagementTask = true;
  }
  if (!hasManagementTask) {
    tasks.push({
      id: "management", title: "射精管理部屋", href: "/(tabs)/management",
      eligible: false, completed: false, status: "管理期間外",
    });
  }

  tasks.sort((a, b) => Number(b.eligible) - Number(a.eligible)
    || (taskDisplayOrder[a.id.split(":")[0]] ?? Number.MAX_SAFE_INTEGER)
      - (taskDisplayOrder[b.id.split(":")[0]] ?? Number.MAX_SAFE_INTEGER));

  return {
    date: snapshot.date,
    availablePoints: snapshot.availablePoints,
    todayEarnedPoints: snapshot.todayEarnedPoints,
    completedCount: tasks.filter((task) => task.eligible && task.completed).length,
    eligibleCount: tasks.filter((task) => task.eligible).length,
    tasks,
  };
}

async function readContractSigned(): Promise<boolean> {
  const raw = await AsyncStorage.getItem("nino-room:contract");
  if (!raw) return false;
  try {
    const parsed = contractSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success && Boolean(parsed.data.signedAt);
  } catch {
    return false;
  }
}

async function readDailyOrder(date: string): Promise<DailyOrder | null> {
  const raw = await AsyncStorage.getItem(`nino-room:daily-order:${date}`);
  if (!raw) return null;
  try {
    const parsed = dailyOrderSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.date === date ? parsed.data : null;
  } catch {
    return null;
  }
}

export const homeSummaryService = {
  async load(date = toDateKey()): Promise<HomeSummary> {
    // Existing balance/order/management readers also reconcile rewards,
    // create journals, or generate instructions. Home only reads saved data.
    const [order, contractSigned] = await Promise.all([readDailyOrder(date), readContractSigned()]);
    const activityPoints = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(points), 0) AS total FROM point_transactions",
    )?.total ?? 0;
    const spent = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(points_spent), 0) AS total FROM reward_redemptions",
    )?.total ?? 0;
    const todayEarnedPoints = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(points), 0) AS total FROM point_transactions WHERE points > 0 AND substr(created_at, 1, 10)=?",
      [date],
    )?.total ?? 0;
    const runtimeAppEnv = process.env.EXPO_PUBLIC_APP_ENV
      ?? (globalThis as typeof globalThis & { __NINO_APP_ENV__?: string }).__NINO_APP_ENV__;
    const stgBonus = runtimeAppEnv === "stg" ? 99999 : 0;
    const lastClaimedDate = queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1",
      ["login_bonus_last_claimed_date"],
    )?.setting_value;
    const outsidePointDate = queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1",
      ["outside_game_point_date"],
    )?.setting_value;
    const outsideEarnedPoints = outsidePointDate === date ? Number(queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1",
      ["outside_game_point_today"],
    )?.setting_value) : 0;

    return buildHomeSummary({
      date,
      availablePoints: Number(activityPoints) + stgBonus - Number(spent),
      todayEarnedPoints: Number(todayEarnedPoints),
      outsideEarnedPoints,
      loginClaimed: lastClaimedDate === date,
      order,
      contractSigned,
      journals: query<HomeJournal>("SELECT id, record_date, tags, created_at, duration_seconds FROM journals WHERE record_date=?", [date]),
      preparations: query<HomePreparation>("SELECT record_date, completed_at FROM preparation_records WHERE record_date=?", [date]),
      punishmentHistories: query<HomePunishmentHistory>(
        "SELECT timer_name, ended_at, completion_status, actual_duration_seconds FROM timer_histories WHERE timer_name=? AND substr(ended_at, 1, 10)=?",
        ["お仕置き", date],
      ),
      cycles: query<ManagementCycle>("SELECT * FROM management_cycles"),
      managementTasks: query<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE record_date=?", [date]),
    });
  },
};
