import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBackupArchive, writeBackupArchive } from "./backupArchive";
import type { BackupPayload } from "./backupService";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  rows: new Map<string, Record<string, unknown>[]>(),
  multiSet: vi.fn(), execute: vi.fn(), pick: vi.fn(), native: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: mocks.pick }));
vi.mock("expo-file-system", () => ({ File: mocks.native, FileMode: { ReadOnly: "r", Truncate: "w" } }));
vi.mock("expo-file-system/legacy", () => ({ documentDirectory: null, cacheDirectory: null }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: mocks.native, shareAsync: mocks.native }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => mocks.settings.get(key) ?? null,
  setItem: async (key: string, value: string) => { mocks.settings.set(key, value); },
  getAllKeys: async () => [...mocks.settings.keys()],
  multiGet: async (keys: string[]) => keys.map((key) => [key, mocks.settings.get(key) ?? null]),
  multiRemove: async (keys: string[]) => { keys.forEach((key) => mocks.settings.delete(key)); },
  multiSet: mocks.multiSet,
} }));
vi.mock("@/database/client", () => ({
  query: (sql: string) => structuredClone(mocks.rows.get(sql.replace("SELECT * FROM ", "")) ?? []),
  execute: mocks.execute,
  transaction: (operation: () => void) => {
    const previous = structuredClone(mocks.rows);
    try { operation(); } catch (error) {
      mocks.rows.clear();
      previous.forEach((rows, table) => mocks.rows.set(table, rows));
      throw error;
    }
  },
}));

const legacyKey = "nino-room-web-files-v2";
const settingsKey = "habit-diary-timer:settings";
const tables = [
  "habits", "habit_schedules", "habit_records", "journals", "tags", "journal_tags",
  "timer_presets", "timer_histories", "app_settings", "preparation_records",
  "management_cycles", "management_daily_tasks", "reward_redemptions", "point_transactions",
  "tribute_records", "tribute_income_records",
];
const localValues = new Map<string, string>();
const localSet = vi.fn((key: string, value: string) => {
  const otherSize = [...localValues].reduce((size, [storedKey, storedValue]) => size + (storedKey === key ? 0 : storedValue.length), 0);
  if (otherSize + value.length > 5 * 1024 * 1024) throw new DOMException("Local storage is full", "QuotaExceededError");
  localValues.set(key, value);
});
const urls = new Map<string, Blob>();
const downloads: Blob[] = [];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function source(bytes: Uint8Array) {
  return { size: bytes.length, read: async (offset: number, length: number) => bytes.subarray(offset, offset + length) };
}

function payload(settings = '{"language":"en"}'): BackupPayload {
  return {
    format: "nino-room-backup", version: 1, kind: "complete", createdAt: "2026-09-16T11:12:44.791Z", appVersion: "1.0.0",
    database: Object.fromEntries(tables.map((table) => [table, table === "app_settings" ? [{ key: "points", value: "57" }] : []])),
    asyncStorage: { [settingsKey]: settings }, files: [],
  };
}

async function appArchive(media: Uint8Array, name = "移行する動画.bin", mimeType = "video/mp4") {
  const manifest = { ...payload(), version: 2, files: [{ name, mimeType, purpose: "training", size: media.length, path: "files/000000" }] };
  const parts: BlobPart[] = [];
  await writeBackupArchive([
    { name: "manifest.json", ...source(encoder.encode(JSON.stringify(manifest))) },
    { name: "files/000000", ...source(media) },
  ], { write: async (bytes) => { parts.push(new Uint8Array(bytes)); } });
  return new File(parts, "app-complete-backup.zip", { type: "application/zip" });
}

function select(file: File) {
  mocks.pick.mockResolvedValue({ canceled: false, assets: [{ name: file.name, size: file.size, uri: "blob:selected-backup", file }] });
}

async function services() {
  // Vitest does not load the Expo TypeScript path aliases; resolve this alias to the real module.
  vi.doMock("@/services/fileStorageService", () => import("./fileStorageService"));
  const [{ backupService }, { fileStorageService }] = await Promise.all([
    import("./backupService"), import("./fileStorageService"),
  ]);
  return { backupService, fileStorageService };
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.settings.clear(); mocks.rows.clear(); localValues.clear(); urls.clear(); downloads.length = 0;
  mocks.settings.set(settingsKey, '{"language":"ja"}');
  mocks.rows.set("app_settings", [{ key: "points", value: "12" }]);
  mocks.multiSet.mockImplementation(async (entries: [string, string][]) => {
    entries.forEach(([key, value]) => mocks.settings.set(key, value));
  });
  mocks.execute.mockImplementation((sql: string, values: unknown[] = []) => {
    if (sql.startsWith("DELETE FROM ")) {
      mocks.rows.set(sql.replace("DELETE FROM ", ""), []);
      return;
    }
    const match = /^INSERT INTO (\w+) \(([^)]+)\) VALUES/.exec(sql);
    if (!match) throw new Error(`Unexpected test SQL: ${sql}`);
    const rows = mocks.rows.get(match[1]) ?? [];
    rows.push(Object.fromEntries(match[2].split(", ").map((column, index) => [column, values[index]])));
    mocks.rows.set(match[1], rows);
  });
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localValues.get(key) ?? null,
    setItem: localSet,
    removeItem: (key: string) => { localValues.delete(key); },
  });
  vi.stubGlobal("window", { setTimeout: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", {
    body: { appendChild: vi.fn() },
    createElement: (tag: string) => {
      if (tag !== "a") throw new Error(`Unexpected DOM element: ${tag}`);
      return {
        href: "", download: "", remove: vi.fn(),
        click() {
          const downloaded = urls.get(this.href);
          if (!downloaded) throw new Error("Download did not reference a Blob");
          downloads.push(downloaded);
        },
      };
    },
  });
  const create = URL.createObjectURL.bind(URL);
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (!(blob instanceof Blob)) throw new Error("Only Blob media are expected");
    const url = create(blob);
    urls.set(url, blob);
    return url;
  });
});

