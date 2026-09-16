import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange, IDBObjectStore } from "fake-indexeddb";
import type { RestoreStoredFile, StoredFile } from "./fileStorageService";

let fileStorageService: typeof import("./fileStorageService").fileStorageService;

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" },
  pick: vi.fn(),
  info: vi.fn(),
  mkdir: vi.fn(),
  copy: vi.fn<({ from, to }: { from: string; to: string }) => Promise<void>>(),
  move: vi.fn<({ from, to }: { from: string; to: string }) => Promise<void>>(),
  write: vi.fn(),
  list: vi.fn(),
  remove: vi.fn<(uri: string, options: { idempotent: boolean }) => Promise<void>>(),
}));

vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: mocks.pick }));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  getInfoAsync: mocks.info,
  makeDirectoryAsync: mocks.mkdir,
  copyAsync: mocks.copy,
  moveAsync: mocks.move,
  writeAsStringAsync: mocks.write,
  readDirectoryAsync: mocks.list,
  EncodingType: { Base64: "base64" },
  deleteAsync: mocks.remove,
}));

const webStorageKey = "nino-room-web-files-v2";
const nativeDirectory = "file:///documents/private-room-files/";
let nativeFiles: Map<string, string>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  ({ fileStorageService } = await import("./fileStorageService"));
  mocks.platform.OS = "android";
  mocks.info.mockResolvedValue({ exists: true, isDirectory: true });
  mocks.mkdir.mockResolvedValue(undefined);
  nativeFiles = new Map();
  mocks.copy.mockImplementation(async ({ from, to }) => {
    nativeFiles.set(to, from);
  });
  mocks.remove.mockImplementation(async (uri) => {
    nativeFiles.delete(uri);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("native file imports", () => {
  it("deletes only requested files, preserving failures and continuing with later targets", async () => {
    const first: StoredFile = { name: "first.mp4", uri: `${nativeDirectory}training/first.mp4`, size: 3, purpose: "training" };
    const blocked: StoredFile = { name: "blocked.mp4", uri: `${nativeDirectory}training/blocked.mp4`, size: 3, purpose: "training" };
    const last: StoredFile = { name: "last.mp4", uri: `${nativeDirectory}training/last.mp4`, size: 3, purpose: "training" };
    const untouched = `${nativeDirectory}training/untouched.mp4`;
    for (const entry of [first, blocked, last]) nativeFiles.set(entry.uri, entry.name);
    nativeFiles.set(untouched, "untouched");
    mocks.remove.mockImplementation(async (uri) => {
      if (uri === blocked.uri) throw new Error("File access denied");
      nativeFiles.delete(uri);
    });

    await expect(fileStorageService.removeMany([first, blocked, last, first]))
      .resolves.toEqual({ removed: [first, last], failed: [blocked] });

    expect([...nativeFiles.keys()]).toEqual([blocked.uri, untouched]);
    expect(mocks.remove).toHaveBeenCalledTimes(3);
  });

  it("retains shared deletion progress and failures across subscriptions while rejecting competing operations", async () => {
    const first: StoredFile = { name: "first.mp4", uri: `${nativeDirectory}training/first.mp4`, size: 3, purpose: "training" };
    const blocked: StoredFile = { name: "blocked.mp4", uri: `${nativeDirectory}training/blocked.mp4`, size: 3, purpose: "training" };
    const last: StoredFile = { name: "last.mp4", uri: `${nativeDirectory}training/last.mp4`, size: 3, purpose: "training" };
    for (const entry of [first, blocked, last]) nativeFiles.set(entry.uri, entry.name);
    const secondStarted = deferred<void>();
    const finishSecond = deferred<void>();
    mocks.remove.mockImplementation(async (uri) => {
      if (uri === blocked.uri) {
        secondStarted.resolve(undefined);
        await finishSecond.promise;
        throw new Error("File access denied");
      }
      nativeFiles.delete(uri);
    });
    const originalScreen = vi.fn();
    const leave = fileStorageService.subscribeDeletes(originalScreen);
    const deletion = fileStorageService.removeMany([first, blocked, last]);
    leave();
    const notificationsBeforeLeaving = originalScreen.mock.calls.length;
    await secondStarted.promise;
    const returnedScreen = vi.fn();
    const leaveReturnedScreen = fileStorageService.subscribeDeletes(returnedScreen);
    try {
      expect(fileStorageService.getDeleteState()).toEqual({
        deleting: true, progress: { completed: 1, total: 3 }, result: null,
      });
      await expect(fileStorageService.removeMany([last])).resolves.toBeNull();
      await expect(fileStorageService.pickAndStore()).resolves.toBeNull();
      const maintenance = vi.fn(async () => "restored");
      await expect(fileStorageService.withExclusiveFiles(maintenance)).rejects.toThrow("ファイルを処理中です。");
      expect(maintenance).not.toHaveBeenCalled();
      expect(mocks.pick).not.toHaveBeenCalled();

      finishSecond.resolve(undefined);
      await expect(deletion).resolves.toEqual({ removed: [first, last], failed: [blocked] });
      expect(fileStorageService.getDeleteState()).toEqual({
        deleting: false, progress: null, result: { removed: [first, last], failed: [blocked] },
      });
      expect(returnedScreen).toHaveBeenCalled();
      expect(originalScreen).toHaveBeenCalledTimes(notificationsBeforeLeaving);
      expect([...nativeFiles.keys()]).toEqual([blocked.uri]);
    } finally {
      finishSecond.resolve(undefined);
      leaveReturnedScreen();
    }
    expect(fileStorageService.getDeleteState().result).toEqual({ removed: [first, last], failed: [blocked] });
  });

  it("refuses deletion and maintenance while a picker is pending, then releases the lock on cancellation", async () => {
    const picker = deferred<{ canceled: true; assets: null }>();
    mocks.pick.mockReturnValue(picker.promise);
    const imported = fileStorageService.pickAndStore();
    const target: StoredFile = { name: "first.mp4", uri: `${nativeDirectory}training/first.mp4`, size: 3, purpose: "training" };
    nativeFiles.set(target.uri, "original");
    try {
      await expect(fileStorageService.removeMany([target])).resolves.toBeNull();
      await expect(fileStorageService.withExclusiveFiles(async () => "restored")).rejects.toThrow("ファイルを処理中です。");
      expect(nativeFiles.get(target.uri)).toBe("original");
      expect(mocks.remove).not.toHaveBeenCalled();
    } finally {
      picker.resolve({ canceled: true, assets: null });
      await imported;
    }
    await expect(fileStorageService.withExclusiveFiles(async () => "ready")).resolves.toBe("ready");
    await expect(fileStorageService.removeMany([target])).resolves.toEqual({ removed: [target], failed: [] });
  });

  it("stores every selected file in the requested room and reports progress", async () => {
    const assets = [
      { name: "first.mp4", uri: "file:///cache/first.mp4" },
      { name: "second.png", uri: "file:///cache/second.png" },
      { name: "third.m4a", uri: "file:///cache/third.m4a" },
    ];
    mocks.pick.mockResolvedValue({ canceled: false, assets });
    const onProgress = vi.fn();

    await expect(fileStorageService.pickAndStore("punishment", onProgress))
      .resolves.toEqual({ stored: 3, failed: [] });

    expect(mocks.pick).toHaveBeenCalledWith({ copyToCacheDirectory: true, multiple: true });
    expect([...nativeFiles.values()]).toEqual(assets.map((asset) => asset.uri));
    expect([...nativeFiles.keys()].every((uri) => uri.startsWith(`${nativeDirectory}punishment/`))).toBe(true);
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { completed: 0, total: 3 },
      { completed: 1, total: 3 },
      { completed: 2, total: 3 },
      { completed: 3, total: 3 },
    ]);
  });

  it("returns null without changing files when the picker is canceled", async () => {
    mocks.pick.mockResolvedValue({ canceled: true, assets: null });
    const onProgress = vi.fn();

    await expect(fileStorageService.pickAndStore("training", onProgress)).resolves.toBeNull();

    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("keeps identically named files distinct even when imported in the same millisecond", async () => {
    vi.spyOn(Date, "now").mockReturnValue(123456789);
    mocks.pick.mockResolvedValue({
      canceled: false,
      assets: [
        { name: "same.mp4", uri: "file:///cache/a.mp4" },
        { name: "same.mp4", uri: "file:///cache/b.mp4" },
      ],
    });

    await expect(fileStorageService.pickAndStore()).resolves.toEqual({ stored: 2, failed: [] });

    expect(nativeFiles.size).toBe(2);
    expect([...nativeFiles.values()]).toEqual(["file:///cache/a.mp4", "file:///cache/b.mp4"]);
  });

  it("cleans up a failed partial copy while retaining successes and continuing the batch", async () => {
    const previousFile = `${nativeDirectory}training/existing.mp4`;
    nativeFiles.set(previousFile, "existing data");
    mocks.pick.mockResolvedValue({
      canceled: false,
      assets: [
        { name: "first.mp4", uri: "file:///cache/first.mp4" },
        { name: "broken.mp4", uri: "file:///cache/broken.mp4" },
        { name: "last.mp4", uri: "file:///cache/last.mp4" },
      ],
    });
    let partialFile = "";
    mocks.copy.mockImplementation(async ({ from, to }) => {
      nativeFiles.set(to, from);
      if (from.endsWith("broken.mp4")) {
        partialFile = to;
        throw new Error("Copy interrupted");
      }
    });
    const onProgress = vi.fn();

    await expect(fileStorageService.pickAndStore("training", onProgress))
      .resolves.toEqual({ stored: 2, failed: ["broken.mp4"] });

    expect([...nativeFiles.values()]).toEqual([
      "existing data", "file:///cache/first.mp4", "file:///cache/last.mp4",
    ]);
    expect(nativeFiles.has(partialFile)).toBe(false);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(partialFile, { idempotent: true });
    expect(onProgress).toHaveBeenLastCalledWith({ completed: 3, total: 3 });
  });

  it("preserves import progress and partial results when a screen unsubscribes and returns", async () => {
    const picker = deferred<{ canceled: false; assets: { name: string; uri: string }[] }>();
    const secondCopyStarted = deferred<void>();
    const finishSecondCopy = deferred<void>();
    mocks.pick.mockReturnValue(picker.promise);
    mocks.copy.mockImplementation(async ({ from, to }) => {
      nativeFiles.set(to, from);
      if (from.endsWith("broken.mp4")) {
        secondCopyStarted.resolve(undefined);
        await finishSecondCopy.promise;
        throw new Error("Copy interrupted");
      }
    });
    const originalScreen = vi.fn();
    const leaveScreen = fileStorageService.subscribeImports(originalScreen);
    const result = fileStorageService.pickAndStore();
    expect(fileStorageService.getImportState()).toEqual({ importing: true, progress: null, result: null });
    leaveScreen();
    const notificationsBeforeLeaving = originalScreen.mock.calls.length;

    picker.resolve({
      canceled: false,
      assets: [
        { name: "first.mp4", uri: "file:///cache/first.mp4" },
        { name: "broken.mp4", uri: "file:///cache/broken.mp4" },
        { name: "last.mp4", uri: "file:///cache/last.mp4" },
      ],
    });
    await secondCopyStarted.promise;
    const returnedScreen = vi.fn();
    const leaveReturnedScreen = fileStorageService.subscribeImports(returnedScreen);
    try {
      expect(fileStorageService.getImportState()).toEqual({
        importing: true, progress: { completed: 1, total: 3 }, result: null,
      });

      finishSecondCopy.resolve(undefined);
      await expect(result).resolves.toEqual({ stored: 2, failed: ["broken.mp4"] });

      expect(fileStorageService.getImportState()).toEqual({
        importing: false, progress: null, result: { stored: 2, failed: ["broken.mp4"] },
      });
      expect(returnedScreen).toHaveBeenCalled();
      expect(originalScreen).toHaveBeenCalledTimes(notificationsBeforeLeaving);
    } finally {
      finishSecondCopy.resolve(undefined);
      leaveReturnedScreen();
    }
    // The result is kept by the service even after the last screen leaves.
    expect(fileStorageService.getImportState().result).toEqual({ stored: 2, failed: ["broken.mp4"] });
  });

  it("opens only one picker at a time and allows a new import after cancellation", async () => {
    const firstPicker = deferred<{ canceled: true; assets: null }>();
    const nextPicker = deferred<{ canceled: true; assets: null }>();
    mocks.pick.mockReturnValueOnce(firstPicker.promise).mockReturnValueOnce(nextPicker.promise);
    const firstImport = fileStorageService.pickAndStore("training");

    await expect(fileStorageService.pickAndStore("punishment")).resolves.toBeNull();
    expect(mocks.pick).toHaveBeenCalledOnce();
    expect(fileStorageService.getImportState().importing).toBe(true);

    firstPicker.resolve({ canceled: true, assets: null });
    await expect(firstImport).resolves.toBeNull();
    expect(fileStorageService.getImportState()).toEqual({ importing: false, progress: null, result: null });

    const nextImport = fileStorageService.pickAndStore("punishment");
    expect(mocks.pick).toHaveBeenCalledTimes(2);
    expect(fileStorageService.getImportState().importing).toBe(true);
    nextPicker.resolve({ canceled: true, assets: null });
    await expect(nextImport).resolves.toBeNull();
    expect(fileStorageService.getImportState().importing).toBe(false);
    expect(mocks.copy).not.toHaveBeenCalled();
  });
});

function createWebPicker() {
  mocks.platform.OS = "web";
  const listeners = new Map<string, () => unknown>();
  const input = {
    type: "",
    accept: "",
    multiple: false,
    style: { display: "" },
    files: [] as File[],
    click: vi.fn(),
    remove: vi.fn(),
    addEventListener: vi.fn((event: string, listener: () => unknown) => {
      listeners.set(event, listener);
    }),
  };
  const storage = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => {
    storage.set(key, value);
  });
  vi.stubGlobal("document", {
    createElement: vi.fn(() => input),
    body: { appendChild: vi.fn() },
  });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem,
    removeItem: vi.fn((key: string) => { storage.delete(key); }),
  });
  return {
    input,
    storage,
    setItem,
    async emit(event: string) {
      const listener = listeners.get(event);
      if (!listener) throw new Error(`No ${event} listener was registered`);
      await listener();
    },
  };
}

