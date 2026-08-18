type BindParam = string | number | null | boolean | Uint8Array;
type BindParams = BindParam[] | Record<string, BindParam>;

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;
type ExecuteResult = {
  changes: number;
  lastInsertRowId: number;
};

const STORAGE_KEY = "nino-room-web-db-v1";
const STORAGE_PREFIX = "nino-room-web-db-v2:";
const TABLE_INDEX_KEY = `${STORAGE_PREFIX}tables`;
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
  "tribute_records",
  "tribute_income_records",
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
    const names = JSON.parse(storage().getItem(TABLE_INDEX_KEY) ?? "[]") as string[];
    if (names.length) {
      cache = Object.fromEntries(names.map((name) => [
        name,
        JSON.parse(storage().getItem(`${STORAGE_PREFIX}${name}`) ?? "[]") as Row[],
      ]));
    } else {
      cache = JSON.parse(storage().getItem(STORAGE_KEY) ?? "{}") as Store;
      if (Object.keys(cache).length) saveStore();
    }
  } catch {
    cache = {};
  }
  return cache;
}

function saveStore() {
  try {
    const store = loadStore();
    const names = Object.keys(store);
    for (const name of names) {
      storage().setItem(`${STORAGE_PREFIX}${name}`, JSON.stringify(store[name]));
    }
    storage().setItem(TABLE_INDEX_KEY, JSON.stringify(names));
    storage().removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("WEB DB save failed", error);
    throw error;
  }
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

function isKeywordAt(value: string, index: number, keyword: string) {
  return value.slice(index, index + keyword.length).toUpperCase() === keyword;
}

function splitWhereAnd(value: string) {
  const result: string[] = [];
  let current = "";
  let quote: string | null = null;
  let depth = 0;
  let betweenPending = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === "'" || char === "\"") && !quote) quote = char;
    else if (char === quote) quote = null;
    else if (!quote && char === "(") depth += 1;
    else if (!quote && char === ")") depth -= 1;

    if (!quote && depth === 0 && isKeywordAt(value, index, " BETWEEN ")) {
      betweenPending = true;
    }

    if (!quote && depth === 0 && isKeywordAt(value, index, " AND ")) {
      if (betweenPending) {
        current += " AND ";
        index += 4;
        betweenPending = false;
        continue;
      }
      if (current.trim()) result.push(current.trim());
      current = "";
      index += 4;
      continue;
    }
    current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function like(value: unknown, pattern: string) {
  const text = String(value ?? "");
  const regex = new RegExp(`^${pattern.split("%").map(escapeRegExp).join(".*")}$`);
  return regex.test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valueOfColumn(row: Row, columnExpression: string) {
  const coalesce = columnExpression.match(/^COALESCE\(\s*([a-zA-Z0-9_]+)\s*,\s*['"][^'"]*['"]\s*\)$/i);
  if (coalesce) return row[coalesce[1]] ?? "";
  const substring = columnExpression.match(/^substr\(\s*([a-zA-Z0-9_]+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (substring) {
    const [, column, start, length] = substring;
    return String(row[column] ?? "").slice(Number(start) - 1, Number(start) - 1 + Number(length));
  }
  return row[columnExpression];
}

function compareValue(row: Row, column: string, operator: string, expected: unknown) {
  const actual = valueOfColumn(row, column);
  if (operator === "=") return String(actual ?? "") === String(expected ?? "");
  if (operator === ">") return String(actual ?? "") > String(expected ?? "");
  if (operator === "<") return String(actual ?? "") < String(expected ?? "");
  if (operator === ">=") return String(actual ?? "") >= String(expected ?? "");
  if (operator === "<=") return String(actual ?? "") <= String(expected ?? "");
  if (operator === "!=" || operator === "<>") return String(actual ?? "") !== String(expected ?? "");
  if (operator.toUpperCase() === "LIKE") return like(actual, String(expected ?? ""));
  if (operator.toUpperCase() === "NOT LIKE") return !like(actual, String(expected ?? ""));
  return true;
}

function matchWherePart(row: Row, part: string, params: BindParam[]) {
  const isNotNull = part.match(/^([a-zA-Z0-9_]+)\s+IS\s+NOT\s+NULL$/i);
  if (isNotNull) return row[isNotNull[1]] != null;

  const notInSelect = part.match(
    /^([a-zA-Z0-9_]+)\s+NOT\s+IN\s+\(SELECT(?:\s+DISTINCT)?\s+([a-zA-Z0-9_]+)\s+FROM\s+([a-zA-Z0-9_]+)\)$/i,
  );
  if (notInSelect) {
    const [, column, selectColumn, selectTable] = notInSelect;
    const selectedValues = new Set(table(selectTable).map((item) => String(item[selectColumn] ?? "")));
    return !selectedValues.has(String(row[column] ?? ""));
  }

  const between = part.match(/^(.+?)\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i);
  if (between) {
    const [, column, fromToken, toToken] = between;
    const actual = String(valueOfColumn(row, column.trim()) ?? "");
    const from = String(literal(fromToken, params) ?? "");
    const to = String(literal(toToken, params) ?? "");
    return actual >= from && actual <= to;
  }

  const match = part.match(/^(.+?)\s*(=|>=|<=|!=|<>|>|<|LIKE|NOT\s+LIKE)\s*(.+)$/i);
  if (!match) {
    throw new Error(`WEB DBがWHERE条件に対応していません: ${part}`);
  }
  const [, column, operator, token] = match;
  return compareValue(row, column.trim(), operator.replace(/\s+/g, " "), literal(token, params));
}

function matchWhere(row: Row, whereSql: string | undefined, params: BindParam[]) {
  if (!whereSql) return true;
  const normalizedWhere = whereSql
    .replace(/\s+LIMIT\s+\d+.*$/i, "")
    .replace(/\s+ORDER\s+BY\s+.+$/i, "")
    .replace(/\s+GROUP\s+BY\s+.+$/i, "");
  const parts = splitWhereAnd(normalizedWhere)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const orParts = part.split(/\s+OR\s+/i).map((item) => item.trim()).filter(Boolean);
    let matched = false;
    for (const orPart of orParts) {
      if (matchWherePart(row, orPart, params)) matched = true;
    }
    if (!matched) return false;
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
  const match = sql.match(
    /^SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+.+?)?(?:\s+ORDER\s+BY\s+.+?)?(?:\s+LIMIT\s+\d+)?$/i,
  );
  if (!match) return [];
  const [, columns, name, whereSql] = match;
  let rows = table(name).filter((row) => matchWhere(row, whereSql, [...params]));
  rows = orderRows(rows, sql);
  const limit = sql.match(/\sLIMIT\s+(\d+)/i)?.[1];
  if (limit) rows = rows.slice(0, Number(limit));

  const countDistinct = columns.match(/COUNT\(DISTINCT\s+([a-zA-Z0-9_]+)\)/i)?.[1];
  if (countDistinct) {
    return [{ count: new Set(rows.map((row) => String(row[countDistinct] ?? ""))).size }];
  }
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
  if (/^INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+point_transactions/i.test(normalized) && /\sSELECT\s+/i.test(normalized)) {
    return { changes: 0, lastInsertRowId };
  }
  const match = normalized.match(/^INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+([a-zA-Z0-9_]+)\s*\((.+?)\)\s+VALUES\s*\((.+?)\)/i);
  if (!match) throw new Error(`WEB DBがINSERT文に対応していません: ${normalized}`);
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
  if (!match) throw new Error(`WEB DBがUPDATE文に対応していません: ${normalized}`);
  const [, name, setSql, whereSql] = match;
  const setParts = splitComma(setSql);
  const setParamCount = setParts.reduce((count, part) => count + (part.includes("?") ? 1 : 0), 0);
  let changes = 0;
  table(name).forEach((row) => {
    const setParams = params.slice(0, setParamCount);
    const whereParams = params.slice(setParamCount);
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
  if (!match) throw new Error(`WEB DBがDELETE文に対応していません: ${normalized}`);
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
