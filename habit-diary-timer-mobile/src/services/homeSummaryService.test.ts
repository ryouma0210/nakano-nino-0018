import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHomeSummary, homeSummaryService } from "./homeSummaryService";
import * as webClient from "../database/client.web";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
const database = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("../database/client", () => database);
vi.mock("../utils/date", () => ({ toDateKey: () => "2026-09-16" }));

const today = "2026-09-16";
const cycle = (id: number, overrides = {}) => ({
  id, mode: "release" as const, dice: 1, start_date: today, end_date: "2026-09-18", is_active: 1, created_at: `${today} 10:00:00`, ...overrides,
});
const task = (id: number, cycleId: number, overrides = {}) => ({
  id, cycle_id: cycleId, record_date: today, instruction: "本日の指示", completed_at: null, ...overrides,
});
const dailyTaskIds = ["login-bonus", "brainwash", "preparation", "daily-order", "training", "outside"];
const defaultTaskIds = [...dailyTaskIds, "defeat", "management", "punishment"];
const baseSnapshot = () => ({
  date: today, availablePoints: 120, todayEarnedPoints: 20, outsideEarnedPoints: 0, loginClaimed: false, order: null,
  contractSigned: false, journals: [], preparations: [], punishmentHistories: [], cycles: [], managementTasks: [],
});
const journal = (tags: string, recordDate = today, overrides: {
  id?: number; created_at?: string; duration_seconds?: number | null;
} = {}) => ({ record_date: recordDate, tags, id: 1, created_at: `${recordDate} 10:00:00`, duration_seconds: null, ...overrides });
const trainingJournal = (overrides: Partial<ReturnType<typeof journal>> = {}) => ({
  ...journal("調教,完了,射精記録,イージー,お仕置き対象", today, { created_at: `${today} 11:00:00`, duration_seconds: 299 }),
  ...overrides,
});
const punishment = (overrides = {}) => ({
  timer_name: "お仕置き", ended_at: `${today} 12:00:00`, completion_status: "completed", actual_duration_seconds: 60, ...overrides,
});