describe("web file imports", () => {
  it("allows internal restore and listing under maintenance while rejecting competing work and releasing on failure", async () => {
    const web = createWebPicker();
    const initialRevision = fileStorageService.getMaintenanceState().revision;
    const maintenanceChanged = vi.fn();
    const unsubscribe = fileStorageService.subscribeMaintenance(maintenanceChanged);
    const restored = { name: "restored.mp4", size: 3, purpose: "training" as const, mimeType: "video/mp4", data: "b25l" };
    const restoredReady = deferred<void>();
    const finishMaintenance = deferred<void>();
    const maintenance = fileStorageService.withExclusiveFiles(async () => {
      await fileStorageService.restoreFromBackup([restored]);
      restoredReady.resolve(undefined);
      await finishMaintenance.promise;
      return fileStorageService.list();
    });
    await restoredReady.promise;
    const [restoredFile] = await fileStorageService.list();
    expect(await (await fileStorageService.getBlob(restoredFile))?.text()).toBe("one");
    try {
      expect(fileStorageService.getMaintenanceState()).toEqual({ active: true, revision: initialRevision });
      await expect(fileStorageService.pickAndStore()).rejects.toThrow("ファイルを処理中です。");
      await expect(fileStorageService.removeMany([restoredFile])).rejects.toThrow("ファイルを処理中です。");
      await expect(fileStorageService.withExclusiveFiles(async () => "nested")).rejects.toThrow("ファイルを処理中です。");
      expect(web.input.click).not.toHaveBeenCalled();
      expect(await fileStorageService.list()).toEqual([restoredFile]);
    } finally {
      finishMaintenance.resolve(undefined);
    }
    await expect(maintenance.finally(unsubscribe)).resolves.toEqual([restoredFile]);
    expect(fileStorageService.getMaintenanceState()).toEqual({ active: false, revision: initialRevision + 1 });
    expect(maintenanceChanged).toHaveBeenCalledTimes(2);

    await expect(fileStorageService.withExclusiveFiles(async () => { throw new Error("Restore failed"); }))
      .rejects.toThrow("Restore failed");
    expect(fileStorageService.getMaintenanceState()).toEqual({ active: false, revision: initialRevision + 2 });
    await expect(fileStorageService.withExclusiveFiles(async () => "ready")).resolves.toBe("ready");
    await expect(fileStorageService.removeMany([restoredFile])).resolves.toEqual({ removed: [restoredFile], failed: [] });
    expect(await fileStorageService.list()).toEqual([]);
  });

  it("opens a multiple-file picker and stores all selections alongside existing files", async () => {
    const web = createWebPicker();
    web.storage.set(webStorageKey, JSON.stringify([
      { name: "existing.mp4", uri: "data:video/mp4;base64,b2xk", size: 3, purpose: "training" },
    ]));
    const onProgress = vi.fn();
    const result = fileStorageService.pickAndStore("punishment", onProgress);

    expect(web.input.multiple).toBe(true);
    expect(web.input.click).toHaveBeenCalledOnce();
    web.input.files = [
      new File(["one"], "first.mp4", { type: "video/mp4" }),
      new File(["two"], "second.mp4", { type: "video/mp4" }),
    ];
    await web.emit("change");

    await expect(result).resolves.toEqual({ stored: 2, failed: [] });
    const allFiles = await fileStorageService.list();
    expect(allFiles).toHaveLength(3);
    const imported = await fileStorageService.list("punishment");
    expect(imported).toHaveLength(2);
    expect(imported.every((file) => file.uri.startsWith("blob:") && file.size === 3)).toBe(true);
    expect(await Promise.all(imported.map(async (file) => (await fileStorageService.getBlob(file))?.text())))
      .toEqual(["one", "two"]);
    expect(web.setItem).not.toHaveBeenCalled();
    expect(web.storage.has(webStorageKey)).toBe(false);
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { completed: 0, total: 2 }, { completed: 1, total: 2 }, { completed: 2, total: 2 },
    ]);
    expect(web.input.remove).toHaveBeenCalledOnce();
    expect(mocks.pick).not.toHaveBeenCalled();
  });

  it.each(["cancel", "change"])("returns null on %s with no files, leaving storage untouched", async (event) => {
    const web = createWebPicker();
    const result = fileStorageService.pickAndStore();

    await web.emit(event);

    await expect(result).resolves.toBeNull();
    expect(web.setItem).not.toHaveBeenCalled();
    expect(web.input.remove).toHaveBeenCalledOnce();
  });

  it("reports a quota failure without losing earlier files or counting the failed write as stored", async () => {
    const web = createWebPicker();
    web.storage.set(webStorageKey, JSON.stringify([
      { name: "existing.mp4", uri: "data:video/mp4;base64,b2xk", size: 3, purpose: "training" },
    ]));
    const originalAdd = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, value, key) {
      if (value.name?.endsWith("too-large.mp4")) throw new DOMException("QuotaExceededError", "QuotaExceededError");
      return originalAdd.call(this, value, key);
    });
    const result = fileStorageService.pickAndStore();
    web.input.files = [
      new File(["one"], "first.mp4", { type: "video/mp4" }),
      new File(["large"], "too-large.mp4", { type: "video/mp4" }),
      new File(["two"], "last.mp4", { type: "video/mp4" }),
    ];

    await web.emit("change");

    await expect(result).resolves.toEqual({ stored: 2, failed: ["too-large.mp4"] });
    const remaining = await fileStorageService.list();
    const contents = await Promise.all(remaining.map(async (file) => (await fileStorageService.getBlob(file))?.text()));
    expect(contents.sort()).toEqual(["old", "one", "two"]);
    expect(web.input.remove).toHaveBeenCalledOnce();
  });

  it("deletes only the selected file when other names or rooms contain identical content", async () => {
    const web = createWebPicker();
    const uri = "data:video/mp4;base64,b25l";
    const selected: StoredFile = { name: "first.mp4", uri, size: 3, purpose: "training" };
    const sameRoom: StoredFile = { name: "second.mp4", uri, size: 3, purpose: "training" };
    const otherRoom: StoredFile = { name: "first.mp4", uri, size: 3, purpose: "punishment" };
    web.storage.set(webStorageKey, JSON.stringify([selected, sameRoom, otherRoom]));

    await fileStorageService.remove(selected);

    expect(web.storage.has(webStorageKey)).toBe(false);
    const remaining = await fileStorageService.list();
    expect(remaining).toHaveLength(2);
    expect(remaining.map(({ name, purpose }) => ({ name, purpose }))).toEqual(expect.arrayContaining([
      { name: sameRoom.name, purpose: sameRoom.purpose }, { name: otherRoom.name, purpose: otherRoom.purpose },
    ]));
  });
});

