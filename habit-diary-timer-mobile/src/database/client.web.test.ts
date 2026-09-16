import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prefix = "nino-room-web-db-v2:";
const indexKey = `${prefix}tables`;
const legacyKey = "nino-room-web-db-v1";
const originalRows = [{ id: 7, name: "Original", value: "old" }];

async function createClient(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {
    [indexKey]: JSON.stringify(["habits"]),
    [`${prefix}habits`]: JSON.stringify(originalRows),
    "nino-room-web-files-v2": "existing media",
    "unrelated-preference": "keep me",
  }));
  let quota = Infinity;
  const local = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      const bytes = [...values.entries()].reduce((sum, [existing, content]) => sum + (existing === key ? 0 : content.length), 0);
      if (bytes + value.length > quota) throw new Error("QuotaExceededError");
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
  vi.stubGlobal("localStorage", local);
  const client = await import("./client.web");
  return { client, local, values, setQuota: (limit: number) => { quota = limit; } };
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web database transactions", () => {
  it("restores in-memory rows and keeps persisted data unchanged when SQL fails halfway through", async () => {
    const { client, values, local } = await createClient();
    const before = new Map(values);
    expect(() => client.transaction(() => {
      client.execute("UPDATE habits SET value = ? WHERE id = ?", ["changed", 7]);
      client.execute("INSERT INTO tags (name) VALUES (?)", ["temporary"]);
      client.execute("INSERT invalid");
    })).toThrow("WEB DBがINSERT文に対応していません");

    expect(client.query("SELECT * FROM habits")).toEqual(originalRows);
    expect(client.query("SELECT * FROM tags")).toEqual([]);
    expect(values).toEqual(before);
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it("defers multiple updates until commit and persists each table only once", async () => {
    const { client, values, local } = await createClient();
    client.transaction(() => {
      client.execute("UPDATE habits SET value = ? WHERE id = ?", ["first", 7]);
      client.execute("UPDATE habits SET value = ? WHERE id = ?", ["second", 7]);
      client.execute("INSERT INTO tags (name) VALUES (?)", ["saved"]);
      expect(local.setItem).not.toHaveBeenCalled();
      expect(JSON.parse(values.get(`${prefix}habits`)!)).toEqual(originalRows);
      expect(client.queryOne("SELECT * FROM habits")).toEqual({ ...originalRows[0], value: "second" });
    });

    expect(local.setItem.mock.calls.map(([key]) => key)).toEqual([`${prefix}habits`, `${prefix}tags`, indexKey]);
    expect(JSON.parse(values.get(`${prefix}habits`)!)).toEqual([{ ...originalRows[0], value: "second" }]);
    expect(values.get("unrelated-preference")).toBe("keep me");
    expect(values.get("nino-room-web-files-v2")).toBe("existing media");
  });

  it("restores changed values and removes new table keys after a one-shot commit quota error", async () => {
    const { client, values, local } = await createClient();
    const before = new Map(values);
    const write = local.setItem.getMockImplementation()!;
    let rejected = false;
    local.setItem.mockImplementation((key, value) => {
      if (key === indexKey && !rejected) {
        rejected = true;
        throw new Error("QuotaExceededError");
      }
      write(key, value);
    });

    expect(() => client.transaction(() => {
      client.execute("UPDATE habits SET value = ? WHERE id = ?", ["changed", 7]);
      client.execute("INSERT INTO tags (name) VALUES (?)", ["temporary"]);
    })).toThrow("QuotaExceededError");

    expect(values).toEqual(before);
    expect(values.has(`${prefix}tags`)).toBe(false);
    expect(client.query("SELECT * FROM habits")).toEqual(originalRows);
    expect(client.query("SELECT * FROM tags")).toEqual([]);
    expect(local.removeItem).toHaveBeenCalledWith(`${prefix}tags`);
  });

  it("frees partially written table values before rollback so the original database fits its quota", async () => {
    const { client, values, setQuota } = await createClient();
    const before = new Map(values);
    const currentBytes = [...values.values()].reduce((sum, value) => sum + value.length, 0);
    setQuota(currentBytes + 25);
    expect(() => client.transaction(() => {
      client.execute("UPDATE habits SET value = ? WHERE id = ?", ["a".repeat(20), 7]);
      client.execute("INSERT INTO tags (name) VALUES (?)", ["new table exceeds available quota"]);
    })).toThrow("QuotaExceededError");

    expect(values).toEqual(before);
    expect(client.query("SELECT * FROM habits")).toEqual(originalRows);
  });

  it("rolls nested writes back with an outer work failure and leaves unrelated storage alone", async () => {
    const { client, values, local } = await createClient();
    const before = new Map(values);
    expect(() => client.transaction(() => {
      client.execute("UPDATE habits SET name = ? WHERE id = ?", ["changed", 7]);
      client.transaction(() => {
        client.execute("INSERT INTO tags (name) VALUES (?)", ["nested"]);
      });
      throw new Error("Later failure");
    })).toThrow("Later failure");

    expect(values).toEqual(before);
    expect(client.query("SELECT * FROM habits")).toEqual(originalRows);
    expect(client.query("SELECT * FROM tags")).toEqual([]);
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it("aborts the outer transaction even if its callback catches a nested failure", async () => {
    const { client, values } = await createClient();
    const before = new Map(values);
    expect(() => client.transaction(() => {
      try {
        client.transaction(() => {
          client.execute("DELETE FROM habits");
          throw new Error("Nested failure");
        });
      } catch { /* A caught nested error must not allow partial data to commit. */ }
      client.execute("INSERT INTO tags (name) VALUES (?)", ["later"]);
    })).toThrow("Nested failure");

    expect(values).toEqual(before);
    expect(client.query("SELECT * FROM habits")).toEqual(originalRows);
  });

  it("restores the previous last inserted ID when a transaction fails", async () => {
    const { client } = await createClient();
    const inserted = client.execute("INSERT INTO habits (name) VALUES (?)", ["kept"]);
    expect(inserted.lastInsertRowId).toBe(8);
    expect(() => client.transaction(() => {
      expect(client.execute("INSERT INTO habits (name) VALUES (?)", ["discarded"]).lastInsertRowId).toBe(9);
      throw new Error("Abort");
    })).toThrow("Abort");

    expect(client.execute("UPDATE habits SET name = ? WHERE id = ?", ["still kept", 8]).lastInsertRowId).toBe(8);
    expect(client.execute("INSERT INTO habits (name) VALUES (?)", ["next"]).lastInsertRowId).toBe(9);
  });

  it("keeps legacy database storage unchanged if the transaction that first loads it fails", async () => {
    const { client, values, local } = await createClient({
      [legacyKey]: JSON.stringify({ habits: originalRows }),
      "unrelated-preference": "keep me",
    });
    const before = new Map(values);
    expect(() => client.transaction(() => {
      client.execute("UPDATE habits SET value = ? WHERE id = ?", ["changed", 7]);
      throw new Error("Abort migration");
    })).toThrow("Abort migration");

    expect(values).toEqual(before);
    expect(client.query("SELECT * FROM habits")).toEqual(originalRows);
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it("reports rollback failure instead of claiming a failed commit succeeded", async () => {
    const { client, local } = await createClient();
    const write = local.setItem.getMockImplementation()!;
    let writes = 0;
    local.setItem.mockImplementation((key, value) => {
      if (++writes > 1) throw new Error("Storage unavailable");
      write(key, value);
    });
    expect(() => client.transaction(() => {
      client.execute("UPDATE habits SET value = ? WHERE id = ?", ["changed", 7]);
    })).toThrow("WEB DB rollback failed");
    expect(client.query("SELECT * FROM habits")).toEqual(originalRows);
  });
});
