import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../database/client.web";
import { managementRepository } from "../repositories/roomRepository";
import { customCommandService } from "./customCommandService";
import { managementRouletteService as roulette } from "./managementRouletteService";
import { MANAGEMENT_EXTENSION_MINUTES, MANAGEMENT_ROULETTE_KEY, parseManagementRoulette, validateManagementRouletteSettings } from "./managementRouletteStorage";

const journal = vi.hoisted(() => ({ upsertSystemRecord: vi.fn() }));
const pointChanges = vi.hoisted(() => ({ notifyChanged: vi.fn() }));
vi.mock("@/database/client", () => import("../database/client.web"));
vi.mock("@/services/customCommandService", () => import("./customCommandService"));
vi.mock("@/repositories/journalRepository", () => ({ journalRepository: journal }));
vi.mock("@/repositories/rewardRepository", () => ({ pointRepository: {
  award: (key: string, points: number, description: string, createdAt = new Date().toISOString()) => client.execute(
    "INSERT OR IGNORE INTO point_transactions(source_key, points, description, created_at) VALUES(?, ?, ?, ?)",
    [key, points, description, createdAt],
  ).changes > 0,
  notifyChanged: pointChanges.notifyChanged,
} }));
vi.mock("@/utils/date", () => import("../utils/date"));
vi.mock("@/constants/messages", () => ({
  dailyOrderMessages: [{ text: "Daily", withName: false }],
  managementInstructionMessages: {
    release: Array.from({ length: 5 }, (_, index) => ({ text: `Release ${index}`, withName: false })),
    chastity: Array.from({ length: 5 }, (_, index) => ({ text: `Chastity ${index}`, withName: false })),
  },
  managementFinalDayMessages: { release: [{ text: "Release final", withName: false }], chastity: [{ text: "Chastity final", withName: false }] },
}));

const values = new Map<string, string>();
const local = {
  get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  removeItem: (key: string) => { values.delete(key); },
};
const raw = () => client.queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key=?", [MANAGEMENT_ROULETTE_KEY])?.setting_value ?? null;
const now = () => new Date(2026, 9, 6, 12);
function setup() { const cycle = managementRepository.roll("release", 1); return roulette.state(cycle); }
function spin(cycleId: number, index: number) { vi.spyOn(Math, "random").mockReturnValue((index + 0.01) / 11); return roulette.spin(cycleId); }
function finishTasks(cycleId: number) { for (const draw of roulette.state(cycleId).pendingTasks) roulette.completeDrawTask(cycleId, draw.id); }
function seedCleanupRecords() {
  for (const id of [1, 10]) {
    client.execute("INSERT INTO management_cycles(id, mode, dice, start_date, end_date, is_active, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)", [id, id === 1 ? "release" : "chastity", 1, "2026-10-06", "2026-10-08", 1, new Date().toISOString()]);
    client.execute("INSERT INTO management_daily_tasks(id, cycle_id, record_date, instruction) VALUES(?, ?, ?, ?)", [id, id, "2026-10-06", "Normal task"]);
  }
  roulette.state(1); roulette.state(10);
  const tags = ["射精管理,射精管理タスク1,完了", "射精管理,射精管理期間1,管理完了", "射精管理,射精管理タスク10,完了", "射精管理,射精管理期間10,管理完了", "射精管理,自分の日記", "自分の日記,射精管理タスク1のメモ", "日記"];
  tags.forEach((tag, index) => client.execute("INSERT INTO journals(id, record_date, title, body, tags) VALUES(?, ?, ?, ?, ?)", [index + 101, "2026-10-06", "Record", "Keep unrelated records", tag]));
  client.execute("INSERT INTO point_transactions(source_key, points, description, created_at) VALUES(?, ?, ?, ?)", ["management-task:1", 10, "Recorded", new Date().toISOString()]);
}

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now()); vi.stubGlobal("localStorage", local);
  for (const table of ["app_settings", "management_cycles", "management_daily_tasks", "point_transactions", "journals"]) client.execute(`DELETE FROM ${table}`);
  vi.spyOn(Math, "random").mockReturnValue(0.999);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("management roulette snapshots", () => {
  it("initializes the legacy midnight deadline and a stable five-task pool without revealing commands", () => {
    const state = setup();
    expect(state.deadlineAt).toBe(new Date(2026, 9, 8, 0).toISOString());
    expect(state.taskChoices).toHaveLength(5);
    expect(state.taskChoices.map((item) => item.text).sort()).toEqual(Array.from({ length: 5 }, (_, index) => `Release ${index}`));
    expect(state).toMatchObject({ spinCount: 0, remainingSpins: 2, canFinishDay: false, canRelease: false, finalInstruction: "Release final" });
    const before = raw(); vi.spyOn(Math, "random").mockReturnValue(0);
    expect(roulette.state(state.cycle)).toEqual(state); expect(raw()).toBe(before);
    expect(customCommandService.seen("release")).toEqual([]);
  });

  it.each(Array.from({ length: 11 }, (_, index) => index))("persists exactly one of eleven equal-width outcomes for slot %i", (index) => {
    const initial = setup(); const { draw, state } = spin(initial.cycle.id, index);
    expect(draw.candidateIndex).toBe(index); expect(state.spinCount).toBe(1);
    expect(roulette.state(initial.cycle.id).day.draws).toEqual([draw]);
    if (index < 6) {
      expect(draw).toMatchObject({ kind: "extension", minutes: MANAGEMENT_EXTENSION_MINUTES[index] });
      expect(Date.parse(state.deadlineAt) - Date.parse(initial.deadlineAt)).toBe(MANAGEMENT_EXTENSION_MINUTES[index] * 60000);
    } else expect(draw).toMatchObject({ kind: "task", instruction: initial.taskChoices[index - 6].text, completedAt: null });
  });

  it("retains custom text and provenance after the definition is edited or removed", () => {
    const command = customCommandService.add("release", "  Own task\n{name}  "); const initial = setup();
    const index = initial.taskChoices.findIndex((choice) => choice.customCommandId === command.id);
    expect(index).toBeGreaterThanOrEqual(0);
    const { draw } = spin(initial.cycle.id, index + 6);
    customCommandService.update(command.id, "Changed"); customCommandService.remove(command.id);
    roulette.completeDrawTask(initial.cycle.id, draw.id);
    expect(roulette.state(initial.cycle.id).day.draws[0]).toMatchObject({ instruction: command.text, customCommandId: command.id });
    expect(customCommandService.seen("release")).toEqual([]);
    spin(initial.cycle.id, 0); roulette.finishDay(initial.cycle.id);
    expect(journal.upsertSystemRecord).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining(command.text), tags: expect.stringContaining("自分で追加した命令") }), expect.any(String));
  });
});

