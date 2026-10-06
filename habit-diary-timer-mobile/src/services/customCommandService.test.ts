import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../database/client.web";
import { customCommandService } from "./customCommandService";
import { managementRepository } from "../repositories/roomRepository";
import { dailyOrderService } from "./gameRoomService";
import { CUSTOM_COMMANDS_KEY, MANAGEMENT_COMMAND_SOURCES_KEY, SEEN_COMMANDS_KEY, validateCustomCommandSettings } from "./customCommandStorage";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), getAllKeys: vi.fn(), multiGet: vi.fn(), multiRemove: vi.fn() }));
const journal = vi.hoisted(() => ({ upsertSystemRecord: vi.fn() }));
vi.mock("@/database/client", () => import("../database/client.web"));
vi.mock("@/services/customCommandService", () => import("./customCommandService"));
vi.mock("@/repositories/journalRepository", () => ({ journalRepository: journal }));
vi.mock("@/repositories/rewardRepository", () => ({ pointRepository: { award: vi.fn() } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("@/utils/date", () => import("../utils/date"));
vi.mock("@/schemas/storage", () => import("../schemas/storage"));
vi.mock("@/utils/storageValidation", () => import("../utils/storageValidation"));
vi.mock("@/constants/messages", () => ({
  dailyOrderMessages: [{ text: "Daily A", withName: false }, { text: "Daily B", withName: true }],
  managementInstructionMessages: {
    release: [{ text: "Release A", withName: false }, { text: "Release B", withName: false }],
    chastity: [{ text: "Chastity A", withName: false }, { text: "Chastity B", withName: false }],
  },
  managementFinalDayMessages: {
    release: [{ text: "Release final", withName: false }],
    chastity: [{ text: "Chastity final", withName: false }],
  },
}));

const asyncValues = new Map<string, string>();
const localValues = new Map<string, string>();
const local = {
  get length() { return localValues.size; },
  key: (index: number) => [...localValues.keys()][index] ?? null,
  getItem: (key: string) => localValues.get(key) ?? null,
  setItem: vi.fn((key: string, value: string) => { localValues.set(key, value); }),
  removeItem: (key: string) => { localValues.delete(key); },
};

function setSetting(key: string, value: string) {
  client.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", [key, value]);
}
function rawSetting(key: string) {
  return client.queryOne<{ setting_value: string }>("SELECT * FROM app_settings WHERE setting_key=?", [key])?.setting_value;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 6, 12));
  vi.stubGlobal("localStorage", local);
  for (const table of ["app_settings", "management_cycles", "management_daily_tasks", "point_transactions", "journals"]) client.execute(`DELETE FROM ${table}`);
  asyncValues.clear();
  storage.getItem.mockImplementation(async (key: string) => asyncValues.get(key) ?? null);
  storage.setItem.mockImplementation(async (key: string, value: string) => { asyncValues.set(key, value); });
  storage.getAllKeys.mockImplementation(async () => [...asyncValues.keys()]);
  storage.multiGet.mockImplementation(async (keys: string[]) => keys.map((key) => [key, asyncValues.get(key) ?? null]));
  storage.removeItem.mockImplementation(async (key: string) => { asyncValues.delete(key); });
  storage.multiRemove.mockImplementation(async (keys: string[]) => { keys.forEach((key) => asyncValues.delete(key)); });
  vi.spyOn(Math, "random").mockReturnValue(0.999);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("custom command definitions and locked catalog", () => {
  it("adds to only the selected pool and preserves exact input without changing built-ins", () => {
    const builtin = customCommandService.builtins("daily").map((item) => item.message.text);
    const text = "  Custom instruction\nsecond line {name}  ";
    const saved = customCommandService.add("daily", text);
    expect(customCommandService.list("daily")).toEqual([saved]);
    expect(customCommandService.pool("daily")).toEqual([{ text: "Daily A" }, { text: "Daily B" }, { text, customCommandId: saved.id }]);
    expect(customCommandService.pool("chastity")).toHaveLength(2);
    expect(customCommandService.builtins("daily").map((item) => item.message.text)).toEqual(builtin);
    expect(customCommandService.catalog("daily").every((item) => item.message === null)).toBe(true);
  });

  it("allows only custom IDs to be edited or deleted", () => {
    const saved = customCommandService.add("daily", "First");
    customCommandService.update(saved.id, "Changed");
    expect(customCommandService.list()[0]).toMatchObject({ id: saved.id, text: "Changed" });
    expect(() => customCommandService.update("daily:0", "Changed builtin")).toThrow();
    expect(() => customCommandService.remove("daily:0")).toThrow();
    customCommandService.remove(saved.id);
    expect(customCommandService.pool("daily")).toHaveLength(2);
  });

  it.each(["", "   ", "a".repeat(4001)])("rejects invalid text without changing saved commands", (text) => {
    const saved = customCommandService.add("release", "Keep");
    const before = rawSetting(CUSTOM_COMMANDS_KEY);
    expect(() => customCommandService.add("daily", text)).toThrow();
    expect(() => customCommandService.update(saved.id, text)).toThrow();
    expect(rawSetting(CUSTOM_COMMANDS_KEY)).toBe(before);
  });

  it("limits each category independently to 100 commands", () => {
    for (let index = 0; index < 100; index += 1) customCommandService.add("daily", `Command ${index}`);
    expect(() => customCommandService.add("daily", "Too many")).toThrow("100件");
    expect(() => customCommandService.add("release", "Allowed")).not.toThrow();
  });

  it("unlocks only explicitly seen built-ins, separately by category and final-day group", () => {
    customCommandService.markSeen("chastity", [{ text: "Chastity A" }, { text: "Release A" }, { text: "Chastity final" }]);
    expect(customCommandService.catalog("chastity").map((item) => item.message?.text ?? null)).toEqual(["Chastity A", null, null]);
    expect(customCommandService.catalog("release").every((item) => !item.message)).toBe(true);
    customCommandService.markSeen("chastity", [{ text: "Chastity final", finalDay: true }]);
    expect(customCommandService.catalog("chastity")[2].message?.text).toBe("Chastity final");
    const before = rawSetting(SEEN_COMMANDS_KEY);
    customCommandService.markSeen("chastity", [{ text: "Chastity A" }]);
    expect(rawSetting(SEEN_COMMANDS_KEY)).toBe(before);
  });

  it("does not unlock a built-in when a custom command has exactly the same text", () => {
    const custom = customCommandService.add("daily", "Daily A");
    customCommandService.markSeen("daily", [{ text: custom.text, customCommandId: custom.id }]);
    expect(customCommandService.catalog("daily").every((item) => !item.message)).toBe(true);
  });

  it("clears record visibility and assignment metadata while preserving user definitions", () => {
    const saved = customCommandService.add("chastity", "Keep custom");
    customCommandService.markSeen("daily", [{ text: "Daily A" }]);
    customCommandService.setManagementSource(1, "2026-10-06", saved.id);
    setSetting("other_preference", "keep");
    customCommandService.clearRecords();
    expect(customCommandService.list()).toEqual([saved]);
    expect(customCommandService.seen("daily")).toEqual([]);
    expect(customCommandService.managementSource(1, "2026-10-06")).toBeUndefined();
    customCommandService.clearAll();
    expect(customCommandService.list()).toEqual([]);
    expect(rawSetting("other_preference")).toBe("keep");
  });

  it("rolls back a failed definition write so an unsaved command cannot enter the pool", () => {
    const saved = customCommandService.add("daily", "Keep");
    local.setItem.mockImplementationOnce(() => { throw new Error("QuotaExceededError"); });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => customCommandService.update(saved.id, "Must not appear")).toThrow("QuotaExceededError");
    expect(customCommandService.list()).toEqual([saved]);
    expect(customCommandService.pool("daily").at(-1)?.text).toBe("Keep");
    expect(() => customCommandService.update(saved.id, "Retry")).not.toThrow();
    consoleError.mockRestore();
  });

  it.each(["broken", "null", '{"version":2,"commands":[]}', '{"version":1,"commands":[{"id":"bad"}]}'])
    ("refuses corrupt custom data without overwriting it: %s", (raw) => {
      setSetting(CUSTOM_COMMANDS_KEY, raw);
      expect(() => customCommandService.list()).toThrow();
      expect(() => customCommandService.add("daily", "New")).toThrow();
      expect(rawSetting(CUSTOM_COMMANDS_KEY)).toBe(raw);
    });

  it("rejects invalid/duplicate command settings in backups and accepts unrelated settings", () => {
    customCommandService.add("daily", "Valid");
    const row = { setting_key: CUSTOM_COMMANDS_KEY, setting_value: rawSetting(CUSTOM_COMMANDS_KEY) };
    expect(() => validateCustomCommandSettings([row, { setting_key: "unrelated", setting_value: "anything" }])).not.toThrow();
    expect(() => validateCustomCommandSettings([row, row])).toThrow();
    expect(() => validateCustomCommandSettings([{ setting_key: SEEN_COMMANDS_KEY, setting_value: '{"version":1,"commands":[{"text":"Bad"}]}' }])).toThrow();
    expect(() => validateCustomCommandSettings([{ setting_key: MANAGEMENT_COMMAND_SOURCES_KEY, setting_value: '{"version":1,"sources":{"__proto__":"custom-id"}}' }])).toThrow();
  });
});

describe("daily custom command selection and provenance", () => {
  it("draws custom commands once, then preserves their original snapshot after edit/delete", async () => {
    const custom = customCommandService.add("daily", "Daily A");
    const drawn = await dailyOrderService.draw();
    expect(drawn).toMatchObject({ text: "Daily A", customCommandId: custom.id, completed: false });
    customCommandService.update(custom.id, "Changed");
    customCommandService.remove(custom.id);
    expect(await dailyOrderService.draw()).toEqual(drawn);
    expect(await dailyOrderService.load()).toEqual(drawn);
    await dailyOrderService.complete(drawn);
    expect(await dailyOrderService.seenTexts()).toEqual([]);
    expect(await dailyOrderService.completedTexts()).toEqual([]);
    expect(journal.upsertSystemRecord).toHaveBeenLastCalledWith(expect.objectContaining({ body: "本日の命令\nDaily A\n\n実施完了", tags: expect.stringContaining("自分で追加した命令") }), "本日の命令固定記録");
  });

  it("does not reveal an interrupted draw, but recovers seen state from completed legacy orders", async () => {
    const drawn = await dailyOrderService.draw();
    expect(await dailyOrderService.seenTexts()).toEqual([]);
    customCommandService.markSeen("daily", [drawn]);
    expect(await dailyOrderService.seenTexts()).toEqual(["Daily B"]);
    customCommandService.clearRecords();
    expect(await dailyOrderService.seenTexts()).toEqual([]);
    await dailyOrderService.complete(drawn);
    expect(await dailyOrderService.seenTexts()).toEqual(["Daily B"]);
  });

  it("rejects completing a custom result as a built-in with identical text", async () => {
    customCommandService.add("daily", "Daily A");
    const drawn = await dailyOrderService.draw();
    await expect(dailyOrderService.complete({ date: drawn.date, text: drawn.text, completed: false })).rejects.toThrow("一致しません");
    expect(journal.upsertSystemRecord).not.toHaveBeenCalled();
  });
});

describe("management assignment snapshots", () => {
  it.each(["chastity", "release"] as const)("uses %s custom daily candidates while leaving final-day instructions unchanged", (mode) => {
    const custom = customCommandService.add(mode, `Custom ${mode}`);
    const cycle = managementRepository.roll(mode, 1);
    const tasks = managementRepository.tasks(cycle);
    expect(tasks).toHaveLength(3);
    expect(tasks.slice(0, 2).every((task) => task.instruction === custom.text && task.customCommandId === custom.id)).toBe(true);
    expect(tasks[2]).toMatchObject({ instruction: mode === "chastity" ? "Chastity final" : "Release final" });
    expect(tasks[2].customCommandId).toBeUndefined();
    expect(customCommandService.catalog(mode).every((item) => !item.message)).toBe(true);
  });

  it("keeps active assignments and their custom source after definitions are edited/deleted", () => {
    const custom = customCommandService.add("chastity", "Chastity A");
    const cycle = managementRepository.roll("chastity", 1);
    const tasks = managementRepository.tasks(cycle);
    customCommandService.update(custom.id, "Changed custom");
    customCommandService.remove(custom.id);
    expect(managementRepository.tasks(cycle)).toEqual(tasks);
    expect(managementRepository.todayTask(cycle)?.customCommandId).toBe(custom.id);
    const completed = managementRepository.complete(tasks[0].id);
    expect(completed.customCommandId).toBe(custom.id);
    customCommandService.syncCompletedManagement();
    expect(customCommandService.catalog("chastity").every((item) => !item.message)).toBe(true);
    managementRepository.syncCompletedJournals();
    expect(journal.upsertSystemRecord).toHaveBeenLastCalledWith(expect.objectContaining({ tags: expect.stringContaining("自分で追加した命令") }), `射精管理タスク${tasks[0].id}`);
  });

  it("does not reveal future assignments and recovers only completed built-in history", () => {
    const cycle = managementRepository.roll("release", 1);
    customCommandService.syncCompletedManagement();
    expect(customCommandService.seen("release")).toEqual([]);
    const tasks = managementRepository.tasks(cycle);
    managementRepository.complete(tasks[0].id);
    customCommandService.syncCompletedManagement();
    expect(customCommandService.catalog("release").map((item) => item.message?.text ?? null)).toEqual([null, "Release B", null]);
  });

  it("removes obsolete sources on reroll without deleting custom definitions or other cycle metadata", () => {
    const custom = customCommandService.add("chastity", "Custom");
    const first = managementRepository.roll("chastity", 1);
    customCommandService.setManagementSource(99, "2026-10-06", custom.id);
    const rerolled = managementRepository.reroll(first.id, "chastity", 1);
    expect(managementRepository.tasks(rerolled)[0].customCommandId).toBe(custom.id);
    expect(customCommandService.managementSource(99, "2026-10-06")).toBe(custom.id);
    expect(customCommandService.list()).toHaveLength(1);
    managementRepository.removeCycle(rerolled.id);
    expect(customCommandService.managementSource(rerolled.id, "2026-10-06")).toBeUndefined();
  });

  it("rolls back task creation and custom provenance together if saving provenance fails", () => {
    customCommandService.add("chastity", "Custom");
    const original = customCommandService.setManagementSource;
    vi.spyOn(customCommandService, "setManagementSource").mockImplementation((...args) => {
      original(...args);
      throw new Error("source save failed");
    });
    expect(() => managementRepository.roll("chastity", 1)).toThrow("source save failed");
    expect(client.query("SELECT * FROM management_daily_tasks")).toEqual([]);
    expect(rawSetting(MANAGEMENT_COMMAND_SOURCES_KEY)).toBeUndefined();
  });
});
