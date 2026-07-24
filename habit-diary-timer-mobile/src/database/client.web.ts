type BindParam = string | number | null | boolean | Uint8Array;
type BindParams = BindParam[] | Record<string, BindParam>;

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;
type ExecuteResult = {
  changes: number;
  lastInsertRowId: number;
};

const STORAGE_KEY = "nino-room-web-db-v1";
const ID_COLUMNS = new Set([
  "habits",
  "habit_schedules",
  "habit_records",
  "journals",
  "tags",
  "journal_tags",
  "timer_presets",
  "timer_histories",
  "app_settings",
  "management_cycles",
  "management_daily_tasks",
  "reward_redemptions",
  "point_transactions",
]);
const UNIQUE_COLUMNS: Record<string, string[]> = {
  schema_migrations: ["id"],
  app_settings: ["setting_key"],
  preparation_records: ["record_date"],
  point_transactions: ["source_key"],
};

let cache: Store | null = null;
let lastInsertRowId = 0;

function storage() {
  return globalThis.localStorage;
}

function loadStore(): Store {
  if (cache) return cache;
  try {
    cache = JSON.parse(storage().getItem(STORAGE_KEY) ?? "{}") as Store;
  } catch {
    cache = {};
  }
  return cache;
}

function saveStore() {
  storage().setItem(STORAGE_KEY, JSON.stringify(loadStore()));
}

function table(name: string) {
  const store = loadStore();
  store[name] ??= [];
  return store[name];
}

function nextId(name: string) {
  const max = table(name).reduce((value, row) => Math.max(value, Number(row.id ?? 0)), 0);
  lastInsertRowId = max + 1;
  return lastInsertRowId;
}