describe("daily requirements and release", () => {
  it("allows extra spins, requires each drawn task, and finishes one day without ending the period", () => {
    const initial = setup(); const id = initial.cycle.id;
    expect(() => roulette.finishDay(id)).toThrow();
    const first = spin(id, 6).draw; expect(() => roulette.finishDay(id)).toThrow();
    spin(id, 6); spin(id, 0);
    roulette.completeDrawTask(id, first.id); expect(() => roulette.finishDay(id)).toThrow();
    finishTasks(id); expect(roulette.state(id).canFinishDay).toBe(true);
    const finished = roulette.finishDay(id);
    expect(finished).toMatchObject({ canFinishDay: false, canRelease: false, spinCount: 3, cycle: { is_active: 1 } });
    expect(finished.day.endedAt).not.toBeNull();
    expect(() => spin(id, 0)).toThrow();
    expect(roulette.finishDay(id)).toEqual(finished);
    expect(client.query("SELECT * FROM point_transactions")).toEqual([
      expect.objectContaining({ points: 25 }),
    ]);
    expect(pointChanges.notifyChanged).toHaveBeenCalledOnce();
    const daily = managementRepository.todayTask(initial.cycle)!;
    expect(daily.completed_at).toBeTruthy(); expect(daily.instruction).toContain("管理時間を3分延長");
    expect(() => roulette.finishManagement(id)).toThrow();
  });

  it("carries unfinished draw tasks over midnight and resets only the daily spin minimum", () => {
    const initial = setup(); const first = spin(initial.cycle.id, 6).draw;
    vi.setSystemTime(new Date(2026, 9, 7, 0, 1));
    const next = roulette.state(initial.cycle.id);
    expect(next).toMatchObject({ remainingSpins: 2, spinCount: 0 }); expect(next.pendingTasks.map((task) => task.id)).toEqual([first.id]);
    spin(initial.cycle.id, 0); spin(initial.cycle.id, 0);
    expect(() => roulette.finishDay(initial.cycle.id)).toThrow();
    roulette.completeDrawTask(initial.cycle.id, first.id);
    expect(roulette.finishDay(initial.cycle.id).day.endedAt).toBeTruthy();
    expect(roulette.state(initial.cycle.id).days).toHaveLength(2);
  });

  it("requires the deadline and today's completed roulette before releasing an overdue cycle", () => {
    const initial = setup(); const id = initial.cycle.id;
    vi.setSystemTime(new Date(2026, 9, 10, 12));
    expect(roulette.state(id).todayTaskId).toBeTruthy(); expect(() => roulette.finishManagement(id)).toThrow();
    spin(id, 6); spin(id, 7); finishTasks(id); expect(roulette.state(id).canRelease).toBe(false);
    expect(roulette.finishDay(id).canRelease).toBe(true);
    roulette.finishManagement(id);
    expect(roulette.state(id)).toMatchObject({ canRelease: false, cycle: { is_active: 0 } });
    expect(() => spin(id, 0)).toThrow(); expect(() => roulette.finishManagement(id)).toThrow();
  });

  it("extends an elapsed deadline from now and unlocks only at the exact minute after day end", () => {
    const initial = setup(); const id = initial.cycle.id;
    vi.setSystemTime(new Date(2026, 9, 8, 12));
    const first = spin(id, 0); spin(id, 6); finishTasks(id); const ended = roulette.finishDay(id);
    expect(first.state.deadlineAt).toBe(new Date(2026, 9, 8, 12, 3).toISOString());
    expect(ended.canRelease).toBe(false); expect(() => roulette.finishManagement(id)).toThrow();
    vi.setSystemTime(new Date(2026, 9, 8, 12, 2, 59)); expect(roulette.state(id).canRelease).toBe(false);
    vi.setSystemTime(new Date(2026, 9, 8, 12, 3)); expect(roulette.state(id).canRelease).toBe(true);
    roulette.finishManagement(id);
  });

  it("blocks legacy complete/finish entry points once a cycle uses roulette", () => {
    const state = setup();
    expect(() => managementRepository.complete(state.todayTaskId!)).toThrow();
    expect(() => managementRepository.finish(state.cycle.id)).toThrow();
    expect(roulette.state(state.cycle.id).cycle.is_active).toBe(1);
  });
});