describe("home daily progress", () => {
  it("keeps all rooms visible and navigable while excluding unavailable rooms from today's total", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(),
      cycles: [
        cycle(1, { end_date: "2026-09-15" }),
        cycle(2, { start_date: "2026-09-17" }),
        cycle(3, { is_active: 0 }),
      ],
      managementTasks: [task(1, 1), task(2, 2), task(3, 3)],
    });
    expect(summary.tasks.map((item) => item.id)).toEqual(defaultTaskIds);
    expect(summary.tasks.filter((item) => item.eligible).map((item) => item.id)).toEqual(dailyTaskIds);
    expect(summary.eligibleCount).toBe(6);
    expect(summary.completedCount).toBe(0);
    expect(summary.tasks.find((item) => item.id === "daily-order")?.status).toBe("未抽選");
    expect(summary.tasks.slice(-3)).toEqual([
      { id: "defeat", title: "敗北部屋", href: "/(tabs)/contract", eligible: false, completed: false, status: "未契約" },
      { id: "management", title: "射精管理部屋", href: "/(tabs)/management", eligible: false, completed: false, status: "管理期間外" },
      { id: "punishment", title: "お仕置き部屋", href: "/(tabs)/timer", eligible: false, completed: false, status: "対象外" },
    ]);
  });

  it("can finish all six eligible tasks while keeping the three unavailable destinations", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(), loginClaimed: true, outsideEarnedPoints: 100,
      order: { date: today, text: "今日の命令", completed: true },
      preparations: [{ record_date: today, completed_at: `${today} 12:00:00` }],
      journals: [
        journal("準備部屋,チェック"), journal(`洗脳部屋,調教記録,洗脳部屋${today}`),
        trainingJournal({ tags: "調教,完了,射精記録,お仕置き不要" }), journal("敗北部屋,チェック,調教記録"),
      ],
      punishmentHistories: [punishment()],
      cycles: [cycle(1, { is_active: 0 })],
      managementTasks: [task(1, 1, { completed_at: `${today} 12:00:00` })],
    });
    expect(summary.tasks.map((item) => item.id)).toEqual(defaultTaskIds);
    expect(summary.completedCount).toBe(6);
    expect(summary.eligibleCount).toBe(6);
    expect(summary.tasks.filter((item) => !item.eligible).every((item) => !item.completed)).toBe(true);
  });

  it.each([
    { earned: 0, completed: false },
    { earned: 40, completed: false },
    { earned: 99, completed: false },
    { earned: 100, completed: true },
  ])("counts slime hunting as one task only after earning the full daily limit: $earned", ({ earned, completed }) => {
    const summary = buildHomeSummary({
      ...baseSnapshot(), outsideEarnedPoints: earned, availablePoints: 99999, todayEarnedPoints: 500,
    });
    expect(summary.tasks.find((item) => item.id === "outside")).toEqual({
      id: "outside", title: "館の外", detail: "スライム倒し", href: "/(tabs)/outside",
      eligible: true, completed, status: completed ? "完了済み" : "未完了",
      pointProgress: { earned, limit: 100 },
    });
    expect(summary.eligibleCount).toBe(6);
    expect(summary.completedCount).toBe(completed ? 1 : 0);
    expect(summary.completedCount / summary.eligibleCount).toBe(completed ? 1 / 6 : 0);
  });

  it.each([
    { saved: -10, earned: 0 }, { saved: 150, earned: 100 },
    { saved: Number.NaN, earned: 0 }, { saved: Number.POSITIVE_INFINITY, earned: 0 },
    { saved: Number.NEGATIVE_INFINITY, earned: 0 },
  ])("normalizes an invalid or excessive outside counter: $saved", ({ saved, earned }) => {
    const summary = buildHomeSummary({ ...baseSnapshot(), outsideEarnedPoints: saved });
    expect(summary.tasks.find((item) => item.id === "outside"))
      .toMatchObject({ completed: earned === 100, pointProgress: { earned, limit: 100 } });
  });

  it("uses the requested order when every room is eligible and keeps it after completion", () => {
    const snapshot = {
      ...baseSnapshot(), contractSigned: true,
      journals: [trainingJournal()], cycles: [cycle(1)],
    };
    const pending = buildHomeSummary(snapshot);
    const completed = buildHomeSummary({
      ...snapshot, loginClaimed: true, outsideEarnedPoints: 100,
      order: { date: today, text: "今日の命令", completed: true },
      journals: [
        trainingJournal(), journal("敗北部屋,チェック,調教記録"),
        journal(`洗脳部屋,調教記録,洗脳部屋${today}`), journal("準備部屋,チェック"),
      ],
      preparations: [{ record_date: today, completed_at: `${today} 12:00:00` }],
      punishmentHistories: [punishment()],
      managementTasks: [task(1, 1, { completed_at: `${today} 12:00:00` })],
    });
    const expectedOrder = ["login-bonus", "defeat", "brainwash", "preparation", "daily-order", "training", "management:1", "punishment", "outside"];
    expect(pending.tasks.map((item) => item.id)).toEqual(expectedOrder);
    expect(completed.tasks.map((item) => item.id)).toEqual(expectedOrder);
    expect(completed.tasks.map(({ id, href }) => ({ id, href })))
      .toEqual(pending.tasks.map(({ id, href }) => ({ id, href })));
    expect(pending.eligibleCount).toBe(9);
    expect(completed.eligibleCount).toBe(9);
    expect(pending.completedCount).toBe(1);
    expect(completed.completedCount).toBe(9);
  });

  it("moves a locked high-priority room behind every eligible task without losing its link", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(), journals: [trainingJournal()], cycles: [cycle(1)],
    });
    expect(summary.tasks.map((item) => item.id))
      .toEqual(["login-bonus", "brainwash", "preparation", "daily-order", "training", "management:1", "punishment", "outside", "defeat"]);
    expect(summary.tasks.at(-1))
      .toMatchObject({ eligible: false, completed: false, status: "未契約", href: "/(tabs)/contract" });
    expect(summary.tasks.slice(0, -1).every((item) => item.eligible)).toBe(true);
    expect(summary.eligibleCount).toBe(8);
    expect(summary.completedCount).toBe(1);
  });

  it("keeps multiple eligible management cycles together between training and punishment", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(), contractSigned: true, journals: [trainingJournal()],
      cycles: [cycle(2, { mode: "chastity" }), cycle(1)],
      managementTasks: [task(1, 1, { completed_at: `${today} 12:00:00` })],
    });
    expect(summary.tasks.map((item) => item.id.startsWith("management:") ? "management" : item.id))
      .toEqual(["login-bonus", "defeat", "brainwash", "preparation", "daily-order", "training", "management", "management", "punishment", "outside"]);
    expect(summary.tasks.filter((item) => item.id.startsWith("management:")).map((item) => item.id).sort())
      .toEqual(["management:1", "management:2"]);
    expect(summary.eligibleCount).toBe(10);
    expect(summary.completedCount).toBe(2);
  });

  it("does not count another day's order or management completion", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(),
      order: { date: "2026-09-15", text: "昨日の命令", completed: true },
      cycles: [cycle(1)],
      managementTasks: [task(1, 1, { record_date: "2026-09-15", completed_at: "2026-09-15 12:00:00" })],
    });
    expect(summary.completedCount).toBe(0);
    expect(summary.tasks.find((item) => item.id === "management:1")?.completed).toBe(false);
  });

  it("retains today's completed final task after the cycle becomes inactive", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(),
      loginClaimed: true,
      order: { date: today, text: "今日の命令", completed: true },
      cycles: [cycle(1, { end_date: today, is_active: 0 })],
      managementTasks: [task(1, 1, { completed_at: `${today} 12:00:00` })],
    });
    expect(summary.completedCount).toBe(3);
    expect(summary.eligibleCount).toBe(7);
    expect(summary.tasks).toHaveLength(9);
    expect(summary.tasks.find((item) => item.id === "management:1"))
      .toMatchObject({ eligible: true, dayProgress: { currentDay: 1, totalDays: 1 } });
  });

  it("uses only the latest active cycle per mode and keeps ungenerated instructions pending", () => {
    const summary = buildHomeSummary({ ...baseSnapshot(), cycles: [cycle(1), cycle(2)] });
    expect(summary.tasks.map((item) => item.id))
      .toEqual(["login-bonus", "brainwash", "preparation", "daily-order", "training", "management:2", "outside", "defeat", "punishment"]);
    expect(summary.eligibleCount).toBe(7);
    expect(summary.tasks.find((item) => item.id === "management:2"))
      .toMatchObject({ title: "射精管理部屋", eligible: true, completed: false, href: "/(tabs)/management" });
  });

  it.each([
    { date: today, start: today, end: "2026-09-18", currentDay: 1, totalDays: 3 },
    { date: today, start: "2026-09-14", end: today, currentDay: 3, totalDays: 3 },
    { date: "2026-01-01", start: "2025-12-30", end: "2026-01-02", currentDay: 3, totalDays: 4 },
    { date: "2024-03-01", start: "2024-02-28", end: "2024-03-02", currentDay: 3, totalDays: 4 },
    { date: "2026-03-09", start: "2026-03-07", end: "2026-03-10", currentDay: 3, totalDays: 4 },
  ])("counts calendar days inclusively despite missing daily tasks: $start to $end on $date", ({ date, start, end, currentDay, totalDays }) => {
    const summary = buildHomeSummary({
      ...baseSnapshot(), date,
      cycles: [cycle(1, { start_date: start, end_date: end })],
      managementTasks: [],
    });
    expect(summary.tasks.find((item) => item.id === "management:1"))
      .toMatchObject({ completed: false, dayProgress: { currentDay, totalDays } });
  });

  it("keeps an in-period cycle after today's completion without treating skipped days as completed", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(),
      cycles: [cycle(1, { start_date: "2026-09-14" })],
      managementTasks: [task(1, 1, { completed_at: `${today} 12:00:00` })],
    });
    expect(summary.tasks.find((item) => item.id === "management:1"))
      .toMatchObject({ completed: true, dayProgress: { currentDay: 3, totalDays: 5 } });
    expect(summary.completedCount).toBe(1);
  });

  it("does not fall back to an older cycle when the latest active cycle is outside today's dates", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(),
      cycles: [cycle(1), cycle(2, { start_date: "2026-09-17" })],
      managementTasks: [task(1, 1)],
    });
    expect(summary.tasks.map((item) => item.id)).toEqual(defaultTaskIds);
    expect(summary.tasks.find((item) => item.id === "management"))
      .toMatchObject({ eligible: false, status: "管理期間外" });
    expect(summary.eligibleCount).toBe(6);
  });

  it("counts each completed room once using its actual saved records", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(), contractSigned: true,
      preparations: [{ record_date: today, completed_at: `${today} 12:00:00` }],
      journals: [
        journal("準備部屋,チェック"),
        journal(`洗脳部屋,調教記録,洗脳部屋${today}`),
        trainingJournal(), trainingJournal({ id: 2 }),
        journal("敗北部屋,チェック,調教記録"),
      ],
      punishmentHistories: [punishment(), punishment()],
    });
    expect(summary.completedCount).toBe(5);
    expect(summary.eligibleCount).toBe(8);
    expect(summary.tasks).toHaveLength(9);
    expect(summary.tasks.filter((item) => item.completed).map((item) => item.id))
      .toEqual(["defeat", "brainwash", "preparation", "training", "punishment"]);
  });

  it.each(["2026-09-15", "2026-09-17"])("does not use room records from %s", (otherDate) => {
    const summary = buildHomeSummary({
      ...baseSnapshot(), contractSigned: true,
      preparations: [{ record_date: otherDate, completed_at: `${otherDate} 12:00:00` }],
      journals: [
        journal("準備部屋,チェック", otherDate), journal(`洗脳部屋,洗脳部屋${otherDate}`, otherDate),
        journal("調教,完了,射精記録", otherDate), journal("敗北部屋,チェック", otherDate),
      ],
      punishmentHistories: [punishment({ ended_at: `${otherDate} 12:00:00` })],
    });
    expect(summary.completedCount).toBe(0);
  });

  it("requires both preparation storage and its surviving journal", () => {
    const record = { record_date: today, completed_at: `${today} 12:00:00` };
    for (const snapshot of [
      { ...baseSnapshot(), preparations: [record] },
      { ...baseSnapshot(), journals: [journal("準備部屋,チェック")] },
    ]) {
      expect(buildHomeSummary(snapshot).tasks.find((item) => item.id === "preparation")?.completed).toBe(false);
    }
  });

  it("does not confuse game-loss journals or ordinary notes with completed room sessions", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(),
      journals: [journal("館の外,敗北,射精記録"), journal("調教,途中"), journal("洗脳部屋,メモ")],
    });
    expect(summary.completedCount).toBe(0);
  });

  it("routes the defeat room through contract setup and updates progress after signing, completing, and removing the contract", () => {
    const completedJournal = journal("敗北部屋,チェック,調教記録");
    for (const { contractSigned, journals, href, status, completed } of [
      { contractSigned: false, journals: [], href: "/(tabs)/contract", status: "未契約", completed: false },
      { contractSigned: true, journals: [], href: "/(tabs)/defeat", status: "未完了", completed: false },
      { contractSigned: true, journals: [completedJournal], href: "/(tabs)/defeat", status: "完了済み", completed: true },
      { contractSigned: false, journals: [completedJournal], href: "/(tabs)/contract", status: "未契約", completed: false },
    ]) {
      const summary = buildHomeSummary({ ...baseSnapshot(), contractSigned, journals });
      expect(summary.tasks.find((item) => item.id === "defeat")).toMatchObject({
        eligible: contractSigned, completed, href, status,
      });
      expect(summary.tasks).toHaveLength(9);
      expect(summary.eligibleCount).toBe(contractSigned ? 7 : 6);
      expect(summary.completedCount).toBe(completed ? 1 : 0);
    }
  });

  it.each([
    { completion_status: "stopped" }, { completion_status: "skipped" },
    { ended_at: null }, { actual_duration_seconds: 0 }, { timer_name: "別のタイマー" },
    { ended_at: "2026-09-15 12:00:00" }, { ended_at: "2026-09-17 12:00:00" },
  ])("does not complete punishment for an unfinished or unrelated timer: %j", (override) => {
    const summary = buildHomeSummary({ ...baseSnapshot(), journals: [trainingJournal()], punishmentHistories: [punishment(override)] });
    expect(summary.tasks.find((item) => item.id === "punishment")?.completed).toBe(false);
  });

  it.each([
    { difficulty: "イージー", duration: 299, needsPunishment: true },
    { difficulty: "イージー", duration: 300, needsPunishment: false },
    { difficulty: "ノーマル", duration: 419, needsPunishment: true },
    { difficulty: "ノーマル", duration: 420, needsPunishment: false },
    { difficulty: "ハード", duration: 599, needsPunishment: true },
    { difficulty: "ハード", duration: 600, needsPunishment: false },
    { difficulty: "未設定", duration: 10, needsPunishment: false },
    { difficulty: "イージー", duration: null, needsPunishment: false },
  ])("interprets legacy training $difficulty at $duration seconds", ({ difficulty, duration, needsPunishment }) => {
    const summary = buildHomeSummary({
      ...baseSnapshot(),
      journals: [trainingJournal({ tags: `調教,完了,射精記録,${difficulty}`, duration_seconds: duration })],
    });
    expect(summary.tasks.find((item) => item.id === "punishment")?.eligible).toBe(needsPunishment);
    expect(summary.tasks.find((item) => item.id === "training")?.completed).toBe(true);
  });

  it.each([
    { marker: "お仕置き対象", duration: 600, eligible: true },
    { marker: "お仕置き不要", duration: 0, eligible: false },
  ])("uses the saved $marker outcome ahead of legacy duration inference", ({ marker, duration, eligible }) => {
    const summary = buildHomeSummary({
      ...baseSnapshot(),
      journals: [trainingJournal({ tags: `調教,完了,射精記録,イージー,${marker}`, duration_seconds: duration })],
    });
    expect(summary.tasks.find((item) => item.id === "punishment")?.eligible).toBe(eligible);
  });

  it("uses only the latest completed training record, ordered by creation time then ID", () => {
    const earlierFailure = trainingJournal({ id: 30, created_at: `${today} 10:00:00` });
    const success = trainingJournal({ id: 20, tags: "調教,完了,射精記録,お仕置き不要" });
    const latestFailure = trainingJournal({ id: 21 });
    for (const journals of [[success, earlierFailure], [earlierFailure, success]]) {
      expect(buildHomeSummary({ ...baseSnapshot(), journals }).tasks.find((item) => item.id === "punishment"))
        .toMatchObject({ eligible: false, completed: false, status: "対象外" });
    }
    for (const journals of [[latestFailure, success, earlierFailure], [earlierFailure, success, latestFailure]]) {
      expect(buildHomeSummary({ ...baseSnapshot(), journals }).tasks.find((item) => item.id === "punishment"))
        .toMatchObject({ eligible: true, completed: false });
    }
  });

  it("does not let future, previous-day, or unrelated journals change today's latest training result", () => {
    const summary = buildHomeSummary({
      ...baseSnapshot(),
      journals: [
        trainingJournal(),
        trainingJournal({ id: 50, record_date: "2026-09-17", created_at: "2026-09-17 12:00:00", tags: "調教,完了,射精記録,お仕置き不要" }),
        trainingJournal({ id: 51, record_date: "2026-09-15", tags: "調教,完了,射精記録,お仕置き不要" }),
        journal("館の外,射精記録,お仕置き不要", today, { id: 52, created_at: `${today} 13:00:00` }),
        journal("調教,途中,お仕置き不要", today, { id: 53, created_at: `${today} 14:00:00` }),
      ],
    });
    expect(summary.tasks.find((item) => item.id === "punishment")).toMatchObject({ completed: false });
  });

  it.each([
    { endedAt: "10:59:59", completed: false },
    { endedAt: "11:00:00", completed: true },
    { endedAt: "11:00:01", completed: true },
  ])("requires normal punishment to finish at or after the triggering training: $endedAt", ({ endedAt, completed }) => {
    const summary = buildHomeSummary({
      ...baseSnapshot(), journals: [trainingJournal()],
      punishmentHistories: [punishment({ ended_at: `${today} ${endedAt}` })],
    });
    expect(summary.tasks.find((item) => item.id === "punishment")).toMatchObject({ completed });
  });

  it("reopens punishment after a new failed training, then excludes it from the total after a later success", () => {
    const firstFailure = trainingJournal();
    const secondFailure = trainingJournal({ id: 2, created_at: `${today} 13:00:00` });
    const success = trainingJournal({ id: 3, created_at: `${today} 15:00:00`, tags: "調教,完了,射精記録,お仕置き不要" });
    const firstCompletion = punishment();
    const secondCompletion = punishment({ ended_at: `${today} 14:00:00` });
    const summary = (journals: ReturnType<typeof trainingJournal>[], punishmentHistories: ReturnType<typeof punishment>[]) =>
      buildHomeSummary({ ...baseSnapshot(), journals, punishmentHistories });
    expect(summary([firstFailure], []).tasks.find((item) => item.id === "punishment")?.completed).toBe(false);
    expect(summary([firstFailure], [firstCompletion]).tasks.find((item) => item.id === "punishment")?.completed).toBe(true);
    expect(summary([firstFailure, secondFailure], [firstCompletion]).tasks.find((item) => item.id === "punishment")?.completed).toBe(false);
    expect(summary([firstFailure, secondFailure], [firstCompletion, secondCompletion]).tasks.find((item) => item.id === "punishment")?.completed).toBe(true);
    const afterSuccess = summary([firstFailure, secondFailure, success], [firstCompletion, secondCompletion]);
    expect(afterSuccess.tasks.find((item) => item.id === "punishment"))
      .toMatchObject({ eligible: false, completed: false, status: "対象外", href: "/(tabs)/timer" });
    expect(afterSuccess.tasks).toHaveLength(9);
    expect(afterSuccess.eligibleCount).toBe(6);
    expect(afterSuccess.completedCount).toBe(1);
  });
});

