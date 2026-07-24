type BindParam = string | number | null | boolean | Uint8Array;
type BindParams = BindParam[] | Record<string, BindParam>;

type ExecuteResult = {
  changes: number;
  lastInsertRowId: number;
};

let nextInsertId = 1;

function countRow(sql: string) {
  const lower = sql.toLowerCase();
  if (lower.includes(" as total")) return { total: 0 };
  if (lower.includes(" as count")) return { count: 0 };
  if (lower.includes("count(*)")) return { count: 0 };
  return null;
}

export const db = {
  execSync(_sql: string) {
    return undefined;
  },
};

export function query<T>(sql: string, _params: BindParams = []): T[] {
  const row = countRow(sql);
  return row ? [row as T] : [];
}

export function queryOne<T>(sql: string, _params: BindParams = []): T | null {
  const row = countRow(sql);
  return row ? (row as T) : null;
}

export function execute(_sql: string, _params: BindParams = []): ExecuteResult {
  return {
    changes: 1,
    lastInsertRowId: nextInsertId++,
  };
}

export function transaction(work: () => void) {
  work();
}