describe("atomic extensions and cleanup", () => {
  it("moves an unfinished final task and creates the new final day atomically across midnight", () => {
    const initial = setup(); const { state } = spin(initial.cycle.id, 5);
    expect(state.cycle.end_date).toBe("2026-10-09");
    const tasks = managementRepository.tasks(initial.cycle);
    expect(tasks.find((task) => task.record_date === "2026-10-08")?.instruction).not.toBe("Release final");
    expect(tasks.find((task) => task.record_date === "2026-10-09")?.instruction).toBe("Release final");
    expect(tasks).toHaveLength(4);
  });

  it("rolls back the draw, deadline, date and future tasks when storage fails", () => {
    const initial = setup(); const before = raw(); const tasks = managementRepository.tasks(initial.cycle);
    local.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => spin(initial.cycle.id, 5)).toThrow("quota");
    expect(raw()).toBe(before); expect(roulette.state(initial.cycle.id).deadlineAt).toBe(initial.deadlineAt);
    expect(managementRepository.tasks(initial.cycle)).toEqual(tasks);
    expect(roulette.state(initial.cycle.id).cycle.end_date).toBe(initial.cycle.end_date);
  });

  it("rolls back day completion and points when the final save fails", () => {
    const initial = setup(); spin(initial.cycle.id, 0); spin(initial.cycle.id, 0);
    const before = raw();
    local.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => roulette.finishDay(initial.cycle.id)).toThrow("quota");
    expect(raw()).toBe(before); expect(managementRepository.todayTask(initial.cycle)?.completed_at).toBeFalsy();
    expect(client.query("SELECT * FROM point_transactions")).toEqual([]);
    expect(pointChanges.notifyChanged).not.toHaveBeenCalled();
    expect(roulette.finishDay(initial.cycle.id).day.endedAt).toBeTruthy();
    expect(client.query("SELECT * FROM point_transactions")).toHaveLength(1);
  });

  it("retains a previously completed final instruction when extending a legacy period", () => {
    const cycle = managementRepository.roll("release", 1);
    const final = managementRepository.tasks(cycle).at(-1)!;
    managementRepository.complete(final.id);
    roulette.state(cycle); spin(cycle.id, 5);
    const tasks = managementRepository.tasks(cycle);
    expect(tasks.find((task) => task.id === final.id)).toMatchObject({ instruction: "Release final", completed_at: expect.any(String) });
    expect(tasks.at(-1)).toMatchObject({ record_date: "2026-10-09", instruction: "Release final" });
  });

  it("does not award twice when a completed legacy day is migrated to roulette", () => {
    const cycle = managementRepository.roll("release", 1);
    const task = managementRepository.todayTask(cycle)!;
    managementRepository.complete(task.id);
    client.execute("INSERT INTO point_transactions(source_key, points, description, created_at) VALUES(?, ?, ?, ?)", [`management-task:${task.id}`, 10, "Legacy completion", new Date().toISOString()]);
    roulette.state(cycle); spin(cycle.id, 0); spin(cycle.id, 0); roulette.finishDay(cycle.id);
    expect(client.query("SELECT * FROM point_transactions")).toHaveLength(1);
    expect(managementRepository.todayTask(cycle)?.instruction).toContain("管理時間を3分延長");
  });

  it.each(["remove", "reroll"])("%s deletes only this cycle's exact system-journal tags, preserving ID prefixes and user diaries", (action) => {
    seedCleanupRecords();
    if (action === "reroll") managementRepository.reroll(1, "release", 1); else managementRepository.removeCycle(1);
    expect(client.query<{ id: number }>("SELECT id FROM journals ORDER BY id").map((row) => row.id)).toEqual([103, 104, 105, 106, 107]);
    expect(client.queryOne("SELECT * FROM management_cycles WHERE id=?", [10])).toBeTruthy();
    expect(client.queryOne("SELECT * FROM management_daily_tasks WHERE id=?", [10])).toBeTruthy();
    expect(parseManagementRoulette(raw()).cycles.some((cycle) => cycle.cycleId === 10)).toBe(true);
    expect(client.query("SELECT * FROM point_transactions")).toEqual([]);
  });

  it("restores journals, cycle, task, points and roulette when removal cannot be saved", () => {
    seedCleanupRecords();
    const before = raw(); const journals = client.query("SELECT * FROM journals ORDER BY id");
    local.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => managementRepository.removeCycle(1)).toThrow("quota");
    expect(client.query("SELECT * FROM journals ORDER BY id")).toEqual(journals);
    expect(client.queryOne("SELECT * FROM management_cycles WHERE id=?", [1])).toBeTruthy();
    expect(client.queryOne("SELECT * FROM management_daily_tasks WHERE id=?", [1])).toBeTruthy();
    expect(client.query("SELECT * FROM point_transactions")).toHaveLength(1);
    expect(raw()).toBe(before);
  });

  it("keeps the roulette journal heading when completed records are synchronized", () => {
    const initial = setup(); spin(initial.cycle.id, 0); spin(initial.cycle.id, 0); roulette.finishDay(initial.cycle.id);
    journal.upsertSystemRecord.mockClear(); managementRepository.syncCompletedJournals();
    expect(journal.upsertSystemRecord).toHaveBeenLastCalledWith(expect.objectContaining({ body: expect.stringMatching(/^本日のルーレット\n/) }), `射精管理タスク${initial.todayTaskId}`);
  });

  it("removes metadata on reroll/removal while retaining unrelated cycles", () => {
    const initial = setup(); const other = managementRepository.roll("chastity", 1); roulette.state(other);
    spin(initial.cycle.id, 5);
    const replacement = managementRepository.reroll(initial.cycle.id, "release", 1); roulette.state(replacement);
    expect(parseManagementRoulette(raw()).cycles.map((cycle) => cycle.cycleId).sort()).toEqual([other.id, replacement.id].sort());
    managementRepository.removeCycle(replacement.id);
    expect(parseManagementRoulette(raw()).cycles.map((cycle) => cycle.cycleId)).toEqual([other.id]);
    roulette.clearRecords(); expect(raw()).toBeNull();
  });
});

describe("roulette backup validation", () => {
  it("accepts snapshots and rejects duplicate keys or malformed/contradictory draws", () => {
    const initial = setup(); spin(initial.cycle.id, 6);
    const row = { setting_key: MANAGEMENT_ROULETTE_KEY, setting_value: raw()! };
    expect(() => validateManagementRouletteSettings([row])).not.toThrow();
    expect(() => validateManagementRouletteSettings([row, row])).toThrow();
    for (const mutate of [
      (value: ReturnType<typeof parseManagementRoulette>) => { value.cycles[0].days[0].endedAt = new Date().toISOString(); },
      (value: ReturnType<typeof parseManagementRoulette>) => { value.cycles[0].days[0].date = "2026-02-30"; },
      (value: ReturnType<typeof parseManagementRoulette>) => { value.cycles[0].days[0].draws[0].candidateIndex = 5; },
      (value: ReturnType<typeof parseManagementRoulette>) => { value.cycles[0].days[0].draws.push(value.cycles[0].days[0].draws[0]); },
    ]) {
      const value = parseManagementRoulette(raw()); mutate(value);
      expect(() => parseManagementRoulette(JSON.stringify(value))).toThrow();
    }
  });
});