afterEach(() => {
  for (const url of urls.keys()) URL.revokeObjectURL(url);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("APP backups restored into Web IndexedDB", () => {
  it("restores media exceeding localStorage capacity, persists across reload and exports the original bytes and MIME", async () => {
    const media = Uint8Array.from({ length: 6 * 1024 * 1024 + 37 }, (_, index) => (index * 31 + 7) % 251);
    select(await appArchive(media));
    const { backupService, fileStorageService } = await services();
    const picked = await backupService.pick();
    expect(picked?.kind).toBe("complete");
    expect(picked?.files?.[0]).toMatchObject({ name: "移行する動画.bin", size: media.length, mimeType: "video/mp4" });
    await expect(backupService.restore(picked!)).resolves.toBe("complete");
    expect(mocks.settings.get(settingsKey)).toBe('{"language":"en"}');
    expect(mocks.rows.get("app_settings")).toEqual([{ key: "points", value: "57" }]);
    const files = await fileStorageService.list();
    expect(files).toHaveLength(1);
    expect(files[0].uri).toMatch(/^blob:/);
    expect(files[0].size).toBe(media.length);
    const response = await fetch(files[0].uri);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(Buffer.compare(Buffer.from(await response.arrayBuffer()), media)).toBe(0);
    expect(localSet.mock.calls.some(([key]) => key === legacyKey)).toBe(false);
    expect(localValues.has(legacyKey)).toBe(false);

    // Discard the first module's object URL and in-memory state, retaining only durable browser storage.
    URL.revokeObjectURL(files[0].uri);
    vi.resetModules();
    const reloaded = await services();
    const persisted = await reloaded.fileStorageService.list();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].uri).not.toBe(files[0].uri);
    expect(Buffer.compare(Buffer.from(await (await fetch(persisted[0].uri)).arrayBuffer()), media)).toBe(0);

    await reloaded.backupService.export("complete");
    expect(downloads).toHaveLength(1);
    const entries = await readBackupArchive(source(new Uint8Array(await downloads[0].arrayBuffer())));
    await Promise.all(entries.map((entry) => entry.verify()));
    const manifest = JSON.parse(decoder.decode(await entries[0].read(0, entries[0].size)));
    expect(manifest.files).toEqual([{ name: "移行する動画.bin", mimeType: "video/mp4", size: media.length, purpose: "training", path: "files/000000" }]);
    const exportedMedia = new Uint8Array(media.length);
    for (let offset = 0; offset < media.length; offset += 256 * 1024) {
      exportedMedia.set(await entries[1].read(offset, Math.min(256 * 1024, media.length - offset)), offset);
    }
    expect(Buffer.compare(exportedMedia, media)).toBe(0);
    expect(mocks.native).not.toHaveBeenCalled();
    expect(localSet.mock.calls.some(([key]) => key === legacyKey)).toBe(false);
  }, 20_000);

  it.each(["settings", "database"] as const)("preserves prior media and settings if %s fail after media activation", async (failure) => {
    const { backupService, fileStorageService } = await services();
    await fileStorageService.restoreFromBackup([{ name: "previous.png", size: 4, purpose: "punishment", mimeType: "image/png", data: "AQIDBA==" }]);
    const previousSettings = [...mocks.settings];
    const previousRows = structuredClone(mocks.rows.get("app_settings"));
    select(await appArchive(new Uint8Array([9, 8, 7])));
    const picked = await backupService.pick();
    if (failure === "settings") {
      mocks.multiSet.mockImplementationOnce(async () => {
        mocks.settings.set(settingsKey, "partial write");
        throw new Error("settings write failed");
      });
    } else {
      mocks.execute.mockImplementationOnce(() => { throw new Error("database write failed"); });
    }
    await expect(backupService.restore(picked!)).rejects.toThrow(`${failure} write failed`);
    expect([...mocks.settings]).toEqual(previousSettings);
    expect(mocks.rows.get("app_settings")).toEqual(previousRows);
    const restored = await fileStorageService.list();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ name: "previous.png", purpose: "punishment", size: 4 });
    expect(new Uint8Array(await (await fetch(restored[0].uri)).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(localSet.mock.calls.some(([key]) => key === legacyKey)).toBe(false);
    vi.resetModules();
    expect((await (await services()).fileStorageService.list()).map((file) => file.name)).toEqual(["previous.png"]);
  });
});
