import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailyOrderService, type DailyOrder } from "./gameRoomService";
import * as webClient from "../database/client.web";

const storage = vi.hoisted(() => ({
  getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(),
  getAllKeys: vi.fn(), multiGet: vi.fn(), multiRemove: vi.fn(),
}));
const points = vi.hoisted(() => ({ award: vi.fn() }));
const journal = vi.hoisted(() => ({ upsertSystemRecord: vi.fn() }));
const database = vi.hoisted(() => ({ queryOne: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("@/repositories/rewardRepository", () => ({ pointRepository: points }));
vi.mock("@/repositories/journalRepository", () => ({ journalRepository: journal }));
vi.mock("@/database/client", () => database);
vi.mock("@/constants/messages", () => ({ dailyOrderMessages: [{ text: "Order A" }, { text: "Order B" }] }));
vi.mock("@/utils/date", () => ({ toDateKey: () => "2026-09-16" }));
vi.mock("@/schemas/storage", () => import("../schemas/storage"));
vi.mock("@/utils/storageValidation", () => import("../utils/storageValidation"));

const today = "2026-09-16";
const prefix = "nino-room:daily-order:";
const saved = new Map<string, string>();
const awarded = new Map<string, number>();
const journals = new Map<string, { created_at: string }>();
const order = (overrides: Partial<DailyOrder> = {}): DailyOrder => ({
  date: today, text: "Order A", completed: false, ...overrides,
});
const seed = (value: DailyOrder, date = value.date) => saved.set(`${prefix}${date}`, JSON.stringify(value));

beforeEach(() => {
  vi.resetAllMocks();
  saved.clear();
  awarded.clear();
  journals.clear();
  storage.getItem.mockImplementation(async (key: string) => saved.get(key) ?? null);
  storage.setItem.mockImplementation(async (key: string, value: string) => { saved.set(key, value); });
  storage.removeItem.mockImplementation(async (key: string) => { saved.delete(key); });
  storage.getAllKeys.mockImplementation(async () => [...saved.keys()]);
  storage.multiGet.mockImplementation(async (keys: string[]) => keys.map((key) => [key, saved.get(key) ?? null]));
  storage.multiRemove.mockImplementation(async (keys: string[]) => { keys.forEach((key) => saved.delete(key)); });
  points.award.mockImplementation((key: string, value: number) => {
    if (awarded.has(key)) return false;
    awarded.set(key, value);
    return true;
  });
  journal.upsertSystemRecord.mockImplementation((record: { recordDate: string }, tag: string) => {
    const key = `${record.recordDate}:${tag}`;
    journals.set(key, { ...record, created_at: journals.get(key)?.created_at ?? `${today} 12:00:00` });
    return 1;
  });
  database.queryOne.mockImplementation((sql: string, params: string[] = []) => {
    if (sql.includes("FROM journals")) return journals.get(`${params[0]}:本日の命令固定記録`) ?? null;
    return null;
  });
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("completed daily order history", () => {
  it("counts completed texts from any stored day, ignoring draws, corruption and mismatched dates", async () => {
    seed(order());
    seed(order({ date: "2026-09-15", completed: true }));
    seed(order({ date: "2026-09-14", completed: true }));
    seed(order({ date: "2026-09-13", text: "Old custom order", completed: true }));
    seed(order({ date: "2026-09-12", text: "Wrong date", completed: true }), "2026-09-11");
    saved.set(`${prefix}2026-09-10`, "broken JSON");
    saved.set(`${prefix}2026-09-09`, JSON.stringify({ date: "2026-09-09", text: "Invalid flag", completed: "true" }));
    saved.set("unrelated", JSON.stringify(order({ text: "Other key", completed: true })));
    const before = [...saved.entries()];

    expect(await dailyOrderService.completedTexts()).toEqual(["Order A", "Old custom order"]);
    expect([...saved.entries()]).toEqual(before);
    expect(storage.multiGet).toHaveBeenCalledExactlyOnceWith([...saved.keys()].filter((key) => key.startsWith(prefix)));
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.multiRemove).not.toHaveBeenCalled();
    expect(points.award).not.toHaveBeenCalled();
    expect(database.queryOne).not.toHaveBeenCalled();
    expect(journal.upsertSystemRecord).not.toHaveBeenCalled();
  });

  it("does not count an uncompleted draw as experience and avoids a batch read when there are no orders", async () => {
    expect(await dailyOrderService.completedTexts()).toEqual([]);
    expect(storage.multiGet).not.toHaveBeenCalled();
    await dailyOrderService.draw();
    expect(await dailyOrderService.completedTexts()).toEqual([]);
  });

  it("propagates a failed history read and permits a later retry", async () => {
    seed(order({ completed: true }));
    const failure = new Error("history unavailable");
    storage.multiGet.mockRejectedValueOnce(failure);
    await expect(dailyOrderService.completedTexts()).rejects.toBe(failure);
    expect(await dailyOrderService.completedTexts()).toEqual(["Order A"]);
  });
});

describe("daily order mutations", () => {
  it("keeps concurrent and repeated draws on the same saved result", async () => {
    vi.mocked(Math.random).mockReturnValueOnce(0).mockReturnValue(0.99);
    const draws = await Promise.all([dailyOrderService.draw(), dailyOrderService.draw(), dailyOrderService.draw()]);
    expect(draws).toEqual([order(), order(), order()]);
    expect(await dailyOrderService.draw()).toEqual(order());
    expect(Math.random).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(`${prefix}${today}`, JSON.stringify(order()));
  });

  it("completes concurrent requests once with the same award key and protected diary", async () => {
    seed(order());
    const completed = order({ completed: true });
    expect(await Promise.all([dailyOrderService.complete(order()), dailyOrderService.complete(order())]))
      .toEqual([completed, completed]);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect([...awarded.entries()]).toEqual([[`daily-order:${today}`, 1]]);
    expect(points.award.mock.calls.every(([key, value]) => key === `daily-order:${today}` && value === 1)).toBe(true);
    expect(journals.size).toBe(1);
    expect(journal.upsertSystemRecord).toHaveBeenLastCalledWith({
      recordDate: today, title: "本日の命令記録", body: "本日の命令\nOrder A\n\n実施完了",
      recordType: "diary", tags: "本日の命令,完了,削除不可",
    }, "本日の命令固定記録");
  });

  it.each(["missing", "different", "corrupt", "wrong-date"])("refuses a %s saved result instead of overwriting it", async (state) => {
    if (state === "different") seed(order({ text: "Order B" }));
    if (state === "corrupt") saved.set(`${prefix}${today}`, "broken JSON");
    if (state === "wrong-date") seed(order({ date: "2026-09-15" }), today);
    const before = [...saved.entries()];
    await expect(dailyOrderService.complete(order({ completed: true })))
      .rejects.toThrow("保存済みの命令と一致しません。再読み込みしてください。");
    expect([...saved.entries()]).toEqual(before);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(points.award).not.toHaveBeenCalled();
    expect(journal.upsertSystemRecord).not.toHaveBeenCalled();
  });

  it("recovers from a failed draw without inventing a completion", async () => {
    const failure = new Error("draw storage failed");
    storage.setItem.mockRejectedValueOnce(failure);
    await expect(dailyOrderService.draw()).rejects.toBe(failure);
    expect(saved.has(`${prefix}${today}`)).toBe(false);
    expect(await dailyOrderService.draw()).toEqual(order());
    expect(points.award).not.toHaveBeenCalled();
    expect(journal.upsertSystemRecord).not.toHaveBeenCalled();
  });

  it("does not award or write a diary until completion storage succeeds, and can retry", async () => {
    seed(order());
    const failure = new Error("completion storage failed");
    storage.setItem.mockRejectedValueOnce(failure);
    await expect(dailyOrderService.complete(order())).rejects.toBe(failure);
    expect(JSON.parse(saved.get(`${prefix}${today}`)!)).toEqual(order());
    expect(points.award).not.toHaveBeenCalled();
    expect(journal.upsertSystemRecord).not.toHaveBeenCalled();
    expect(await dailyOrderService.complete(order())).toEqual(order({ completed: true }));
    expect([...awarded.entries()]).toEqual([[`daily-order:${today}`, 1]]);
  });

  it.each(["award", "journal"])("repairs a %s failure by retrying the saved completion without duplicating points", async (step) => {
    seed(order());
    const failure = new Error(`${step} failed`);
    const operation = step === "award" ? points.award : journal.upsertSystemRecord;
    operation.mockImplementationOnce(() => { throw failure; });
    await expect(dailyOrderService.complete(order())).rejects.toBe(failure);
    expect(JSON.parse(saved.get(`${prefix}${today}`)!)).toEqual(order({ completed: true }));
    expect(await dailyOrderService.complete(order())).toEqual(order({ completed: true }));
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect([...awarded.entries()]).toEqual([[`daily-order:${today}`, 1]]);
    expect(journals.size).toBe(1);
  });

  it.each(["award", "journal"])("recovers a saved completion after a %s failure when the screen reloads", async (step) => {
    seed(order());
    const failure = new Error(`${step} failed`);
    const operation = step === "award" ? points.award : journal.upsertSystemRecord;
    operation.mockImplementationOnce(() => { throw failure; });
    await expect(dailyOrderService.complete(order())).rejects.toBe(failure);

    expect(await dailyOrderService.load()).toEqual(order({ completed: true }));
    expect([...awarded.entries()]).toEqual([[`daily-order:${today}`, 1]]);
    expect(journals.size).toBe(1);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(await dailyOrderService.load()).toEqual(order({ completed: true }));
    expect([...awarded.entries()]).toEqual([[`daily-order:${today}`, 1]]);
  });

  it("propagates diary failures from load and draw without replacing a saved completed order", async () => {
    seed(order({ completed: true }));
    const failure = new Error("journal unavailable");
    journal.upsertSystemRecord
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementationOnce(() => { throw failure; });
    await expect(dailyOrderService.load()).rejects.toBe(failure);
    await expect(dailyOrderService.draw()).rejects.toBe(failure);
    expect(Math.random).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(await dailyOrderService.draw()).toEqual(order({ completed: true }));
  });

  it("does not resurrect an old order when completion follows a queued removal", async () => {
    seed(order());
    const removing = dailyOrderService.remove();
    const completing = dailyOrderService.complete(order());
    await expect(completing).rejects.toThrow("保存済みの命令と一致しません。");
    await removing;
    expect(await dailyOrderService.load()).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(points.award).not.toHaveBeenCalled();
  });

  it("repairs missing awards on the Web database while respecting a later points reset", async () => {
    const local = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => { local.set(key, value); },
      removeItem: (key: string) => { local.delete(key); },
    });
    for (const table of ["journals", "point_transactions", "app_settings"]) webClient.execute(`DELETE FROM ${table}`);
    database.queryOne.mockImplementation(webClient.queryOne);
    journal.upsertSystemRecord.mockImplementation((record: { recordDate: string }, tag: string) => {
      const existing = webClient.queryOne<{ id: number }>(
        "SELECT id FROM journals WHERE record_date=? AND tags LIKE ? LIMIT 1", [record.recordDate, `%${tag}%`],
      );
      if (existing) return existing.id;
      return webClient.execute(
        "INSERT INTO journals(record_date, tags, created_at) VALUES(?, ?, ?)",
        [record.recordDate, tag, `${today} 12:00:00`],
      ).lastInsertRowId;
    });
    points.award.mockImplementation((key: string, value: number, description: string) => webClient.execute(
      "INSERT OR IGNORE INTO point_transactions(source_key, points, description, created_at) VALUES(?, ?, ?, ?)",
      [key, value, description, `${today} 12:00:00`],
    ).changes > 0);
    seed(order({ completed: true }));

    await dailyOrderService.load();
    await dailyOrderService.load();
    expect(webClient.query("SELECT * FROM point_transactions")).toEqual([
      expect.objectContaining({ source_key: `daily-order:${today}`, points: 1 }),
    ]);
    webClient.execute("DELETE FROM point_transactions");
    webClient.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", ["points_reset_at", `${today} 12:01:00`]);
    await dailyOrderService.load();
    expect(webClient.query("SELECT * FROM point_transactions")).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("preserves cleanup scopes and syncs only valid completed journals", async () => {
    seed(order());
    seed(order({ date: "2026-09-15", completed: true }));
    seed(order({ date: "2026-09-14", completed: true }), "2026-09-13");
    saved.set(`${prefix}2026-09-12`, "broken JSON");
    saved.set("nino-room:contract", "contract");
    saved.set("unrelated", "keep");
    await dailyOrderService.syncCompletedJournals();
    expect(journal.upsertSystemRecord).toHaveBeenCalledOnce();
    expect(journal.upsertSystemRecord.mock.calls[0][0].recordDate).toBe("2026-09-15");
    await dailyOrderService.clearOrders();
    expect([...saved.keys()]).toEqual(["nino-room:contract", "unrelated"]);
    seed(order());
    await dailyOrderService.clearAll();
    expect([...saved.entries()]).toEqual([["unrelated", "keep"]]);
  });
});
