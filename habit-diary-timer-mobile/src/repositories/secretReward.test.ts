import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_UNLOCK_PASSWORD } from "@nino/shared/gamePassword";

const database = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));
vi.mock("@/database/client", () => database);
vi.mock("@/utils/date", () => import("../utils/date"));
vi.mock("@/constants/messages", () => ({
  rewardBrutalOrderMessages: [], rewardInsultMessages: [], rewardPraiseMessages: [],
  rewardSecretMessages: [{ text: "秘密のメッセージ♡" }],
}));

describe.each(["web", "sqlite"] as const)("secret reward using %s", (adapter) => {
  let sqlite: DatabaseSync | undefined;
  let sqlitePath: string | undefined;
  let web: typeof import("../database/client.web");
  let rewards: typeof import("./rewardRepository").rewardRepository;
  let inTransaction = false;
  let saved: Map<string, string>;

  function connect() {
    if (sqlite) {
      database.execute.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite!.prepare(sql).run(...params));
      database.query.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite!.prepare(sql).all(...params));
      database.queryOne.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite!.prepare(sql).get(...params) ?? null);
    } else {
      database.execute.mockImplementation(web.execute);
      database.query.mockImplementation(web.query);
      database.queryOne.mockImplementation(web.queryOne);
    }
    database.transaction.mockImplementation((work: () => void) => {
      expect(inTransaction).toBe(false);
      inTransaction = true;
      try {
        if (sqlite) {
          sqlite.exec("BEGIN");
          try { work(); sqlite.exec("COMMIT"); }
          catch (error) { sqlite.exec("ROLLBACK"); throw error; }
        } else web.transaction(work);
      } finally { inTransaction = false; }
    });
  }

  function earn(points: number) {
    database.execute("INSERT INTO point_transactions(source_key, points, description, created_at) VALUES(?, ?, ?, ?)",
      ["test-balance", points, "Earned points", "2026-10-27 12:00:00"]);
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("EXPO_PUBLIC_APP_ENV", "production");
    inTransaction = false;
    saved = new Map();
    if (adapter === "sqlite") {
      const { DatabaseSync: SQLite } = await import("node:sqlite");
      sqlitePath = join(tmpdir(), `nino-secret-reward-${randomUUID()}.sqlite`);
      sqlite = new SQLite(sqlitePath);
      sqlite.exec(`
        CREATE TABLE journals (id INTEGER PRIMARY KEY, record_date TEXT, title TEXT, created_at TEXT);
        CREATE TABLE management_daily_tasks (id INTEGER PRIMARY KEY, record_date TEXT, completed_at TEXT);
        CREATE TABLE app_settings (setting_key TEXT UNIQUE, setting_value TEXT);
        CREATE TABLE point_transactions (id INTEGER PRIMARY KEY, source_key TEXT UNIQUE, points INTEGER,
          description TEXT, created_at TEXT);
        CREATE TABLE reward_redemptions (id INTEGER PRIMARY KEY, reward_key TEXT, reward_name TEXT,
          points_spent INTEGER, reward_content TEXT, file_uri TEXT, redeemed_at TEXT);
      `);
    } else {
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => { saved.set(key, value); },
        removeItem: (key: string) => { saved.delete(key); },
      });
      web = await import("../database/client.web");
    }
    connect();
    rewards = (await import("./rewardRepository")).rewardRepository;
  });

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;
    if (sqlitePath) unlinkSync(sqlitePath);
    sqlitePath = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([0, 9999])("does not reveal or charge the secret with %i points", (points) => {
    earn(points);
    expect(rewards.redeemSecret()).toBeNull();
    expect(rewards.acquired()).toEqual([]);
    expect(rewards.balance()).toEqual({ earned: points, spent: 0, available: points, stgBonus: 0 });
  });

  it("spends exactly 10,000 points and preserves the message and password after reopening storage", async () => {
    earn(10000);
    const content = rewards.redeemSecret();
    expect(content).toContain("秘密のメッセージ♡");
    expect(content).toContain(`ゲームのPW（⑤・⑥）\n${GAME_UNLOCK_PASSWORD}`);
    const acquired = rewards.acquired();
    expect(acquired).toEqual([expect.objectContaining({
      reward_key: "secret", points_spent: 10000, reward_content: content,
    })]);
    expect(rewards.balance()).toEqual({ earned: 10000, spent: 10000, available: 0, stgBonus: 0 });

    vi.resetModules();
    if (sqlite) {
      sqlite.close();
      const { DatabaseSync: SQLite } = await import("node:sqlite");
      sqlite = new SQLite(sqlitePath!);
    } else {
      expect(saved.get("nino-room-web-db-v2:reward_redemptions")).toContain(GAME_UNLOCK_PASSWORD);
      web = await import("../database/client.web");
    }
    connect();
    rewards = (await import("./rewardRepository")).rewardRepository;
    expect(rewards.acquired()).toEqual(acquired);
    expect(rewards.balance()).toEqual({ earned: 10000, spent: 10000, available: 0, stgBonus: 0 });
    expect(rewards.redeemSecret()).toBeNull();
    expect(rewards.acquired()).toHaveLength(1);
  });

  it("retains repeat exchanges at 10,000 points each while sufficient points remain", () => {
    earn(25000);
    expect(rewards.redeemSecret()).toContain(GAME_UNLOCK_PASSWORD);
    expect(rewards.redeemSecret()).toContain(GAME_UNLOCK_PASSWORD);
    expect(rewards.redeemSecret()).toBeNull();
    expect(rewards.acquired()).toHaveLength(2);
    expect(rewards.acquired().map((item) => item.points_spent)).toEqual([10000, 10000]);
    expect(rewards.balance()).toEqual({ earned: 25000, spent: 20000, available: 5000, stgBonus: 0 });
  });

  it("rechecks the balance when another exchange spends points before the secret transaction", () => {
    earn(10000);
    const queryOne = database.queryOne.getMockImplementation()!;
    let exchanged = false;
    database.queryOne.mockImplementation((sql: string, params = []) => {
      const result = queryOne(sql, params);
      if (!inTransaction && !exchanged && sql.includes("SUM(points_spent)")) {
        exchanged = true;
        database.execute(
          "INSERT INTO reward_redemptions(reward_key, reward_name, points_spent, reward_content, redeemed_at) VALUES(?, ?, ?, ?, ?)",
          ["video", "Another reward", 500, "Saved video", "2026-10-27 12:00:00"],
        );
      }
      return result;
    });

    expect(rewards.redeemSecret()).toBeNull();
    expect(rewards.acquired()).toEqual([expect.objectContaining({ reward_key: "video", points_spent: 500 })]);
    expect(rewards.balance()).toEqual({ earned: 10000, spent: 500, available: 9500, stgBonus: 0 });
  });

  it("rolls back a failed secret write and notifies listeners only after a successful commit", async () => {
    earn(10000);
    const balance = rewards.balance();
    expect(rewards.acquired()).toEqual([]);
    const persisted = new Map(saved);
    const execute = database.execute.getMockImplementation()!;
    database.execute.mockImplementation((sql: string, params = []) => {
      const result = execute(sql, params);
      if (sql.includes("INSERT INTO reward_redemptions")) throw new Error("secret write failed");
      return result;
    });

    const { pointRepository } = await import("./rewardRepository");
    const listener = vi.fn(() => {
      expect(inTransaction).toBe(false);
      expect(rewards.balance().available).toBe(0);
      expect(rewards.acquired()[0]?.reward_content).toContain(GAME_UNLOCK_PASSWORD);
    });
    const unsubscribe = pointRepository.subscribe(listener);
    try {
      expect(() => rewards.redeemSecret()).toThrow("secret write failed");
      database.execute.mockImplementation(execute);
      expect(rewards.acquired()).toEqual([]);
      expect(rewards.balance()).toEqual(balance);
      if (adapter === "web") expect(saved).toEqual(persisted);
      expect(listener).not.toHaveBeenCalled();
      expect(rewards.redeemSecret()).toContain(GAME_UNLOCK_PASSWORD);
      expect(rewards.acquired()).toHaveLength(1);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally { unsubscribe(); }
  });
});
