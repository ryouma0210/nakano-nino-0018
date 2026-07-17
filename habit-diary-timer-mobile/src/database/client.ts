import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("habit_diary_timer.db");

export function query<T>(sql: string, params: SQLite.SQLiteBindParams = []) {
  return db.getAllSync<T>(sql, params);
}

export function queryOne<T>(sql: string, params: SQLite.SQLiteBindParams = []) {
  return db.getFirstSync<T>(sql, params);
}

export function execute(sql: string, params: SQLite.SQLiteBindParams = []) {
  return db.runSync(sql, params);
}

export function transaction(work: () => void) {
  db.withTransactionSync(work);
}
