import { db, execute, queryOne, transaction } from "./client";
import { toDateKey, toDateTimeKey } from "@/utils/date";

const DATABASE_VERSION = 4;

function createMetaTable() {
  execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

function version() {
  return queryOne<{ version: number }>("SELECT version FROM schema_migrations WHERE id = 1")?.version ?? 0;
}

function setVersion(nextVersion: number) {
  execute(
    `INSERT INTO schema_migrations(id, version, updated_at)
     VALUES(1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET version=excluded.version, updated_at=excluded.updated_at`,
    [nextVersion, toDateTimeKey()],
  );
}

function migrateToV1() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      icon TEXT,
      color TEXT NOT NULL DEFAULT '#2f8b72',
      frequency_type TEXT NOT NULL DEFAULT 'daily',
      target_count INTEGER NOT NULL DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      reminder_enabled INTEGER NOT NULL DEFAULT 0,
      reminder_time TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS habit_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      day_of_week INTEGER,
      scheduled_time TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS habit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      record_date TEXT NOT NULL,
      record_time TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_count INTEGER NOT NULL DEFAULT 1,
      duration_seconds INTEGER,
      mood TEXT,
      comment TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(habit_id, record_date),
      FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS journals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_date TEXT NOT NULL,
      record_time TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      record_type TEXT NOT NULL,
      mood TEXT,
      rating INTEGER,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      related_habit_id INTEGER,
      duration_seconds INTEGER,
      memo TEXT,
      tags TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(related_habit_id) REFERENCES habits(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS journal_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      UNIQUE(journal_id, tag_id),
      FOREIGN KEY(journal_id) REFERENCES journals(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS timer_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      timer_type TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      focus_seconds INTEGER,
      break_seconds INTEGER,
      set_count INTEGER NOT NULL DEFAULT 1,
      sound_enabled INTEGER NOT NULL DEFAULT 1,
      vibration_enabled INTEGER NOT NULL DEFAULT 1,
      auto_start INTEGER NOT NULL DEFAULT 0,
      related_habit_id INTEGER,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      memo TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(related_habit_id) REFERENCES habits(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS timer_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timer_preset_id INTEGER,
      timer_name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      actual_duration_seconds INTEGER NOT NULL DEFAULT 0,
      completion_status TEXT NOT NULL,
      pause_count INTEGER NOT NULL DEFAULT 0,
      related_habit_id INTEGER,
      comment TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(timer_preset_id) REFERENCES timer_presets(id) ON DELETE SET NULL,
      FOREIGN KEY(related_habit_id) REFERENCES habits(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_habit_records_date ON habit_records(record_date);
    CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(record_date);
    CREATE INDEX IF NOT EXISTS idx_timer_histories_started ON timer_histories(started_at);
  `);
}

function migrateToV2() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS preparation_records (
      record_date TEXT PRIMARY KEY,
      checks_json TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS management_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      dice INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS management_daily_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      record_date TEXT NOT NULL,
      instruction TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(cycle_id, record_date),
      FOREIGN KEY(cycle_id) REFERENCES management_cycles(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_management_cycles_mode ON management_cycles(mode, is_active);
    CREATE INDEX IF NOT EXISTS idx_management_tasks_date ON management_daily_tasks(record_date);
    DELETE FROM habits WHERE name IN ('水を飲む', '運動する', '読書する', '早く寝る', '日記を書く');
  `);
}

function migrateToV3() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS reward_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reward_key TEXT NOT NULL,
      reward_name TEXT NOT NULL,
      points_spent INTEGER NOT NULL,
      redeemed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reward_redemptions_date ON reward_redemptions(redeemed_at);
  `);
}

function migrateToV4() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS point_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL UNIQUE,
      points INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    ALTER TABLE reward_redemptions ADD COLUMN reward_content TEXT;
    ALTER TABLE reward_redemptions ADD COLUMN file_uri TEXT;
    CREATE INDEX IF NOT EXISTS idx_point_transactions_date ON point_transactions(created_at);
  `);
}

function seedInitialData() {
  const now = toDateTimeKey();
  const today = toDateKey();
  const timers = [
    ["集中25分", "focus", 1500, 1500, 300, 1],
    ["休憩5分", "break", 300, null, 300, 1],
    ["集中50分", "focus", 3000, 3000, 600, 1],
    ["自由タイマー10分", "custom", 600, null, null, 1],
  ];
  const existingTimers = queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM timer_presets")?.count ?? 0;
  if (existingTimers === 0) timers.forEach(([name, type, duration, focus, breakSeconds, setCount]) => {
    execute(
      `INSERT INTO timer_presets(name, timer_type, duration_seconds, focus_seconds, break_seconds, set_count, sound_enabled, vibration_enabled, auto_start, is_favorite, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, 1, 1, 0, 0, ?, ?)`,
      [name, type, duration, focus, breakSeconds, setCount, now, now],
    );
  });
  const existingJournals = queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM journals")?.count ?? 0;
  if (existingJournals === 0) execute(
    `INSERT INTO journals(record_date, record_time, title, body, record_type, mood, rating, is_favorite, tags, created_at, updated_at)
     VALUES(?, '21:00', 'はじめての記録', '今日から習慣と日記を記録します。', 'diary', 'good', 4, 1, '開始,サンプル', ?, ?)`,
    [today, now, now],
  );
}

export function initializeDatabase() {
  db.execSync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  createMetaTable();
  transaction(() => {
    if (version() < 1) {
      migrateToV1();
      setVersion(1);
    }
    if (version() < 2) {
      migrateToV2();
      setVersion(2);
    }
    if (version() < 3) {
      migrateToV3();
      setVersion(3);
    }
    if (version() < 4) {
      migrateToV4();
      setVersion(DATABASE_VERSION);
    }
    seedInitialData();
  });
}