function installNativeRestoreFileSystem() {
  const directories = new Set(["file:///documents/", "file:///cache/", nativeDirectory]);
  mocks.info.mockImplementation(async (uri: string) => {
    if (directories.has(uri) || directories.has(`${uri}/`)) return { exists: true, isDirectory: true };
    const contents = nativeFiles.get(uri);
    return contents === undefined ? { exists: false } : {
      exists: true, isDirectory: false, size: new TextEncoder().encode(contents).length,
    };
  });
  mocks.mkdir.mockImplementation(async (uri: string) => { directories.add(uri); });
  mocks.copy.mockImplementation(async ({ from, to }) => {
    const contents = nativeFiles.get(from);
    if (contents === undefined) throw new Error("Missing source file");
    nativeFiles.set(to, contents);
  });
  mocks.write.mockImplementation(async (uri: string, data: string) => { nativeFiles.set(uri, atob(data)); });
  mocks.remove.mockImplementation(async (uri) => {
    for (const path of directories) if (path === uri || path.startsWith(uri)) directories.delete(path);
    for (const path of nativeFiles.keys()) if (path === uri || (uri.endsWith("/") && path.startsWith(uri))) nativeFiles.delete(path);
  });
  mocks.move.mockImplementation(async ({ from, to }) => {
    if (!directories.has(from) || directories.has(to)) throw new Error("Invalid directory move");
    for (const path of [...directories]) {
      if (path === from || path.startsWith(from)) {
        directories.delete(path);
        directories.add(to + path.slice(from.length));
      }
    }
    for (const [path, data] of [...nativeFiles]) {
      if (path.startsWith(from)) {
        nativeFiles.delete(path);
        nativeFiles.set(to + path.slice(from.length), data);
      }
    }
  });
  mocks.list.mockImplementation(async (uri: string) => [...directories, ...nativeFiles.keys()]
    .filter((path) => path.startsWith(uri) && path !== uri)
    .map((path) => path.slice(uri.length).replace(/\/$/, ""))
    .filter((path) => !path.includes("/"))
    .map(decodeURIComponent));
  const oldFile = `${nativeDirectory}legacy.mp4`;
  nativeFiles.set(oldFile, "old");
  const replacement: RestoreStoredFile = {
    name: "new.mp4", size: 3, purpose: "training", mimeType: "video/mp4", uri: "file:///cache/new.mp4",
  };
  nativeFiles.set(replacement.uri, "new");
  return { directories, oldFile, replacement };
}

