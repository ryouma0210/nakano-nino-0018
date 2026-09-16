import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { achievementRepository } from "./achievementRepository";
import * as webClient from "../database/client.web";

const database = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), queryOne: vi.fn() }));
const journal = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/database/client", () => database);
vi.mock("@/repositories/journalRepository", () => ({ journalRepository: journal }));
vi.mock("@/utils/date", () => ({
  toDateKey: () => "2026-09-16",
  toDateTimeKey: () => "2026-09-16 12:00:00",
}));

beforeEach(() => {
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
  // The web adapter caches table rows; clear only this test's in-memory table.
  webClient.execute("DELETE FROM timer_histories");
  database.execute.mockImplementation(webClient.execute);
  database.query.mockImplementation(webClient.query);
  database.queryOne.mockImplementation(webClient.queryOne);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("punishment completion records", () => {
  it("saves a normal finish as completed together with its existing diary details", () => {
    achievementRepository.recordPunishment(60);

    expect(webClient.query("SELECT * FROM timer_histories")).toEqual([
      expect.objectContaining({
        timer_name: "お仕置き", completion_status: "completed", actual_duration_seconds: 60,
        started_at: "2026-09-16 12:00:00", ended_at: "2026-09-16 12:00:00",
      }),
    ]);
    expect(journal.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      recordDate: "2026-09-16", title: "お仕置き記録", tags: "お仕置き,実施記録", durationSeconds: 60,
    }));
  });

  it("retains time and a diary for a stopped session without counting it as a normal finish", () => {
    webClient.execute(
      "INSERT INTO timer_histories(timer_name, completion_status, actual_duration_seconds, started_at) VALUES(?, ?, ?, ?)",
      ["お仕置き", "completed", 45, "2026-09-15 12:00:00"],
    );
    achievementRepository.recordPunishment(12.9, "stopped");
    achievementRepository.recordPunishment(60, "completed");

    expect(webClient.query("SELECT * FROM timer_histories")).toEqual([
      expect.objectContaining({ completion_status: "completed", actual_duration_seconds: 45, started_at: "2026-09-15 12:00:00" }),
      expect.objectContaining({ completion_status: "stopped", actual_duration_seconds: 12 }),
      expect.objectContaining({ completion_status: "completed", actual_duration_seconds: 60 }),
    ]);
    expect(webClient.queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM timer_histories WHERE completion_status='completed' AND started_at LIKE ?",
      ["2026-09-16%"],
    )?.count).toBe(1);
    expect(journal.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      body: "お仕置き部屋で12秒受けました。", durationSeconds: 12,
    }));
    expect(journal.create).toHaveBeenCalledTimes(2);
  });

  it("does not create a completion or diary when stopped before any time has elapsed", () => {
    achievementRepository.recordPunishment(0, "stopped");

    expect(database.execute).not.toHaveBeenCalled();
    expect(journal.create).not.toHaveBeenCalled();
  });
});
