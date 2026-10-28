import { IDBDatabase as FakeIDBDatabase, IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentPickerAsset } from "expo-document-picker";
import type { VoiceLibrary } from "../features/voices/library";

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" }, pick: vi.fn(), info: vi.fn(), mkdir: vi.fn(), copy: vi.fn(), move: vi.fn(),
  read: vi.fn(), write: vi.fn(), remove: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: mocks.pick }));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/", getInfoAsync: mocks.info, makeDirectoryAsync: mocks.mkdir,
  copyAsync: mocks.copy, moveAsync: mocks.move, readAsStringAsync: mocks.read, writeAsStringAsync: mocks.write, deleteAsync: mocks.remove,
}));

const directory = "file:///documents/voices/";
const current = `${directory}.metadata/current.json`;
const previous = `${directory}.metadata/previous.json`;
const pending = `${directory}.metadata/pending.json`;
const databaseName = "nino-room-voice-library-v1";
let nativeFiles: Map<string, string>;
let service: typeof import("./voiceStorageService").voiceStorageService;
let blobs: Map<string, Blob>;
let localStorageWrite: ReturnType<typeof vi.fn>;

function asset(name: string, data = "audio", mimeType = "audio/mpeg"): DocumentPickerAsset {
  const uri = `file:///picked/${name}`;
  nativeFiles.set(uri, data);
  return { name, uri, size: data.length, mimeType, lastModified: 0 };
}

function webAsset(name: string, data: BlobPart = "audio", mimeType = "audio/mpeg"): DocumentPickerAsset {
  const file = new File([data], name, { type: mimeType });
  return { name, uri: `blob:picked-${name}`, size: file.size, mimeType, lastModified: 0, file };
}

function select(...assets: DocumentPickerAsset[]) {
  mocks.pick.mockResolvedValueOnce({ canceled: false, assets });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

async function webData(operation: (transaction: IDBTransaction) => void, mode: IDBTransactionMode = "readonly") {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["metadata", "voices"], mode);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      operation(transaction);
    });
  } finally { database.close(); }
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.platform.OS = "android";
  nativeFiles = new Map();
  blobs = new Map();
  mocks.info.mockImplementation(async (uri: string) => nativeFiles.has(uri)
    ? { exists: true, isDirectory: false, size: nativeFiles.get(uri)!.length } : { exists: false });
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.copy.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
    if (!nativeFiles.has(from)) throw new Error("missing source");
    nativeFiles.set(to, nativeFiles.get(from)!);
  });
  mocks.move.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
    if (!nativeFiles.has(from)) throw new Error("missing source");
    nativeFiles.set(to, nativeFiles.get(from)!);
    nativeFiles.delete(from);
  });
  mocks.read.mockImplementation(async (uri: string) => nativeFiles.get(uri));
  mocks.write.mockImplementation(async (uri: string, value: string) => { nativeFiles.set(uri, value); });
  mocks.remove.mockImplementation(async (uri: string) => {
    for (const path of nativeFiles.keys()) if (path === uri || (uri.endsWith("/") && path.startsWith(uri))) nativeFiles.delete(path);
  });
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorageWrite = vi.fn(() => { throw new Error("No localStorage media writes allowed"); });
  vi.stubGlobal("localStorage", { setItem: localStorageWrite, getItem: vi.fn(), removeItem: vi.fn() });
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const uri = `blob:stored-${blobs.size}`;
    blobs.set(uri, blob as Blob);
    return uri;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  ({ voiceStorageService: service } = await import("./voiceStorageService"));
});

