import * as SQLite from "expo-sqlite";

let database: SQLite.SQLiteDatabase | null = null;

function getDatabase() {
  database ??= SQLite.openDatabaseSync("habit_diary_timer.db");
  return database;
}

export const db = {
  execSync(sql: string) {
    return getDatabase().execSync(sql);
  },
};

export function query<T>(sql: string, params: SQLite.SQLiteBindParams = []) {
  return getDatabase().getAllSync<T>(sql, params);
}

export function queryOne<T>(sql: string, params: SQLite.SQLiteBindParams = []) {
  return getDatabase().getFirstSync<T>(sql, params);
}

export function execute(sql: string, params: SQLite.SQLiteBindParams = []) {
  return getDatabase().runSync(sql, params);
}

export function transaction(work: () => void) {
  getDatabase().withTransactionSync(work);
}