describe("prepared file restoration", () => {
  it("stages native media by copying files, switches after preparation, and finalizes idempotently", async () => {
    const { oldFile, replacement, directories } = installNativeRestoreFileSystem();
    const prepared = await fileStorageService.prepareRestore([replacement]);
    expect(nativeFiles.get(oldFile)).toBe("old");
    expect(mocks.move).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();

    await prepared.activate();
    await prepared.activate();
    expect(nativeFiles.has(oldFile)).toBe(false);
    expect(nativeFiles.get(`${nativeDirectory}training/new.mp4`)).toBe("new");
    expect([...nativeFiles.values()].filter((value) => value === "old")).toHaveLength(1);
    expect(mocks.move).toHaveBeenCalledTimes(2);

    await prepared.finalize();
    await prepared.finalize();
    await prepared.rollback();
    expect(nativeFiles.get(`${nativeDirectory}training/new.mp4`)).toBe("new");
    expect([...nativeFiles.values()]).not.toContain("old");
    expect([...directories].some((path) => /files-(previous|restore)-/.test(path))).toBe(false);
  });

  it("rolls back both native files and legacy root files when a later database operation fails", async () => {
    const { oldFile, replacement } = installNativeRestoreFileSystem();
    const prepared = await fileStorageService.prepareRestore([replacement]);
    await prepared.activate();
    await prepared.rollback();
    await prepared.rollback();
    await prepared.finalize();
    expect(nativeFiles.get(oldFile)).toBe("old");
    expect(nativeFiles.has(`${nativeDirectory}training/new.mp4`)).toBe(false);
    expect([...nativeFiles.keys()].some((path) => /files-(previous|restore)-/.test(path))).toBe(false);
  });

  it("preserves original files and removes partial staging when a copy runs out of disk space", async () => {
    const { oldFile, replacement } = installNativeRestoreFileSystem();
    mocks.copy.mockImplementation(async ({ to }) => {
      nativeFiles.set(to, "pa");
      throw new Error("Disk full");
    });
    await expect(fileStorageService.prepareRestore([replacement])).rejects.toThrow("Disk full");
    expect(nativeFiles.get(oldFile)).toBe("old");
    expect(mocks.move).not.toHaveBeenCalled();
    expect([...nativeFiles.keys()].some((path) => /files-restore-/.test(path))).toBe(false);
  });

  it("rejects truncated copied media before moving live files", async () => {
    const { oldFile, replacement } = installNativeRestoreFileSystem();
    mocks.copy.mockImplementation(async ({ to }) => { nativeFiles.set(to, "pa"); });
    await expect(fileStorageService.prepareRestore([replacement])).rejects.toThrow("格納ファイルのデータが不正です。");
    expect(nativeFiles.get(oldFile)).toBe("old");
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it("restores the original directory if installing the completed staging directory fails", async () => {
    const { oldFile, replacement } = installNativeRestoreFileSystem();
    const move = mocks.move.getMockImplementation()!;
    mocks.move.mockImplementation(async (options) => {
      if (options.from.includes("files-restore-")) throw new Error("Install failed");
      return move(options);
    });
    const prepared = await fileStorageService.prepareRestore([replacement]);
    await expect(prepared.activate()).rejects.toThrow("Install failed");
    await prepared.rollback();
    expect(nativeFiles.get(oldFile)).toBe("old");
    expect([...nativeFiles.keys()].some((path) => /files-(previous|restore)-/.test(path))).toBe(false);
  });

  it("retains the recoverable original directory when rollback fails and allows retrying rollback", async () => {
    const { oldFile, replacement } = installNativeRestoreFileSystem();
    const prepared = await fileStorageService.prepareRestore([replacement]);
    await prepared.activate();
    const move = mocks.move.getMockImplementation()!;
    mocks.move.mockImplementationOnce(async () => { throw new Error("Move unavailable"); });
    await expect(prepared.rollback()).rejects.toThrow("Move unavailable");
    await prepared.finalize();
    expect([...nativeFiles].some(([path, value]) => path.includes("files-previous-") && value === "old")).toBe(true);
    mocks.move.mockImplementation(move);
    await prepared.rollback();
    expect(nativeFiles.get(oldFile)).toBe("old");
  });

  it("does not report a successful restore as failed when obsolete files cannot be cleaned up", async () => {
    const { replacement } = installNativeRestoreFileSystem();
    const prepared = await fileStorageService.prepareRestore([replacement]);
    await prepared.activate();
    const remove = mocks.remove.getMockImplementation()!;
    mocks.remove.mockImplementation(async (uri, options) => {
      if (uri.includes("files-previous-")) throw new Error("Cleanup unavailable");
      return remove(uri, options);
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(prepared.finalize()).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledOnce();
    expect(nativeFiles.get(`${nativeDirectory}training/new.mp4`)).toBe("new");
  });

  it("rejects path traversal, duplicate names, and malformed legacy data before filesystem changes", async () => {
    const { replacement } = installNativeRestoreFileSystem();
    const invalid: RestoreStoredFile[][] = [
      [{ ...replacement, name: "../outside.mp4" }],
      [{ ...replacement, name: ".." }],
      [{ ...replacement, name: "nested\\file.mp4" }],
      [{ ...replacement, size: -1 }],
      [replacement, replacement],
      [{ name: "legacy.mp4", purpose: "training", mimeType: "video/mp4", size: 3, data: "broken" }],
      [{ name: "legacy.mp4", purpose: "training", mimeType: "video/mp4", size: 4, data: "b2xk" }],
    ];
    for (const files of invalid) {
      await expect(fileStorageService.prepareRestore(files)).rejects.toThrow("格納ファイルのデータが不正です。");
    }
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("keeps matching names in separate rooms distinct and safely handles literal URI characters", async () => {
    const { replacement } = installNativeRestoreFileSystem();
    const name = "日本語 # ? %2f.mp4";
    const prepared = await fileStorageService.prepareRestore([
      { ...replacement, name },
      { ...replacement, name, purpose: "punishment" },
    ]);
    await prepared.activate();
    await prepared.finalize();
    const files = await fileStorageService.list();
    expect(files).toHaveLength(2);
    expect(files.map((file) => file.name)).toEqual([name, name]);
    expect(files.map((file) => file.uri)).toEqual(expect.arrayContaining([
      `${nativeDirectory}training/${encodeURIComponent(name)}`,
      `${nativeDirectory}punishment/${encodeURIComponent(name)}`,
    ]));
  });

  it("restores legacy base64 through staging and can discard preparation without changing live files", async () => {
    const { oldFile } = installNativeRestoreFileSystem();
    const file = { name: "legacy.png", size: 3, purpose: "punishment" as const, mimeType: "image/png", data: "bmV3" };
    const prepared = await fileStorageService.prepareRestore([file]);
    await prepared.rollback();
    expect(nativeFiles.get(oldFile)).toBe("old");
    expect(mocks.move).not.toHaveBeenCalled();
    await fileStorageService.restoreFromBackup([file]);
    expect(nativeFiles.get(`${nativeDirectory}punishment/legacy.png`)).toBe("new");
    expect(nativeFiles.has(oldFile)).toBe(false);
  });

  it("restores binary browser media even when localStorage writes have no space", async () => {
    const web = createWebPicker();
    const initial = [{ name: "old.mp4", size: 3, purpose: "training", uri: "data:video/mp4;base64,b2xk" }];
    web.storage.set(webStorageKey, JSON.stringify(initial));
    const prepared = await fileStorageService.prepareRestore([
      { name: "new.mp4", size: 3, purpose: "training", mimeType: "video/mp4", data: "bmV3" },
    ]);
    expect(web.setItem).not.toHaveBeenCalled();
    web.setItem.mockImplementation(() => { throw new Error("QuotaExceededError"); });
    await prepared.activate();
    expect((await fileStorageService.list())[0].name).toBe("new.mp4");
    await prepared.rollback();
    const [old] = await fileStorageService.list();
    expect(old.name).toBe("old.mp4");
    expect(await (await fileStorageService.getBlob(old))?.text()).toBe("old");
    expect(web.setItem).not.toHaveBeenCalled();
  });

  it("rolls browser media back when subsequent data restoration fails", async () => {
    const web = createWebPicker();
    const initial = [{ name: "old.mp4", size: 3, purpose: "training", uri: "data:video/mp4;base64,b2xk" }];
    web.storage.set(webStorageKey, JSON.stringify(initial));
    const prepared = await fileStorageService.prepareRestore([
      { name: "new.mp4", size: 3, purpose: "training", mimeType: "video/mp4", data: "bmV3" },
    ]);
    await prepared.activate();
    expect((await fileStorageService.list())[0].name).toBe("new.mp4");
    await prepared.rollback();
    await prepared.rollback();
    const [old] = await fileStorageService.list();
    expect(old.name).toBe("old.mp4");
    expect(await (await fileStorageService.getBlob(old))?.text()).toBe("old");
  });
});
