import AsyncStorage from "@react-native-async-storage/async-storage";
import { query, queryOne } from "../database/client";
import { contractSettingsSchema, dailyOrderSchema } from "../schemas/storage";
import { toDateKey } from "../utils/date";
import { trainingNeedsPunishment } from "../features/training/trainingOutcome";
import type { ManagementCycle, ManagementDailyTask, ManagementMode } from "../repositories/roomRepository";
import type { DailyOrder } from "./gameRoomService";
import { MANAGEMENT_MINIMUM_DAILY_SPINS, MANAGEMENT_ROULETTE_KEY, parseManagementRoulette, type ManagementRouletteSave } from "./managementRouletteStorage";
import { DAILY_GAME_POINTS, dailyGameRewardService, type DailyRewardGame } from "./dailyGameRewardService";
import { DAILY_ROOM_POINTS } from "../constants/roomPoints";
import { loginBonusRepository } from "../repositories/loginBonusRepository";

export type HomeTask = {
  id: string;
  title: string;
  detail?: string;
  dayProgress?: { currentDay: number; totalDays: number };
  pointProgress: { earned: number; limit: number };
  management?: { mode: ManagementMode | null; deadlineAt: string | null; rouletteSpins: number; rouletteRequired: number };
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
  managementRoulette?: ManagementRouletteSave;
  dailyGameRewards?: { date: string; completedGames: DailyRewardGame[] };
  outsideDailyQuests?: { date: string; claimedQuestIds: string[] };
  pointTransactions?: readonly { source_key: string; points: number }[];
  loginBonus?: { date: string; claimPoints: number };
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
  "outside-daily": 8,
  outside: 9,
  succubus: 10,
  sugoroku: 11,
  othello: 12,
  endurance: 13,
};
const outsideDailyPointLimit = 100;
// Match the three 10-point daily rewards and dated claim flags in outside/quests.ts.
const outsideDailyQuestIds = ["slime", "purify", "escape"];
const outsideDailyQuestReward = 10;