describe("loading a home summary without changing saved data", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXPO_PUBLIC_APP_ENV", "prd");
    storage.getItem.mockImplementation(async (key: string) => key.startsWith("nino-room:daily-order:")
      ? JSON.stringify({ date: today, text: "今日の命令", completed: true }) : null);
    database.query.mockImplementation((sql: string) => {
      if (sql.includes("management_cycles")) return [cycle(1)];
      if (sql.includes("management_daily_tasks")) return [task(1, 1)];
      return [];
    });
    database.queryOne.mockImplementation((sql: string, params: string[] = []) => {
      if (sql.includes("points > 0")) return { total: 45 };
      if (sql.includes("point_transactions")) return { total: 200 };
      if (sql.includes("reward_redemptions")) return { total: 35 };
      return params[0] === "login_bonus_last_claimed_date" ? { setting_value: today } : null;
    });
  });

  it("reads completion and the existing balance without awarding points, creating journals, or generating instructions", async () => {
    const summary = await homeSummaryService.load(today);
    expect(summary.availablePoints).toBe(165);
    expect(summary.todayEarnedPoints).toBe(45);
    expect(summary.completedCount).toBe(2);
    expect(summary.eligibleCount).toBe(7);
    expect(summary.tasks).toHaveLength(9);
    expect(storage.getItem).toHaveBeenCalledWith(`nino-room:daily-order:${today}`);
    expect(database.execute).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(database.query.mock.calls.every(([sql]) => String(sql).startsWith("SELECT "))).toBe(true);
    expect(database.queryOne.mock.calls.every(([sql]) => String(sql).startsWith("SELECT "))).toBe(true);
  });

  it("does not treat a corrupt stored order as completed", async () => {
    storage.getItem.mockResolvedValue('{"completed":"yes"}');
    const summary = await homeSummaryService.load(today);
    expect(summary.tasks.find((item) => item.id === "daily-order")).toMatchObject({ completed: false, status: "未抽選" });
  });

  it("includes the same staging-only point allowance as other balance screens", async () => {
    vi.stubEnv("EXPO_PUBLIC_APP_ENV", "stg");
    const summary = await homeSummaryService.load(today);
    expect(summary.availablePoints).toBe(100164);
    expect(summary.todayEarnedPoints).toBe(45);
  });

  it.each([
    { date: undefined, points: undefined, earned: 0 },
    { date: "2026-09-15", points: "100", earned: 0 },
    { date: "2026-09-17", points: "100", earned: 0 },
    { date: today, points: undefined, earned: 0 },
    { date: today, points: "broken", earned: 0 },
    { date: today, points: "NaN", earned: 0 },
    { date: today, points: "Infinity", earned: 0 },
    { date: today, points: "-Infinity", earned: 0 },
    { date: today, points: "-10", earned: 0 },
    { date: today, points: "150", earned: 100 },
    { date: today, points: "40", earned: 40 },
  ])("reads only today's dedicated outside counter without resetting stored data: $date / $points", async ({ date, points, earned }) => {
    const defaultQueryOne = database.queryOne.getMockImplementation()!;
    database.queryOne.mockImplementation((sql: string, params: string[] = []) => {
      if (params[0] === "outside_game_point_date") return date === undefined ? null : { setting_value: date };
      if (params[0] === "outside_game_point_today") return points === undefined ? null : { setting_value: points };
      return defaultQueryOne(sql, params);
    });
    const summary = await homeSummaryService.load(today);
    expect(summary.tasks.find((item) => item.id === "outside"))
      .toMatchObject({ completed: earned === 100, pointProgress: { earned, limit: 100 } });
    expect(summary.availablePoints).toBe(165);
    expect(summary.todayEarnedPoints).toBe(45);
    expect(summary.completedCount).toBe(earned === 100 ? 3 : 2);
    if (date !== today) {
      expect(database.queryOne.mock.calls.some(([, params]) => params?.[0] === "outside_game_point_today")).toBe(false);
    }
    expect(database.execute).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("matches SQLite on room completions and positive daily earnings, without writing the Web database", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      CREATE TABLE point_transactions (source_key TEXT, points REAL, created_at TEXT);
      CREATE TABLE reward_redemptions (points_spent REAL);
      CREATE TABLE app_settings (setting_key TEXT, setting_value TEXT);
      CREATE TABLE management_cycles (id INTEGER, mode TEXT, start_date TEXT, end_date TEXT, is_active INTEGER);
      CREATE TABLE management_daily_tasks (cycle_id INTEGER, record_date TEXT, completed_at TEXT);
      CREATE TABLE journals (id INTEGER, record_date TEXT, tags TEXT, created_at TEXT, duration_seconds INTEGER);
      CREATE TABLE preparation_records (record_date TEXT, completed_at TEXT);
      CREATE TABLE timer_histories (timer_name TEXT, ended_at TEXT, completion_status TEXT, actual_duration_seconds INTEGER);
    `);
    const saved = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => { saved.set(key, value); });
    const removeItem = vi.fn((key: string) => { saved.delete(key); });
    vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem, removeItem });

    const seed = (sql: string, params: (string | number | null)[]) => {
      webClient.execute(sql, params);
      sqlite.prepare(sql).run(...params);
    };
    try {
      for (const [key, points, date] of [
        ["today-one", 10, today], ["today-two", 50, today], ["today-loss", -25, today], ["today-zero", 0, today],
        ["yesterday", 150, "2026-09-15"], ["future", 300, "2026-09-17"],
      ] as const) {
        seed("INSERT INTO point_transactions(source_key, points, created_at) VALUES(?, ?, ?)", [key, points, `${date} 12:00:00`]);
      }
      seed("INSERT INTO reward_redemptions(points_spent) VALUES(?)", [40]);
      seed("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", ["unrelated", "ignored"]);
      seed("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", ["login_bonus_last_claimed_date", today]);
      seed("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", ["outside_game_point_date", today]);
      seed("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", ["outside_game_point_today", "100"]);
      for (const row of [cycle(1, { start_date: "2026-09-14" }), cycle(2, { mode: "chastity", start_date: "2026-09-17" })]) {
        seed(
          "INSERT INTO management_cycles(id, mode, start_date, end_date, is_active) VALUES(?, ?, ?, ?, ?)",
          [row.id, row.mode, row.start_date, row.end_date, row.is_active],
        );
      }
      seed("INSERT INTO management_daily_tasks(cycle_id, record_date, completed_at) VALUES(?, ?, ?)", [1, "2026-09-15", null]);
      seed("INSERT INTO management_daily_tasks(cycle_id, record_date, completed_at) VALUES(?, ?, ?)", [1, today, `${today} 12:00:00`]);
      seed("INSERT INTO preparation_records(record_date, completed_at) VALUES(?, ?)", [today, `${today} 12:00:00`]);
      for (const row of [
        journal("準備部屋,チェック"), journal(`洗脳部屋,調教記録,洗脳部屋${today}`, today, { id: 2 }),
        trainingJournal({ id: 50, tags: "調教,完了,射精記録,お仕置き不要", created_at: `${today} 09:00:00` }),
        trainingJournal({ id: 8, tags: "調教,完了,射精記録,イージー", duration_seconds: 299 }),
        trainingJournal({ id: 7, tags: "調教,完了,射精記録,お仕置き不要" }),
        journal("敗北部屋,チェック,調教記録", today, { id: 3 }),
        journal("調教,完了,射精記録,お仕置き不要", "2026-09-17", { id: 4 }),
      ]) seed("INSERT INTO journals(id, record_date, tags, created_at, duration_seconds) VALUES(?, ?, ?, ?, ?)",
        [row.id, row.record_date, row.tags, row.created_at, row.duration_seconds]);
      for (const row of [
        punishment(), punishment({ completion_status: "stopped" }), punishment({ completion_status: "skipped" }),
        punishment({ ended_at: "2026-09-15 12:00:00" }), punishment({ ended_at: "2026-09-17 12:00:00" }),
      ]) {
        seed(
          "INSERT INTO timer_histories(timer_name, ended_at, completion_status, actual_duration_seconds) VALUES(?, ?, ?, ?)",
          [row.timer_name, row.ended_at, row.completion_status, row.actual_duration_seconds],
        );
      }
      storage.getItem.mockImplementation(async (key: string) => key === "nino-room:contract"
        ? JSON.stringify({ signedAt: `${today}T12:00:00` })
        : JSON.stringify({ date: today, text: "今日の命令", completed: true }));
      database.query.mockImplementation(webClient.query);
      database.queryOne.mockImplementation(webClient.queryOne);
      setItem.mockClear();
      removeItem.mockClear();
      const savedBefore = [...saved.entries()];

      const summary = await homeSummaryService.load(today);
      expect(summary.availablePoints).toBe(445);
      expect(summary.todayEarnedPoints).toBe(60);
      expect(summary.completedCount).toBe(9);
      expect(summary.eligibleCount).toBe(9);
      expect(summary.tasks).toHaveLength(9);
      expect(summary.tasks.find((item) => item.id === "outside"))
        .toMatchObject({ completed: true, pointProgress: { earned: 100, limit: 100 } });
      expect(summary.tasks.find((item) => item.id === "punishment")).toMatchObject({ completed: true });
      expect(summary.tasks.find((item) => item.id === "management:1"))
        .toMatchObject({ dayProgress: { currentDay: 3, totalDays: 5 } });
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
      expect([...saved.entries()]).toEqual(savedBefore);

      database.query.mockImplementation((sql: string, params: (string | number | null)[] = []) => sqlite.prepare(sql).all(...params));
      database.queryOne.mockImplementation((sql: string, params: (string | number | null)[] = []) => sqlite.prepare(sql).get(...params));
      expect(await homeSummaryService.load(today)).toEqual(summary);

      const tomorrowSummary = await homeSummaryService.load("2026-09-17");
      expect(tomorrowSummary.tasks.find((item) => item.id === "outside"))
        .toMatchObject({ completed: false, pointProgress: { earned: 0, limit: 100 } });
      database.query.mockImplementation(webClient.query);
      database.queryOne.mockImplementation(webClient.queryOne);
      expect(await homeSummaryService.load("2026-09-17")).toEqual(tomorrowSummary);
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
      expect([...saved.entries()]).toEqual(savedBefore);
    } finally {
      sqlite.close();
    }
  });
});