describe.each(["android", "web"])("%s atomic voice ordering", (platform) => {
  beforeEach(() => { mocks.platform.OS = platform; });

  async function seedLibrary() {
    const folder = await service.createFolder("Morning");
    const other = await service.createFolder("Evening");
    const makeAsset = platform === "web" ? webAsset : asset;
    select(...["first", "second", "third", "fourth", "fifth"].map((name) => makeAsset(`${name}.mp3`, name)));
    await service.importVoices();
    const voices = (await service.load()).voices;
    await service.setVoiceFolders(voices[0].id, [folder.id, other.id]);
    await service.setVoiceFolders(voices[2].id, [other.id]);
    await service.setVoiceFolders(voices[3].id, [folder.id, other.id]);
    await service.setMode("all");
    await service.setScope(other.id);
    return { folder, other, original: await service.load() };
  }

  it.each(["all", "unfiled", "folder"])("saves %s order in one metadata commit and preserves audio, memberships and outside slots", async (kind) => {
    const { folder, original } = await seedLibrary();
    const voices = original.voices;
    const order = kind === "all" ? [4, 3, 2, 1, 0] : kind === "unfiled" ? [4, 1] : [3, 0];
    const expected = kind === "all" ? [4, 3, 2, 1, 0] : kind === "unfiled" ? [0, 4, 2, 3, 1] : [3, 1, 2, 0, 4];
    const scope = kind === "folder" ? folder.id : kind;
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    const add = vi.spyOn(IDBObjectStore.prototype, "add");
    const transactions = vi.spyOn(FakeIDBDatabase.prototype, "transaction");
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    mocks.write.mockClear();
    mocks.copy.mockClear();
    mocks.move.mockClear();
    vi.mocked(URL.createObjectURL).mockClear();
    vi.mocked(URL.revokeObjectURL).mockClear();
    await service.reorder(order.map((index) => voices[index].id), scope);
    expect(listener).toHaveBeenCalledOnce();
    expect(add).not.toHaveBeenCalled();
    expect(mocks.copy).not.toHaveBeenCalled();
    if (platform === "web") {
      expect(transactions).toHaveBeenCalledExactlyOnceWith(["metadata", "voices"], "readwrite");
      expect(put).toHaveBeenCalledOnce();
      expect((put.mock.contexts[0] as IDBObjectStore).name).toBe("metadata");
      expect(mocks.write).not.toHaveBeenCalled();
    } else {
      expect(mocks.write).toHaveBeenCalledOnce();
      expect(mocks.write.mock.calls[0][0]).toBe(pending);
      expect(mocks.move.mock.calls.every(([paths]) => paths.from.startsWith(`${directory}.metadata/`) && paths.to.startsWith(`${directory}.metadata/`))).toBe(true);
      expect(put).not.toHaveBeenCalled();
    }
    const expectedVoices = expected.map((index) => voices[index]);
    expect(await service.load()).toEqual({ ...original, voices: expectedVoices });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    for (const [index, voice] of voices.entries()) {
      expect(platform === "web" ? await blobs.get(voice.uri)!.text() : nativeFiles.get(voice.uri)).toBe(["first", "second", "third", "fourth", "fifth"][index]);
    }
    unsubscribe();
    vi.resetModules();
    ({ voiceStorageService: service } = await import("./voiceStorageService"));
    const reloaded = await service.load();
    expect({ ...reloaded, voices: reloaded.voices.map((voice) => ({ ...voice, uri: undefined })) })
      .toEqual({ ...original, voices: expectedVoices.map((voice) => ({ ...voice, uri: undefined })) });
  });

  it("snapshots the caller order before queued work and applies its explicit scope despite a selection change", async () => {
    const { folder, other, original } = await seedLibrary();
    await service.setScope(folder.id);
    const ids = [original.voices[3].id, original.voices[0].id];
    const selecting = service.setScope(other.id);
    const reordering = service.reorder(ids, folder.id);
    ids.reverse();
    ids.push("voice-missing");
    await Promise.all([selecting, reordering]);
    expect(await service.load()).toEqual({ ...original, voices: [3, 1, 2, 0, 4].map((index) => original.voices[index]) });
  });

  it("rejects invalid permutations or unknown scopes without any metadata write or notification", async () => {
    const { folder, original } = await seedLibrary();
    const [first, outside, , fourth] = original.voices;
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    mocks.write.mockClear();
    for (const ids of [null, undefined, first.id, [], [first.id], [first.id, first.id], [first.id, outside.id],
      [first.id, fourth.id, outside.id], [first.id, "voice-missing"], [null, fourth.id], Object.assign(new Array(2), { 0: first.id })]) {
      await expect(service.reorder(ids as string[], folder.id)).rejects.toThrow("順序変更を開き直して");
    }
    await expect(service.reorder([], "folder-missing")).rejects.toThrow("フォルダが見つかりません");
    expect(await service.load()).toEqual(original);
    expect(listener).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    unsubscribe();
  });

  it.each(["membership", "addition", "deletion", "folder"])("rejects a stale order after %s changes without overwriting the latest library", async (change) => {
    const { folder, other, original } = await seedLibrary();
    const ids = [original.voices[3].id, original.voices[0].id];
    if (change === "membership") await service.setVoiceFolders(original.voices[0].id, [other.id]);
    if (change === "addition") {
      select(platform === "web" ? webAsset("new.mp3") : asset("new.mp3"));
      await service.importVoices(folder.id);
    }
    if (change === "deletion") await service.remove(original.voices[0].id);
    if (change === "folder") await service.removeFolder(folder.id);
    const latest = await service.load();
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    mocks.write.mockClear();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    await expect(service.reorder(ids, folder.id)).rejects.toThrow(change === "folder" ? "フォルダが見つかりません" : "順序変更を開き直して");
    expect(await service.load()).toEqual(latest);
    expect(put).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("rolls back a failed order commit without changing membership, bytes, playback URLs or selection", async () => {
    const { folder, original } = await seedLibrary();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    mocks.copy.mockClear();
    vi.mocked(URL.createObjectURL).mockClear();
    vi.mocked(URL.revokeObjectURL).mockClear();
    let restore: (() => void) | undefined;
    if (platform === "web") {
      const put = IDBObjectStore.prototype.put;
      const abort = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
        const request = put.call(this, value, key);
        request.addEventListener("success", () => this.transaction.abort(), { once: true });
        return request;
      });
      restore = () => abort.mockRestore();
    } else {
      const move = mocks.move.getMockImplementation()!;
      mocks.move.mockImplementationOnce(move).mockRejectedValueOnce(new Error("disk full"));
    }
    const ids = [original.voices[3].id, original.voices[0].id];
    await expect(service.reorder(ids, folder.id)).rejects.toThrow();
    restore?.();
    expect(await service.load()).toEqual(original);
    expect(listener).not.toHaveBeenCalled();
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    for (const [index, voice] of original.voices.entries()) {
      expect(platform === "web" ? await blobs.get(voice.uri)!.text() : nativeFiles.get(voice.uri)).toBe(["first", "second", "third", "fourth", "fifth"][index]);
    }
    await service.reorder(ids, folder.id);
    expect(await service.load()).toEqual({ ...original, voices: [3, 1, 2, 0, 4].map((index) => original.voices[index]) });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("native voice library", () => {
  it("clears its dedicated storage and repeat preference without deleting original imports or other app files", async () => {
    const imported = asset("first.mp3");
    const other = "file:///documents/private-room-files/training/other.mp3";
    nativeFiles.set(other, "other audio");
    select(imported);
    await service.importVoices();
    await service.setMode("all");
    const folder = await service.createFolder("Morning");
    await service.setScope(folder.id);
    await service.clear();
    expect(await service.load()).toEqual({ voices: [], mode: "one", folders: [], scope: "all" });
    expect([...nativeFiles.keys()].some((uri) => uri.startsWith(directory))).toBe(false);
    expect(nativeFiles.get(imported.uri)).toBe("audio");
    expect(nativeFiles.get(other)).toBe("other audio");
    expect(mocks.remove).toHaveBeenCalledWith(directory, { idempotent: true });
  });

  it("copies multiple audio imports into durable storage and preserves order, rename, repeat, and bytes after reload", async () => {
    expect(await service.load()).toEqual({ voices: [], mode: "one", folders: [], scope: "all" });
    select(asset("first.mp3", "first"), asset("second.wav", "second", ""));
    expect(await service.importVoices()).toEqual({ added: 2, failed: 0, canceled: false });
    expect(mocks.pick).toHaveBeenCalledWith(expect.objectContaining({ multiple: true, copyToCacheDirectory: true, base64: false }));
    const [first, second] = (await service.load()).voices;
    expect(first.uri).toMatch(/^file:\/\/\/documents\/voices\/voice-.+\.mp3$/);
    expect(nativeFiles.get(first.uri)).toBe("first");
    await service.rename(first.id, "  Morning  ");
    await service.move(second.id, -1);
    await service.setMode("all");
    vi.resetModules();
    ({ voiceStorageService: service } = await import("./voiceStorageService"));
    expect(await service.load()).toEqual({ voices: [second, { ...first, name: "Morning" }], mode: "all", folders: [], scope: "all" });
    expect(nativeFiles.get(first.uri)).toBe("first");
    expect((await service.load()).voices[1].originalName).toBe("first.mp3");
  });

  it("reports partial failures, continues later files, and cleans up failed copies", async () => {
    select(asset("first.mp3"), asset("broken.mp3"), asset("not-audio.txt", "text", "text/plain"), asset("last.mp3"));
    const copy = mocks.copy.getMockImplementation()!;
    mocks.copy.mockImplementation(async (paths) => {
      await copy(paths);
      if (paths.from.endsWith("broken.mp3")) throw new Error("copy interrupted");
    });
    expect(await service.importVoices()).toEqual({ added: 2, failed: 2, canceled: false });
    expect((await service.load()).voices.map(({ name }) => name)).toEqual(["first.mp3", "last.mp3"]);
    expect([...nativeFiles.keys()].filter((uri) => uri.startsWith(directory) && !uri.includes(".metadata/"))).toHaveLength(2);
  });

  it("rolls back failed metadata replacement without losing existing files or poisoning later updates", async () => {
    select(asset("first.mp3"));
    await service.importVoices();
    const original = await service.load();
    const move = mocks.move.getMockImplementation()!;
    mocks.move.mockImplementationOnce(move).mockImplementationOnce(async ({ from }) => {
      expect(from).toBe(pending);
      throw new Error("disk full");
    });
    await expect(service.rename(original.voices[0].id, "Changed")).rejects.toThrow("disk full");
    expect(await service.load()).toEqual(original);
    expect(nativeFiles.get(original.voices[0].uri)).toBe("audio");
    await service.rename(original.voices[0].id, "Recovered");
    expect((await service.load()).voices[0].name).toBe("Recovered");
  });

  it("recovers the previous metadata when the app stopped between metadata moves", async () => {
    select(asset("first.mp3"));
    await service.importVoices();
    const original = await service.load();
    nativeFiles.set(previous, nativeFiles.get(current)!);
    nativeFiles.delete(current);
    nativeFiles.set(pending, "incomplete");
    expect(await service.load()).toEqual(original);
    await service.setMode("all");
    expect((await service.load()).mode).toBe("all");
    expect(nativeFiles.has(previous)).toBe(false);
  });

  it.each(["{invalid", JSON.stringify({ version: 1, mode: "random", voices: [] })])("rejects corrupt metadata without overwriting it (%#)", async (corrupt) => {
    nativeFiles.set(current, corrupt);
    await expect(service.load()).rejects.toThrow("保存データが不正");
    await expect(service.setMode("all")).rejects.toThrow("保存データが不正");
    select(asset("first.mp3"));
    await expect(service.importVoices()).rejects.toThrow("保存データが不正");
    expect(nativeFiles.get(current)).toBe(corrupt);
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("preserves audio when removal metadata fails, then removes only the selected voice", async () => {
    select(asset("first.mp3"), asset("second.mp3"));
    await service.importVoices();
    const original = await service.load();
    mocks.write.mockRejectedValueOnce(new Error("disk full"));
    await expect(service.remove(original.voices[0].id)).rejects.toThrow("disk full");
    expect(await service.load()).toEqual(original);
    expect(nativeFiles.has(original.voices[0].uri)).toBe(true);
    await service.remove(original.voices[0].id);
    expect(await service.load()).toEqual({ ...original, voices: [original.voices[1]] });
    expect(nativeFiles.has(original.voices[0].uri)).toBe(false);
    expect(nativeFiles.has(original.voices[1].uri)).toBe(true);
  });

  it("does not roll back a committed removal when orphan cleanup fails", async () => {
    select(asset("first.mp3"));
    await service.importVoices();
    const [voice] = (await service.load()).voices;
    const remove = mocks.remove.getMockImplementation()!;
    mocks.remove.mockImplementation(async (uri) => {
      if (uri === voice.uri) throw new Error("file busy");
      await remove(uri);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await service.remove(voice.id);
    expect((await service.load()).voices).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("voice import concurrency and notifications", () => {
  it("opens the picker immediately, rejects a second picker, and merges changes made while it is open", async () => {
    select(asset("first.mp3"));
    await service.importVoices();
    const [first] = (await service.load()).voices;
    const picked = deferred<{ canceled: false; assets: DocumentPickerAsset[] }>();
    mocks.pick.mockReturnValueOnce(picked.promise);
    const importing = service.importVoices();
    expect(mocks.pick).toHaveBeenCalledTimes(2);
    await expect(service.importVoices()).rejects.toThrow("処理中");
    await service.rename(first.id, "Renamed while picking");
    await service.setMode("all");
    picked.resolve({ canceled: false, assets: [asset("second.mp3")] });
    await importing;
    expect(await service.load()).toMatchObject({ mode: "all", voices: [
      { name: "Renamed while picking" }, { name: "second.mp3" },
    ] });
  });

  it("serializes operations made during a copy and does not lose their latest state", async () => {
    select(asset("first.mp3"));
    await service.importVoices();
    const [first] = (await service.load()).voices;
    const started = deferred<void>();
    const release = deferred<void>();
    const copy = mocks.copy.getMockImplementation()!;
    mocks.copy.mockImplementationOnce(async (paths) => { started.resolve(); await release.promise; await copy(paths); });
    select(asset("second.mp3"));
    const importing = service.importVoices();
    await started.promise;
    const renaming = service.rename(first.id, "Latest name");
    const modeChange = service.setMode("all");
    release.resolve();
    await Promise.all([importing, renaming, modeChange]);
    expect(await service.load()).toMatchObject({ mode: "all", voices: [{ name: "Latest name" }, { name: "second.mp3" }] });
  });

  it("releases the import lock after cancellation or picker failure", async () => {
    mocks.pick.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await service.importVoices()).toEqual({ added: 0, failed: 0, canceled: true });
    mocks.pick.mockRejectedValueOnce(new Error("picker unavailable"));
    await expect(service.importVoices()).rejects.toThrow("picker unavailable");
    select(asset("first.mp3"));
    expect(await service.importVoices()).toEqual({ added: 1, failed: 0, canceled: false });
  });

  it("notifies after committed changes only and supports unsubscribe", async () => {
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    mocks.pick.mockResolvedValueOnce({ canceled: true, assets: null });
    await service.importVoices();
    await expect(service.rename("missing", "Name")).rejects.toThrow("見つかりません");
    expect(listener).not.toHaveBeenCalled();
    select(asset("first.mp3"));
    await service.importVoices();
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    await service.setMode("all");
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("web binary voice library", () => {
  beforeEach(() => { mocks.platform.OS = "web"; });

  it("clears blobs and repeat metadata atomically and releases only stored playback URLs", async () => {
    const imported = webAsset("first.mp3", "original audio");
    select(imported);
    await service.importVoices();
    await service.setMode("all");
    const folder = await service.createFolder("Morning");
    await service.setScope(folder.id);
    const [voice] = (await service.load()).voices;
    vi.mocked(URL.revokeObjectURL).mockClear();
    await service.clear();
    expect(await service.load()).toEqual({ voices: [], mode: "one", folders: [], scope: "all" });
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(voice.uri);
    expect(await imported.file!.text()).toBe("original audio");
    await webData((transaction) => {
      const files = transaction.objectStore("voices").count();
      const metadata = transaction.objectStore("metadata").count();
      files.onsuccess = () => expect(files.result).toBe(0);
      metadata.onsuccess = () => expect(metadata.result).toBe(0);
    });
  });

  it("stores large Blobs in IndexedDB and recreates playback URLs after a restart", async () => {
    const bytes = new Uint8Array(6 * 1024 * 1024 + 9).fill(41);
    bytes[bytes.length - 1] = 17;
    select(webAsset("large.mp3", bytes), webAsset("second.wav", "second", ""));
    expect(await service.importVoices()).toEqual({ added: 2, failed: 0, canceled: false });
    const original = await service.load();
    expect(mocks.pick.mock.calls[0][0].type).toContain(".mp3");
    expect(mocks.pick.mock.calls[0][0].base64).toBe(false);
    expect(localStorageWrite).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picked-large.mp3");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(await service.load()).toEqual(original);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    await service.rename(original.voices[0].id, "Morning");
    await service.move(original.voices[1].id, -1);
    await service.setMode("all");
    vi.resetModules();
    ({ voiceStorageService: service } = await import("./voiceStorageService"));
    const loaded = await service.load();
    expect(loaded.mode).toBe("all");
    expect(loaded.voices.map(({ name }) => name)).toEqual(["second.wav", "Morning"]);
    expect(loaded.voices[1].originalName).toBe("large.mp3");
    expect(loaded.voices[1].uri).not.toBe(original.voices[0].uri);
    const storedBytes = new Uint8Array(await blobs.get(loaded.voices[1].uri)!.arrayBuffer());
    expect(storedBytes.length).toBe(bytes.length);
    expect(storedBytes[0]).toBe(41);
    expect(storedBytes.at(-1)).toBe(17);
    expect(localStorageWrite).not.toHaveBeenCalled();
  });

  it("rolls back an imported blob if the metadata transaction aborts after the put succeeds", async () => {
    await service.load();
    const put = IDBObjectStore.prototype.put;
    const abort = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = put.call(this, value, key);
      request.addEventListener("success", () => this.transaction.abort(), { once: true });
      return request;
    });
    select(webAsset("first.mp3"));
    expect(await service.importVoices()).toEqual({ added: 0, failed: 1, canceled: false });
    abort.mockRestore();
    expect((await service.load()).voices).toEqual([]);
    await webData((transaction) => {
      const count = transaction.objectStore("voices").count();
      count.onsuccess = () => expect(count.result).toBe(0);
    });
    select(webAsset("retry.mp3"));
    expect((await service.importVoices()).added).toBe(1);
  });

  it("retains both bytes and playback URL when removing a voice cannot commit", async () => {
    select(webAsset("first.mp3"));
    await service.importVoices();
    const original = await service.load();
    const voice = original.voices[0];
    vi.mocked(URL.revokeObjectURL).mockClear();
    const put = IDBObjectStore.prototype.put;
    const abort = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = put.call(this, value, key);
      request.addEventListener("success", () => this.transaction.abort(), { once: true });
      return request;
    });
    await expect(service.remove(voice.id)).rejects.toThrow();
    abort.mockRestore();
    expect(await service.load()).toEqual(original);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await service.remove(voice.id);
    expect((await service.load()).voices).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(voice.uri);
    await webData((transaction) => {
      const count = transaction.objectStore("voices").count();
      count.onsuccess = () => expect(count.result).toBe(0);
    });
  });

  it("updates names and order using metadata only while keeping binary identity", async () => {
    select(webAsset("first.mp3"), webAsset("second.mp3"));
    await service.importVoices();
    const original = await service.load();
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    const add = vi.spyOn(IDBObjectStore.prototype, "add");
    await service.rename(original.voices[0].id, "Changed");
    await service.move(original.voices[1].id, -1);
    await service.setMode("all");
    expect(add).not.toHaveBeenCalled();
    expect(put.mock.contexts.every((store) => (store as IDBObjectStore).name === "metadata")).toBe(true);
    expect((await service.load()).voices.map(({ uri }) => uri)).toEqual([original.voices[1].uri, original.voices[0].uri]);
  });

  it("rejects corrupt metadata and missing Blobs without replacing the library", async () => {
    select(webAsset("first.mp3"));
    await service.importVoices();
    const [voice] = (await service.load()).voices;
    let original: VoiceLibrary | undefined;
    await webData((transaction) => {
      const get = transaction.objectStore("metadata").get("library");
      get.onsuccess = () => { original = get.result; };
      transaction.objectStore("voices").delete(voice.id);
    }, "readwrite");
    await expect(service.load()).rejects.toThrow("保存データが不正");
    await webData((transaction) => { transaction.objectStore("metadata").put({ ...original, mode: "random" }, "library"); }, "readwrite");
    await expect(service.setMode("all")).rejects.toThrow("保存データが不正");
    select(webAsset("second.mp3"));
    await expect(service.importVoices()).rejects.toThrow("保存データが不正");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picked-second.mp3");
    await webData((transaction) => {
      const get = transaction.objectStore("metadata").get("library");
      get.onsuccess = () => expect(get.result.mode).toBe("random");
    });
  });

  it("merges metadata changes from independent service instances inside write transactions", async () => {
    select(webAsset("first.mp3"));
    await service.importVoices();
    const [voice] = (await service.load()).voices;
    vi.resetModules();
    const other = (await import("./voiceStorageService")).voiceStorageService;
    await Promise.all([service.rename(voice.id, "Latest"), other.setMode("all")]);
    expect(await service.load()).toMatchObject({ mode: "all", voices: [{ name: "Latest" }] });
  });
});

describe.each(["android", "web"])("%s voice folders", (platform) => {
  beforeEach(() => { mocks.platform.OS = platform; });

  function folderAsset(name: string, data = "audio") {
    return platform === "web" ? webAsset(name, data) : asset(name, data);
  }

  it.each([1, 2])("loads version %i without writing and persists version 3 only on the next change", async (version) => {
    const legacyVoice = { id: "voice-legacy", name: "Original name", originalName: "original.mp3", fileName: "voice-legacy.mp3", size: 5, mimeType: "audio/mpeg" };
    const legacySecond = { ...legacyVoice, id: "voice-second", fileName: "voice-second.mp3", name: "Second", originalName: "second.mp3" };
    const folders = version === 1 ? [] : [{ id: "folder-existing", name: "Existing" }];
    const scope = version === 1 ? "all" : "folder-existing";
    const expectedVoices = [{ ...legacyVoice, folderIds: version === 1 ? [] : ["folder-existing"] }, { ...legacySecond, folderIds: [] }];
    const legacy = version === 1 ? { version, mode: "all", voices: [legacyVoice, legacySecond] }
      : { version, mode: "all", folders, scope, voices: [{ ...legacyVoice, folderId: "folder-existing" }, { ...legacySecond, folderId: null }] };
    if (platform === "web") {
      await service.load();
      await webData((transaction) => {
        transaction.objectStore("metadata").put(legacy, "library");
        transaction.objectStore("voices").put(new Blob(["audio"], { type: "audio/mpeg" }), legacyVoice.id);
        transaction.objectStore("voices").put(new Blob(["other"], { type: "audio/mpeg" }), legacySecond.id);
      }, "readwrite");
    } else {
      nativeFiles.set(current, JSON.stringify(legacy));
      nativeFiles.set(`${directory}${legacyVoice.fileName}`, "audio");
      nativeFiles.set(`${directory}${legacySecond.fileName}`, "other");
    }
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    const loaded = await service.load();
    expect(loaded).toMatchObject({ mode: "all", folders, scope, voices: expectedVoices.map(({ id, name, originalName, size, folderIds }) => ({ id, name, originalName, size, folderIds })) });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    await service.setScope("unfiled");
    expect((await service.load()).voices).toEqual(loaded.voices);
    if (platform === "web") {
      await webData((transaction) => {
        const get = transaction.objectStore("metadata").get("library");
        get.onsuccess = () => expect(get.result).toEqual({ version: 3, mode: "all", folders, scope: "unfiled", voices: expectedVoices });
      });
    } else {
      expect(JSON.parse(nativeFiles.get(current)!)).toEqual({ version: 3, mode: "all", folders, scope: "unfiled", voices: expectedVoices });
    }
    expect(mocks.copy).not.toHaveBeenCalled();
    for (const [index, voice] of loaded.voices.entries()) {
      expect(platform === "web" ? await blobs.get(voice.uri)!.text() : nativeFiles.get(voice.uri)).toBe(["audio", "other"][index]);
    }
  });

  it("persists folders, memberships, names, repeat and selected scope across restarts", async () => {
    const folder = await service.createFolder("  Morning  ");
    expect(folder.name).toBe("Morning");
    await expect(service.createFolder("  ＭＯＲＮＩＮＧ ")).rejects.toThrow("同じ名前");
    await expect(service.createFolder("  ")).rejects.toThrow("入力");
    await expect(service.createFolder("x".repeat(101))).rejects.toThrow("100文字");
    const other = await service.createFolder("Evening");
    await expect(service.renameFolder(other.id, "MORNING")).rejects.toThrow("同じ名前");
    await service.renameFolder(folder.id, "Morning");
    select(folderAsset("first.mp3", "original audio"));
    await service.importVoices(folder.id);
    const [voice] = (await service.load()).voices;
    await service.setVoiceFolders(voice.id, [folder.id, other.id]);
    await service.renameFolder(folder.id, "  Training  ");
    await service.setMode("all");
    await service.setScope(folder.id);
    vi.resetModules();
    ({ voiceStorageService: service } = await import("./voiceStorageService"));
    const loaded = await service.load();
    expect(loaded).toMatchObject({ mode: "all", scope: folder.id, folders: [{ ...folder, name: "Training" }, other], voices: [{
      id: voice.id, folderIds: [folder.id, other.id], originalName: "first.mp3", size: "original audio".length,
    }] });
    expect(platform === "web" ? await blobs.get(loaded.voices[0].uri)!.text() : nativeFiles.get(loaded.voices[0].uri)).toBe("original audio");
  });

  it("moves and removes folder membership with metadata only and preserves the selected scope and all audio", async () => {
    const folder = await service.createFolder("Morning");
    const other = await service.createFolder("Evening");
    select(folderAsset("first.mp3", "first"));
    await service.importVoices(folder.id);
    select(folderAsset("second.mp3", "second"));
    await service.importVoices(other.id);
    select(folderAsset("third.mp3", "third"));
    await service.importVoices();
    select(folderAsset("fourth.mp3", "fourth"));
    await service.importVoices(folder.id);
    const original = await service.load();
    const [first, second, third, fourth] = original.voices;
    mocks.copy.mockClear();
    vi.mocked(URL.createObjectURL).mockClear();
    vi.mocked(URL.revokeObjectURL).mockClear();
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    const add = vi.spyOn(IDBObjectStore.prototype, "add");
    await service.setScope(folder.id);
    await service.move(first.id, 1, folder.id);
    expect((await service.load()).voices).toEqual([fourth, second, third, first]);
    await service.setVoiceFolders(third.id, [folder.id, other.id]);
    await service.setVoiceFolders(second.id, []);
    expect((await service.load()).voices.map(({ folderIds }) => folderIds)).toEqual([[folder.id], [], [folder.id, other.id], [folder.id]]);
    await service.removeFolder(other.id);
    expect((await service.load()).scope).toBe(folder.id);
    expect((await service.load()).voices.find((voice) => voice.id === third.id)?.folderIds).toEqual([folder.id]);
    await service.removeFolder(folder.id);
    expect(await service.load()).toEqual({ folders: [], scope: "unfiled", mode: "one",
      voices: [fourth, second, third, first].map((voice) => ({ ...voice, folderIds: [] })) });
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(put.mock.contexts.every((store) => (store as IDBObjectStore).name === "metadata")).toBe(true);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    for (const [index, voice] of original.voices.entries()) {
      expect(platform === "web" ? await blobs.get(voice.uri)!.text() : nativeFiles.get(voice.uri)).toBe(["first", "second", "third", "fourth"][index]);
    }
    if (platform === "web") await webData((transaction) => {
      const count = transaction.objectStore("voices").count();
      count.onsuccess = () => expect(count.result).toBe(4);
    });
  });

  it("rejects invalid folder targets and scopes without changing existing metadata", async () => {
    select(folderAsset("first.mp3"));
    await service.importVoices();
    const original = await service.load();
    await expect(service.setVoiceFolders(original.voices[0].id, ["folder-missing"])).rejects.toThrow("フォルダが見つかりません");
    await expect(service.setVoiceFolders("voice-missing", [])).rejects.toThrow("ボイスが見つかりません");
    await expect(service.setScope("folder-missing")).rejects.toThrow("フォルダが見つかりません");
    await expect(service.renameFolder("folder-missing", "New")).rejects.toThrow("フォルダが見つかりません");
    await expect(service.removeFolder("folder-missing")).rejects.toThrow("フォルダが見つかりません");
    await expect(service.move(original.voices[0].id, 1, "folder-missing")).rejects.toThrow("フォルダが見つかりません");
    expect(await service.load()).toEqual(original);
  });

  it("takes a membership snapshot before queued work and isolates returned arrays", async () => {
    const folder = await service.createFolder("Morning");
    const other = await service.createFolder("Evening");
    select(folderAsset("first.mp3"));
    await service.importVoices();
    const [voice] = (await service.load()).voices;
    const memberships = [folder.id];
    const saving = service.setVoiceFolders(voice.id, memberships);
    memberships.push(other.id);
    await saving;
    const loaded = await service.load();
    expect(loaded.voices[0].folderIds).toEqual([folder.id]);
    loaded.voices[0].folderIds.push("folder-missing");
    expect((await service.load()).voices[0]).toEqual({ ...voice, folderIds: [folder.id] });
    await service.setVoiceFolders(voice.id, [folder.id, other.id]);
    expect((await service.load()).voices[0]).toEqual({ ...voice, folderIds: [folder.id, other.id] });
  });

  it("rejects malformed, duplicate and missing memberships atomically without notifying or writing", async () => {
    const folder = await service.createFolder("Morning");
    const other = await service.createFolder("Evening");
    select(folderAsset("first.mp3"));
    await service.importVoices(folder.id);
    const original = await service.load();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    mocks.write.mockClear();
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    for (const memberships of [null, undefined, folder.id, [null], [123], [other.id, other.id], new Array(1)]) {
      await expect(service.setVoiceFolders(original.voices[0].id, memberships as string[])).rejects.toThrow("保存データが不正");
    }
    await expect(service.setVoiceFolders(original.voices[0].id, [other.id, "folder-missing"])).rejects.toThrow("フォルダが見つかりません");
    expect(await service.load()).toEqual(original);
    expect(listener).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("keeps all memberships and audio when a membership write cannot commit", async () => {
    const folder = await service.createFolder("Morning");
    const other = await service.createFolder("Evening");
    select(folderAsset("first.mp3", "original audio"));
    await service.importVoices(folder.id);
    await service.setScope(folder.id);
    const original = await service.load();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    mocks.copy.mockClear();
    vi.mocked(URL.createObjectURL).mockClear();
    vi.mocked(URL.revokeObjectURL).mockClear();
    let restore: (() => void) | undefined;
    if (platform === "web") {
      const put = IDBObjectStore.prototype.put;
      const abort = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
        const request = put.call(this, value, key);
        request.addEventListener("success", () => this.transaction.abort(), { once: true });
        return request;
      });
      restore = () => abort.mockRestore();
    } else mocks.write.mockRejectedValueOnce(new Error("disk full"));
    await expect(service.setVoiceFolders(original.voices[0].id, [folder.id, other.id])).rejects.toThrow();
    restore?.();
    expect(await service.load()).toEqual(original);
    expect(listener).not.toHaveBeenCalled();
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(platform === "web" ? await blobs.get(original.voices[0].uri)!.text() : nativeFiles.get(original.voices[0].uri)).toBe("original audio");
    await service.setVoiceFolders(original.voices[0].id, [folder.id, other.id]);
    expect(await service.load()).toEqual({ ...original, voices: [{ ...original.voices[0], folderIds: [folder.id, other.id] }] });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("keeps the requested destination when the selected scope changes while picking", async () => {
    const folder = await service.createFolder("Morning");
    const other = await service.createFolder("Evening");
    await service.setScope(folder.id);
    const picked = deferred<{ canceled: false; assets: DocumentPickerAsset[] }>();
    mocks.pick.mockReturnValueOnce(picked.promise);
    const importing = service.importVoices(folder.id);
    expect(mocks.pick).toHaveBeenCalledOnce();
    await service.setScope(other.id);
    picked.resolve({ canceled: false, assets: [folderAsset("first.mp3")] });
    expect(await importing).toEqual({ added: 1, failed: 0, canceled: false });
    expect(await service.load()).toMatchObject({ scope: other.id, voices: [{ folderIds: [folder.id] }] });
  });

  it("rejects a deleted picker destination before saving any audio and releases the import lock", async () => {
    const folder = await service.createFolder("Morning");
    await service.setScope(folder.id);
    const picked = deferred<{ canceled: false; assets: DocumentPickerAsset[] }>();
    mocks.pick.mockReturnValueOnce(picked.promise);
    const importing = service.importVoices(folder.id);
    await service.removeFolder(folder.id);
    const add = vi.spyOn(IDBObjectStore.prototype, "add");
    picked.resolve({ canceled: false, assets: [folderAsset("first.mp3")] });
    await expect(importing).rejects.toThrow("フォルダが見つかりません");
    expect(await service.load()).toEqual({ voices: [], mode: "one", folders: [], scope: "unfiled" });
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    if (platform === "web") expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picked-first.mp3");
    select(folderAsset("retry.mp3"));
    expect((await service.importVoices()).added).toBe(1);
  });

  it("rolls back failed folder removal including memberships, selection, URLs and bytes", async () => {
    const folder = await service.createFolder("Morning");
    const other = await service.createFolder("Evening");
    select(folderAsset("first.mp3", "original audio"));
    await service.importVoices(folder.id);
    await service.setVoiceFolders((await service.load()).voices[0].id, [folder.id, other.id]);
    await service.setScope(folder.id);
    const original = await service.load();
    vi.mocked(URL.revokeObjectURL).mockClear();
    let restore: (() => void) | undefined;
    if (platform === "web") {
      const put = IDBObjectStore.prototype.put;
      const abort = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
        const request = put.call(this, value, key);
        request.addEventListener("success", () => this.transaction.abort(), { once: true });
        return request;
      });
      restore = () => abort.mockRestore();
    } else {
      const move = mocks.move.getMockImplementation()!;
      mocks.move.mockImplementationOnce(move).mockRejectedValueOnce(new Error("disk full"));
    }
    await expect(service.removeFolder(folder.id)).rejects.toThrow();
    restore?.();
    expect(await service.load()).toEqual(original);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(platform === "web" ? await blobs.get(original.voices[0].uri)!.text() : nativeFiles.get(original.voices[0].uri)).toBe("original audio");
    await service.removeFolder(folder.id);
    expect(await service.load()).toEqual({ ...original, folders: [other], scope: "unfiled", voices: [{ ...original.voices[0], folderIds: [other.id] }] });
  });
});
