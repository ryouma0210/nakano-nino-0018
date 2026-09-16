import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileStorageService, type StoredFile } from "./fileStorageService";

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" },
  pick: vi.fn(),
  info: vi.fn(),
  mkdir: vi.fn(),
  copy: vi.fn<({ from, to }: { from: string; to: string }) => Promise<void>>(),
  remove: vi.fn<(uri: string, options: { idempotent: boolean }) => Promise<void>>(),
}));

vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: mocks.pick }));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  getInfoAsync: mocks.info,
  makeDirectoryAsync: mocks.mkdir,
  copyAsync: mocks.copy,
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

beforeEach(() => {
  vi.resetAllMocks();
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

type SelectedWebFile = { name: string; size: number; data: string };

function createWebPicker() {
  mocks.platform.OS = "web";
  const listeners = new Map<string, () => unknown>();
  const input = {
    type: "",
    accept: "",
    multiple: false,
    style: { display: "" },
    files: [] as SelectedWebFile[],
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
  });
  vi.stubGlobal("FileReader", class {
    result: string | null = null;
    onload: (() => void) | null = null;
    readAsDataURL(file: SelectedWebFile) {
      queueMicrotask(() => {
        this.result = `data:video/mp4;base64,${file.data}`;
        this.onload?.();
      });
    }
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
  it("allows internal restore and export under maintenance while rejecting competing work and releasing on failure", async () => {
    const web = createWebPicker();
    const initialRevision = fileStorageService.getMaintenanceState().revision;
    const maintenanceChanged = vi.fn();
    const unsubscribe = fileStorageService.subscribeMaintenance(maintenanceChanged);
    const restored = { name: "restored.mp4", size: 3, purpose: "training" as const, mimeType: "video/mp4", data: "b25l" };
    const restoredFile: StoredFile = { name: restored.name, size: 3, purpose: "training", uri: "data:video/mp4;base64,b25l" };
    const restoredReady = deferred<void>();
    const finishMaintenance = deferred<void>();
    const maintenance = fileStorageService.withExclusiveFiles(async () => {
      await fileStorageService.restoreFromBackup([restored]);
      restoredReady.resolve(undefined);
      await finishMaintenance.promise;
      return fileStorageService.exportForBackup();
    });
    await restoredReady.promise;
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
    await expect(maintenance.finally(unsubscribe)).resolves.toEqual([restored]);
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
      { name: "first.mp4", size: 3, data: "b25l" },
      { name: "second.mp4", size: 3, data: "dHdv" },
    ];
    await web.emit("change");

    await expect(result).resolves.toEqual({ stored: 2, failed: [] });
    const allFiles = await fileStorageService.list();
    expect(allFiles).toHaveLength(3);
    expect(await fileStorageService.list("punishment")).toEqual(expect.arrayContaining([
      expect.objectContaining({ uri: "data:video/mp4;base64,b25l", size: 3, purpose: "punishment" }),
      expect.objectContaining({ uri: "data:video/mp4;base64,dHdv", size: 3, purpose: "punishment" }),
    ]));
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
    web.setItem.mockImplementation((key, value) => {
      if (value.includes("bGFyZ2U=")) throw new Error("QuotaExceededError");
      web.storage.set(key, value);
    });
    const result = fileStorageService.pickAndStore();
    web.input.files = [
      { name: "first.mp4", size: 3, data: "b25l" },
      { name: "too-large.mp4", size: 1000000, data: "bGFyZ2U=" },
      { name: "last.mp4", size: 3, data: "dHdv" },
    ];

    await web.emit("change");

    await expect(result).resolves.toEqual({ stored: 2, failed: ["too-large.mp4"] });
    expect((await fileStorageService.list()).map((file) => file.uri).sort()).toEqual([
      "data:video/mp4;base64,b2xk", "data:video/mp4;base64,b25l", "data:video/mp4;base64,dHdv",
    ].sort());
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

    expect(JSON.parse(web.storage.get(webStorageKey) ?? "[]")).toEqual([sameRoom, otherRoom]);
    const remaining = await fileStorageService.list();
    expect(remaining).toHaveLength(2);
    expect(remaining).toEqual(expect.arrayContaining([sameRoom, otherRoom]));
  });
});
