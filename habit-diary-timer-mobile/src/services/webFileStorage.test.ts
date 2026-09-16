import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { WebMediaFile } from "./webFileStorage";

const legacyKey = "nino-room-web-files-v2";
let source: Map<string, string>;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
let createUrl: MockInstance<typeof URL.createObjectURL>;
let revokeUrl: MockInstance<typeof URL.revokeObjectURL>;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  source = new Map();
  storage = {
    getItem: vi.fn((key: string) => source.get(key) ?? null),
    // Saving media into localStorage is forbidden, even for small uploads.
    setItem: vi.fn(() => { throw new DOMException("Storage quota exceeded", "QuotaExceededError"); }),
    removeItem: vi.fn((key: string) => { source.delete(key); }),
  };
  vi.stubGlobal("localStorage", storage);
  let sequence = 0;
  createUrl = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:test-${sequence++}`);
  revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function backend() {
  return (await import("./webFileStorage")).webFileStorage;
}

function file(name: string, contents = "media", purpose: WebMediaFile["purpose"] = "training"): WebMediaFile {
  const blob = new Blob([contents], { type: "video/mp4" });
  return { name, blob, size: blob.size, purpose, mimeType: "video/mp4" };
}

function legacy(name: string, contents = "legacy", purpose: WebMediaFile["purpose"] = "training") {
  return { name, purpose, size: contents.length, uri: `data:video/mp4;base64,${btoa(contents)}` };
}

describe("IndexedDB media storage", () => {
  it("stores a binary file larger than localStorage quota and reads it after a reload", async () => {
    const service = await backend();
    const bytes = new Uint8Array(6 * 1024 * 1024 + 17).fill(73);
    bytes[bytes.length - 1] = 29;
    const blob = new Blob([bytes], { type: "video/mp4" });
    await service.put({ name: "large.mp4", purpose: "training", size: blob.size, mimeType: blob.type, blob });
    expect(storage.setItem).not.toHaveBeenCalled();
    vi.resetModules();
    const reloaded = await backend();
    expect(await reloaded.list()).toEqual([{ name: "large.mp4", purpose: "training", size: bytes.length, uri: "blob:test-0" }]);
    const persisted = new Uint8Array(await (await reloaded.getBlob({ name: "large.mp4", purpose: "training" })).arrayBuffer());
    expect(persisted.length).toBe(bytes.length);
    expect(persisted[0]).toBe(73);
    expect(persisted[persisted.length - 1]).toBe(29);
  });

  it("migrates legacy data only once, keeps Blob bytes, and never writes localStorage", async () => {
    source.set(legacyKey, JSON.stringify([legacy("old.mp4", "old media")]));
    const service = await backend();
    const [stored] = await service.list();
    expect(stored).toMatchObject({ name: "old.mp4", size: 9 });
    expect(await (await service.getBlob(stored)).text()).toBe("old media");
    expect(source.has(legacyKey)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    vi.resetModules();
    const reloaded = await backend();
    expect((await reloaded.list()).map((item) => item.name)).toEqual(["old.mp4"]);
    expect(await (await reloaded.getBlob(stored)).text()).toBe("old media");
  });

  it("keeps the legacy source if migration requests succeed but the transaction aborts", async () => {
    const original = JSON.stringify([legacy("old.mp4")]);
    source.set(legacyKey, original);
    const put = IDBObjectStore.prototype.put;
    const abort = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = put.call(this, value, key);
      request.addEventListener("success", () => this.transaction.abort(), { once: true });
      return request;
    });
    const service = await backend();
    await expect(service.ensureMigrated()).rejects.toThrow("aborted");
    expect(source.get(legacyKey)).toBe(original);
    expect(storage.removeItem).not.toHaveBeenCalled();
    abort.mockRestore();
    await service.ensureMigrated();
    expect((await service.list()).map((item) => item.name)).toEqual(["old.mp4"]);
  });

  it.each([
    "{broken",
    JSON.stringify({ files: [] }),
    JSON.stringify([{ ...legacy("old.mp4"), uri: "data:video/mp4;base64,invalid!" }]),
    JSON.stringify([{ ...legacy("old.mp4"), size: 900 }]),
    JSON.stringify([legacy("old.mp4"), legacy("old.mp4")]),
  ])("rejects corrupted legacy data without treating it as empty storage (%#)", async (corrupt) => {
    source.set(legacyKey, corrupt);
    const service = await backend();
    await expect(service.list()).rejects.toThrow("格納ファイルのデータが不正です。");
    expect(source.get(legacyKey)).toBe(corrupt);
    expect(storage.removeItem).not.toHaveBeenCalled();
    source.set(legacyKey, JSON.stringify([legacy("fixed.mp4")]));
    expect((await service.list()).map((item) => item.name)).toEqual(["fixed.mp4"]);
  });

  it("does not resurrect old files after reset when legacy cleanup keeps failing", async () => {
    source.set(legacyKey, JSON.stringify([legacy("old.mp4")]));
    storage.removeItem.mockImplementation(() => { throw new Error("cleanup blocked"); });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = await backend();
    expect(await service.list()).toHaveLength(1);
    await service.clear();
    expect(source.has(legacyKey)).toBe(true);
    vi.resetModules();
    expect(await (await backend()).list()).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("keeps source URLs stable and handles identical Blobs under separate filenames", async () => {
    const service = await backend();
    const first = file("first.mp4");
    const second = { ...first, name: "second.mp4" };
    await service.put(first);
    await service.put(second);
    const initial = await service.list();
    const firstStored = initial.find((item) => item.name === first.name)!;
    const secondStored = initial.find((item) => item.name === second.name)!;
    expect(firstStored.uri).not.toBe(secondStored.uri);
    expect(await service.list()).toEqual(initial);
    expect(createUrl).toHaveBeenCalledTimes(2);
    await service.remove(firstStored);
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(firstStored.uri);
    expect(await service.list()).toEqual([secondStored]);
    expect(await (await service.getBlob(secondStored)).text()).toBe("media");
  });

  it("revokes a replaced file URL only after its new Blob is committed", async () => {
    const service = await backend();
    await service.put(file("same.mp4", "old"));
    const [previous] = await service.list();
    const quota = vi.spyOn(IDBObjectStore.prototype, "add").mockImplementationOnce(() => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    });
    await expect(service.put(file("same.mp4", "new"))).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(await (await service.getBlob(previous)).text()).toBe("old");
    expect(await service.list()).toEqual([previous]);
    expect(revokeUrl).not.toHaveBeenCalled();
    quota.mockRestore();
    await service.put(file("same.mp4", "new"));
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(previous.uri);
    const [replacement] = await service.list();
    expect(replacement.uri).not.toBe(previous.uri);
    expect(await (await service.getBlob(replacement)).text()).toBe("new");
  });

  it("serializes concurrent imports and deletes without dropping unrelated files", async () => {
    const service = await backend();
    await Promise.all(Array.from({ length: 20 }, (_, index) => service.put(file(`${index}.mp4`))));
    expect(await service.list()).toHaveLength(20);
    await Promise.all([
      service.remove({ name: "0.mp4", purpose: "training" }),
      service.put(file("new.mp4")),
      service.remove({ name: "1.mp4", purpose: "training" }),
    ]);
    const names = (await service.list()).map((item) => item.name);
    expect(names).toHaveLength(19);
    expect(names).not.toContain("0.mp4");
    expect(names).not.toContain("1.mp4");
    expect(names).toContain("new.mp4");
  });

  it("preserves declared media MIME type when an archive supplies an untyped Blob", async () => {
    const service = await backend();
    const blob = new Blob(["archive bytes"]);
    await service.put({ name: "video.mp4", purpose: "training", size: blob.size, mimeType: "video/mp4", blob });
    const stored = await service.getBlob({ name: "video.mp4", purpose: "training" });
    expect(stored.type).toBe("video/mp4");
    expect(await stored.text()).toBe("archive bytes");
  });
});

describe("atomic file restoration", () => {
  it("keeps old files visible during staging and rolls activation back without copying old Blobs", async () => {
    const service = await backend();
    await service.put(file("old.mp4", "original"));
    const oldFiles = await service.list();
    const restore = await service.prepareRestore([file("new.mp4", "restored")]);
    expect(await service.list()).toEqual(oldFiles);
    await restore.activate();
    const restored = await service.list();
    expect(restored.map((item) => item.name)).toEqual(["new.mp4"]);
    await restore.rollback();
    expect(await service.list()).toEqual(oldFiles);
    expect(await (await service.getBlob(oldFiles[0])).text()).toBe("original");
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(restored[0].uri);
    await restore.rollback();
    await restore.finalize();
    expect(await service.list()).toEqual(oldFiles);
  });

  it("finalizes the active generation and removes old URLs after commit", async () => {
    const service = await backend();
    await service.put(file("old.mp4"));
    const [oldFile] = await service.list();
    const restore = await service.prepareRestore([file("new.mp4")]);
    await restore.activate();
    const newFiles = await service.list();
    expect(revokeUrl).not.toHaveBeenCalled();
    await restore.finalize();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(oldFile.uri);
    expect(await service.list()).toEqual(newFiles);
    await restore.rollback();
    expect(await service.list()).toEqual(newFiles);
    await service.put(file("another.mp4"));
    expect(await service.list()).toHaveLength(2);
  });

  it("preserves previous data when staging fails midway", async () => {
    const service = await backend();
    await service.put(file("old.mp4"));
    const oldFiles = await service.list();
    const add = IDBObjectStore.prototype.add;
    let writes = 0;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, value, key) {
      if (++writes === 2) throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      return add.call(this, value, key);
    });
    await expect(service.prepareRestore([file("new1.mp4"), file("new2.mp4")])).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(await service.list()).toEqual(oldFiles);
    expect(revokeUrl).not.toHaveBeenCalled();
  });

  it("does not switch generations if activation fails, and permits a retry", async () => {
    const service = await backend();
    await service.put(file("old.mp4"));
    const oldFiles = await service.list();
    const restore = await service.prepareRestore([file("new.mp4")]);
    const failed = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    });
    await expect(restore.activate()).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(await service.list()).toEqual(oldFiles);
    failed.mockRestore();
    await restore.activate();
    expect((await service.list()).map((item) => item.name)).toEqual(["new.mp4"]);
    await restore.finalize();
  });

  it("rejects mutations until an active restore is finalized or rolled back", async () => {
    const service = await backend();
    await service.put(file("old.mp4"));
    const restore = await service.prepareRestore([file("new.mp4")]);
    await restore.activate();
    await expect(service.put(file("another.mp4"))).rejects.toThrow("ファイルを処理中です。");
    await expect(service.remove({ name: "new.mp4", purpose: "training" })).rejects.toThrow("ファイルを処理中です。");
    await expect(service.clear()).rejects.toThrow("ファイルを処理中です。");
    await restore.rollback();
    await service.clear();
    expect(await service.list()).toEqual([]);
  });

  it("discards an unactivated restore and rejects duplicate filenames before staging", async () => {
    const service = await backend();
    await service.put(file("old.mp4"));
    const oldFiles = await service.list();
    await expect(service.prepareRestore([file("duplicate.mp4"), file("duplicate.mp4")])).rejects.toThrow("格納ファイルのデータが不正です。");
    const restore = await service.prepareRestore([file("new.mp4")]);
    await restore.finalize();
    await restore.activate();
    expect(await service.list()).toEqual(oldFiles);
  });

  it("supports an empty restore and keeps equal names from different rooms independent", async () => {
    const service = await backend();
    await service.put(file("same.mp4", "training", "training"));
    await service.put(file("same.mp4", "punishment", "punishment"));
    expect(await (await service.getBlob({ name: "same.mp4", purpose: "training" })).text()).toBe("training");
    expect(await (await service.getBlob({ name: "same.mp4", purpose: "punishment" })).text()).toBe("punishment");
    const restore = await service.prepareRestore([]);
    await restore.activate();
    expect(await service.list()).toEqual([]);
    await restore.rollback();
    expect(await service.list()).toHaveLength(2);
  });
});

describe("legacy backup decoding", () => {
  it("decodes base64 in bounded chunks and validates the declared size", async () => {
    const { base64ToBlob } = await import("./webFileStorage");
    const original = "abcdefghijklmnop".repeat(20_000);
    const encoded = btoa(original);
    const decode = vi.spyOn(globalThis, "atob");
    const blob = base64ToBlob(encoded, "video/mp4", original.length);
    expect(await blob.text()).toBe(original);
    expect(blob.type).toBe("video/mp4");
    expect(decode.mock.calls.length).toBeGreaterThan(1);
    expect(decode.mock.calls.every(([chunk]) => chunk.length <= 64 * 1024)).toBe(true);
    expect(() => base64ToBlob(encoded, "video/mp4", 1)).toThrow("格納ファイルのデータが不正です。");
  });
});