function splitComma(value: string) {
  const result: string[] = [];
  let current = "";
  let quote: string | null = null;
  let depth = 0;
  for (const char of value) {
    if ((char === "'" || char === "\"") && !quote) quote = char;
    else if (char === quote) quote = null;
    else if (!quote && char === "(") depth += 1;
    else if (!quote && char === ")") depth -= 1;

    if (!quote && depth === 0 && char === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function paramsArray(params: BindParams) {
  return Array.isArray(params) ? [...params] : Object.values(params);
}

function literal(token: string, params: BindParam[]) {
  const trimmed = token.trim();
  if (trimmed === "?") return params.shift() ?? null;
  if (/^null$/i.test(trimmed)) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const quoted = trimmed.match(/^['"](.*)['"]$/);
  if (quoted) return quoted[1].replaceAll("''", "'");
  return trimmed;
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

function like(value: unknown, pattern: string) {
  const text = String(value ?? "");
  const regex = new RegExp(`^${pattern.split("%").map(escapeRegExp).join(".*")}$`);
  return regex.test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compareValue(row: Row, column: string, operator: string, expected: unknown) {
  const actual = row[column];
  if (operator === "=") return String(actual ?? "") === String(expected ?? "");
  if (operator === ">") return String(actual ?? "") > String(expected ?? "");
  if (operator === "<") return String(actual ?? "") < String(expected ?? "");
  if (operator.toUpperCase() === "LIKE") return like(actual, String(expected ?? ""));
  return true;
}

function matchWhere(row: Row, whereSql: string | undefined, params: BindParam[]) {
  if (!whereSql) return true;
  const parts = whereSql
    .replace(/\s+LIMIT\s+\d+.*$/i, "")
    .replace(/\s+ORDER\s+BY\s+.+$/i, "")
    .split(/\s+AND\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const isNotNull = part.match(/^([a-zA-Z0-9_]+)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNull) {
      if (row[isNotNull[1]] == null) return false;
      continue;
    }
    const match = part.match(/^([a-zA-Z0-9_]+)\s*(=|>|<|LIKE)\s*(.+)$/i);
    if (!match) continue;
    const [, column, operator, token] = match;
    if (!compareValue(row, column, operator, literal(token, params))) return false;
  }
  return true;
}

function orderRows(rows: Row[], sql: string) {
  const order = sql.match(/\sORDER\s+BY\s+(.+?)(?:\sLIMIT\s+\d+)?$/i)?.[1];
  if (!order) return rows;
  const keys = splitComma(order).map((item) => {
    const [column, direction] = item.trim().split(/\s+/);
    return { column, desc: direction?.toUpperCase() === "DESC" };
  });
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const av = String(a[key.column] ?? "");
      const bv = String(b[key.column] ?? "");
      if (av === bv) continue;
      return (av > bv ? 1 : -1) * (key.desc ? -1 : 1);
    }
    return 0;
  });
}

function selectRows(sql: string, params: BindParam[]) {
  const match = sql.match(/^SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+.+?)?(?:\s+LIMIT\s+\d+)?$/i);
  if (!match) return [];
  const [, columns, name, whereSql] = match;
  let rows = table(name).filter((row) => matchWhere(row, whereSql, params));
  rows = orderRows(rows, sql);
  const limit = sql.match(/\sLIMIT\s+(\d+)/i)?.[1];
  if (limit) rows = rows.slice(0, Number(limit));

  if (/COUNT\(\*\)/i.test(columns)) return [{ count: rows.length }];
  const sum = columns.match(/SUM\(([a-zA-Z0-9_]+)\)/i)?.[1];
  if (sum) return [{ total: rows.reduce((total, row) => total + Number(row[sum] ?? 0), 0) }];
  if (columns.trim() === "*") return rows;

  return rows.map((row) => {
    const picked: Row = {};
    splitComma(columns).forEach((columnExpression) => {
      const column = columnExpression.trim().split(/\s+AS\s+/i)[0].trim();
      picked[column] = row[column];
    });
    return picked;
  });
}

function insert(sql: string, params: BindParam[]): ExecuteResult {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/^INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+([a-zA-Z0-9_]+)\s*\((.+?)\)\s+VALUES\s*\((.+?)\)/i);
  if (!match) return { changes: 0, lastInsertRowId };
  const [, name, columnsSql, valuesSql] = match;
  const columns = splitComma(columnsSql);
  const values = splitComma(valuesSql);
  const row: Row = {};
  columns.forEach((column, index) => {
    row[column] = literal(values[index] ?? "NULL", params);
  });
  if (ID_COLUMNS.has(name) && row.id == null) row.id = nextId(name);

  const uniqueColumn = UNIQUE_COLUMNS[name]?.find((column) => row[column] != null);
  const rows = table(name);
  const existingIndex = uniqueColumn
    ? rows.findIndex((item) => String(item[uniqueColumn]) === String(row[uniqueColumn]))
    : -1;

  if (/OR\s+IGNORE/i.test(normalized) && existingIndex >= 0) {
    return { changes: 0, lastInsertRowId: Number(rows[existingIndex].id ?? 0) };
  }
  if (/ON\s+CONFLICT/i.test(normalized) && existingIndex >= 0) {
    rows[existingIndex] = { ...rows[existingIndex], ...row };
    saveStore();
    return { changes: 1, lastInsertRowId: Number(rows[existingIndex].id ?? 0) };
  }
  rows.push(row);
  saveStore();
  return { changes: 1, lastInsertRowId: Number(row.id ?? lastInsertRowId) };
}

function update(sql: string, params: BindParam[]): ExecuteResult {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/^UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (!match) return { changes: 0, lastInsertRowId };
  const [, name, setSql, whereSql] = match;
  const setParts = splitComma(setSql);
  let changes = 0;
  table(name).forEach((row) => {
    const setParams = [...params];
    const whereParamCount = setParts.filter((part) => part.includes("?")).length;
    const whereParams = params.slice(whereParamCount);
    if (!matchWhere(row, whereSql, whereParams)) return;
    setParts.forEach((part) => {
      const [column, token] = part.split("=").map((item) => item.trim());
      row[column] = literal(token, setParams);
    });
    changes += 1;
  });
  if (changes) saveStore();
  return { changes, lastInsertRowId };
}

function remove(sql: string, params: BindParam[]): ExecuteResult {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
  if (!match) return { changes: 0, lastInsertRowId };
  const [, name, whereSql] = match;
  const rows = table(name);
  const before = rows.length;
  const kept = rows.filter((row) => !matchWhere(row, whereSql, [...params]));
  loadStore()[name] = kept;
  const changes = before - kept.length;
  if (changes) saveStore();
  return { changes, lastInsertRowId };
}

export const db = {
  execSync(_sql: string) {
    return undefined;
  },
};

export function query<T>(sql: string, params: BindParams = []): T[] {
  return selectRows(normalizeSql(sql), paramsArray(params)) as T[];
}

export function queryOne<T>(sql: string, params: BindParams = []): T | null {
  return query<T>(sql, params)[0] ?? null;
}

export function execute(sql: string, params: BindParams = []): ExecuteResult {
  const normalized = normalizeSql(sql);
  const bindParams = paramsArray(params);
  if (/^INSERT/i.test(normalized)) return insert(normalized, bindParams);
  if (/^UPDATE/i.test(normalized)) return update(normalized, bindParams);
  if (/^DELETE/i.test(normalized)) return remove(normalized, bindParams);
  return { changes: 0, lastInsertRowId };
}

export function transaction(work: () => void) {
  work();
}