export function buildHomeSummary(snapshot: HomeSnapshot): HomeSummary {
  const pointProgress = (sourceKey: string, limit: number) => {
    const points = snapshot.pointTransactions?.find((row) => row.source_key === sourceKey)?.points ?? 0;
    return { earned: Number.isFinite(points) ? Math.max(0, Math.min(limit, points)) : 0, limit };
  };
  const receivedLoginPoints = snapshot.pointTransactions?.find((row) => row.source_key === `login-bonus:${snapshot.date}`)?.points;
  const loginPointLimit = receivedLoginPoints !== undefined && [1, 10, 50].includes(receivedLoginPoints)
    ? receivedLoginPoints
    : snapshot.loginBonus?.date === snapshot.date && [1, 10, 50].includes(snapshot.loginBonus.claimPoints)
      ? snapshot.loginBonus.claimPoints : 1;
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
  const claimedDailyQuests = new Set(snapshot.outsideDailyQuests?.date === snapshot.date
    ? snapshot.outsideDailyQuests.claimedQuestIds : []);
  const outsideDailyQuestPoints = outsideDailyQuestIds.filter((id) => claimedDailyQuests.has(id)).length * outsideDailyQuestReward;
  const outsideDailyQuestLimit = outsideDailyQuestIds.length * outsideDailyQuestReward;
  const outsideDailyQuestsCompleted = outsideDailyQuestPoints === outsideDailyQuestLimit;
  const tasks: HomeTask[] = [
    {
      id: "login-bonus",
      title: "ログインボーナス",
      pointProgress: pointProgress(`login-bonus:${snapshot.date}`, loginPointLimit),
      eligible: true,
      completed: snapshot.loginClaimed,
      status: snapshot.loginClaimed ? "受取済み" : "未受取",
      href: "/(tabs)/today",
    },
    {
      id: "daily-order",
      title: "本日の命令",
      pointProgress: pointProgress(`daily-order:${snapshot.date}`, DAILY_ROOM_POINTS.dailyOrder),
      eligible: true,
      completed: order?.completed ?? false,
      status: order?.completed ? "完了済み" : order ? "未完了" : "未抽選",
      href: "/(tabs)/orders",
    },
  ];

  const rooms = [
    {
      id: "preparation", title: "準備部屋", href: "/(tabs)/preparation",
      pointProgress: pointProgress(`preparation:${snapshot.date}`, DAILY_ROOM_POINTS.preparation),
      completed: snapshot.preparations.some((record) => record.record_date === snapshot.date && Boolean(record.completed_at))
        && hasJournalTags("準備部屋"),
    },
    {
      id: "brainwash", title: "洗脳部屋", href: "/(tabs)/brainwash",
      pointProgress: pointProgress(`brainwash:${snapshot.date}`, DAILY_ROOM_POINTS.brainwash),
      completed: hasJournalTags(`洗脳部屋${snapshot.date}`),
    },
    {
      id: "training", title: "調教部屋（初回のみ）", href: "/(tabs)/habits",
      pointProgress: pointProgress(`training:${snapshot.date}`, DAILY_ROOM_POINTS.training),
      completed: hasJournalTags("調教", "完了", "射精記録"),
    },
  ];
  tasks.push(...rooms.map((room) => ({ ...room, eligible: true, status: room.completed ? "完了済み" : "未完了" })));
  const completedGames = new Set(snapshot.dailyGameRewards?.date === snapshot.date ? snapshot.dailyGameRewards.completedGames : []);
  const gameTasks: { id: DailyRewardGame; title: string; detail: string; href: string }[] = [
    { id: "succubus", title: "館の外", detail: "サキュバス討伐", href: "/(tabs)/outside" },
    { id: "sugoroku", title: "すごろく", detail: "初回クリア報酬（難易度共通）", href: "/(tabs)/sugoroku" },
    { id: "endurance", title: "勃起我慢", detail: "初回クリア報酬（難易度共通）", href: "/(tabs)/endurance" },
    { id: "othello", title: "オセロ", detail: "初回クリア報酬（難易度共通）", href: "/(tabs)/othello" },
  ];
  tasks.push(...gameTasks.map((game) => {
    const completed = completedGames.has(game.id);
    const limit = DAILY_GAME_POINTS[game.id];
    return { ...game, eligible: true, completed, status: completed ? "完了済み" : "未完了", pointProgress: { earned: completed ? limit : 0, limit } };
  }));
  tasks.push(
    {
      id: "outside-daily", title: "館の外", detail: "デイリー", href: "/(tabs)/outside",
      pointProgress: { earned: outsideDailyQuestPoints, limit: outsideDailyQuestLimit },
      eligible: true,
      completed: outsideDailyQuestsCompleted,
      status: outsideDailyQuestsCompleted ? "完了済み" : "未完了",
    },
    {
      id: "outside", title: "館の外", detail: "スライム倒し", href: "/(tabs)/outside",
      pointProgress: { earned: outsideEarnedPoints, limit: outsideDailyPointLimit },
      eligible: true,
      completed: outsideCompleted,
      status: outsideCompleted ? "完了済み" : "未完了",
    },
    {
      id: "punishment", title: "お仕置き部屋（初回のみ）", href: "/(tabs)/timer",
      pointProgress: pointProgress(`punishment:${snapshot.date}`, DAILY_ROOM_POINTS.punishment),
      eligible: punishmentRequired,
      completed: punishmentCompleted,
      status: !punishmentRequired ? "対象外" : punishmentCompleted ? "完了済み" : "未完了",
    },
    {
      id: "defeat", title: "敗北部屋",
      pointProgress: pointProgress(`defeat:${snapshot.date}`, DAILY_ROOM_POINTS.defeat),
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
    if (cycle.start_date > snapshot.date || cycle.end_date < cycle.start_date) continue;
    const task = snapshot.managementTasks.find((item) => item.cycle_id === cycle.id && item.record_date === snapshot.date);
    const active = Number(cycle.is_active) === 1 && latestActiveCycles.get(cycle.mode) === cycle.id;
    // Completing the final day marks the cycle inactive. Keep that completed
    // task in today's total so finishing it does not reduce the progress count.
    const finishedToday = Number(cycle.is_active) === 0 && cycle.end_date <= snapshot.date && Boolean(task?.completed_at);
    if (!active && !finishedToday) continue;
    // Calendar dates in UTC avoid local daylight-saving changes affecting day counts.
    const start = Date.parse(`${cycle.start_date}T00:00:00Z`);
    const currentDay = Math.round((Date.parse(`${snapshot.date}T00:00:00Z`) - start) / 86400000) + 1;
    // Passing the deadline does not release an active period. Keep today's
    // required roulette visible, including when release is completed late.
    const plannedDays = Math.round((Date.parse(`${cycle.end_date}T00:00:00Z`) - start) / 86400000) + 1;
    const totalDays = Math.max(plannedDays, currentDay);
    if (!Number.isFinite(currentDay) || !Number.isFinite(totalDays) || currentDay < 1 || currentDay > totalDays) continue;
    const roulette = snapshot.managementRoulette?.cycles.find((saved) => saved.cycleId === cycle.id);
    tasks.push({
      id: `management:${cycle.id}`,
      title: "射精管理部屋",
      pointProgress: task ? pointProgress(`management-task:${task.id}`, DAILY_ROOM_POINTS.management)
        : { earned: 0, limit: DAILY_ROOM_POINTS.management },
      detail: cycle.mode === "release" ? "貞操帯なし" : "貞操帯あり",
      dayProgress: { currentDay, totalDays },
      management: {
        mode: cycle.mode,
        deadlineAt: roulette?.deadlineAt ?? new Date(`${cycle.end_date}T00:00:00`).toISOString(),
        rouletteSpins: roulette?.days.find((day) => day.date === snapshot.date)?.draws.length ?? 0,
        rouletteRequired: MANAGEMENT_MINIMUM_DAILY_SPINS,
      },
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
      pointProgress: { earned: 0, limit: DAILY_ROOM_POINTS.management },
      management: { mode: null, deadlineAt: null, rouletteSpins: 0, rouletteRequired: MANAGEMENT_MINIMUM_DAILY_SPINS },
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
    const loginBonus = loginBonusRepository.status(date);
    const outsidePointDate = queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1",
      ["outside_game_point_date"],
    )?.setting_value;
    const outsideEarnedPoints = outsidePointDate === date ? Number(queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1",
      ["outside_game_point_today"],
    )?.setting_value) : 0;
    const managementTasks = query<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE record_date=?", [date]);
    const pointSourceKeys = [
      ...["login-bonus", "defeat", "brainwash", "preparation", "daily-order", "training", "punishment"].map((id) => `${id}:${date}`),
      ...managementTasks.filter((task) => task.record_date === date).map((task) => `management-task:${task.id}`),
    ];
    const pointTransactions = pointSourceKeys.map((source_key) => ({
      source_key,
      // The source key owns the completion day, even if its reward was saved later.
      points: queryOne<{ points: number }>("SELECT points FROM point_transactions WHERE source_key=?", [source_key])?.points ?? 0,
    }));

    return buildHomeSummary({
      date,
      availablePoints: Number(activityPoints) + stgBonus - Number(spent),
      todayEarnedPoints: Number(todayEarnedPoints),
      outsideEarnedPoints,
      pointTransactions,
      loginBonus: { date, claimPoints: loginBonus.claimPoints },
      outsideDailyQuests: {
        date,
        // dailyQuestViews() initializes its baseline; the home summary only reads claims.
        claimedQuestIds: outsideDailyQuestIds.filter((id) => queryOne<{ setting_value: string }>(
          "SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1",
          [`outside_daily_quest_claimed_${date}_${id}`],
        )?.setting_value === "1"),
      },
      dailyGameRewards: { date, completedGames: dailyGameRewardService.completedGames(date) },
      loginClaimed: loginBonus.alreadyClaimed,
      order,
      contractSigned,
      journals: query<HomeJournal>("SELECT id, record_date, tags, created_at, duration_seconds FROM journals WHERE record_date=?", [date]),
      preparations: query<HomePreparation>("SELECT record_date, completed_at FROM preparation_records WHERE record_date=?", [date]),
      punishmentHistories: query<HomePunishmentHistory>(
        "SELECT timer_name, ended_at, completion_status, actual_duration_seconds FROM timer_histories WHERE timer_name=? AND substr(ended_at, 1, 10)=?",
        ["お仕置き", date],
      ),
      cycles: query<ManagementCycle>("SELECT * FROM management_cycles"),
      managementTasks,
      managementRoulette: parseManagementRoulette(queryOne<{ setting_value: string }>(
        "SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1", [MANAGEMENT_ROULETTE_KEY],
      )?.setting_value ?? null),
    });
  },
};
