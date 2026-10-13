import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProfile, profileService, type ProfileSettings } from "./profileService";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
const files = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn(), pickImageAndStore: vi.fn(), withExclusiveFiles: vi.fn() }));
vi.mock("./fileStorageService", () => ({ fileStorageService: files }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("@/schemas/storage", () => import("../schemas/storage"));
vi.mock("@/utils/storageValidation", () => import("../utils/storageValidation"));

const profileKey = "nino-room:profile";
const existingProfile: ProfileSettings = {
  ...defaultProfile,
  sexualExperience: "yes", romanceExperience: "no", analExperience: "no",
  nippleExperience: "yes", exposureExperience: "no", specialFetish: "yes",
  erectionLengthCm: "15", masturbationPerWeek: "3", masturbationMinutes: "10",
  tissueCount: "2", weaknesses: ["previous"], weaknessCandidates: ["previous"], ninoOutfit: "custom", ninoVoiceStyle: "soft",
};
let storedProfile: string | null;

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  storedProfile = JSON.stringify(existingProfile);
  storage.getItem.mockImplementation(async () => storedProfile);
  storage.setItem.mockImplementation(async (_key: string, value: string) => { storedProfile = value; });
  storage.removeItem.mockImplementation(async () => { storedProfile = null; });
  files.list.mockResolvedValue([]);
  files.remove.mockResolvedValue(undefined);
  files.withExclusiveFiles.mockImplementation((operation) => operation());
});

describe("saving profile weaknesses", () => {
  it("updates only weaknesses using the latest stored profile", async () => {
    await profileService.saveWeaknesses(["selected"]);

    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(profileKey);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
      profileKey, JSON.stringify({ ...existingProfile, weaknesses: ["selected"], weaknessCandidates: ["previous", "selected"] }),
    );
  });

  it("clears all selections without resetting other profile fields", async () => {
    expect(await profileService.saveWeaknesses([])).toEqual([]);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
      profileKey, JSON.stringify({ ...existingProfile, weaknesses: [] }),
    );
  });

  it("snapshots the input before loading and returns an independent deduplicated array", async () => {
    const input = ["first", "second", "first"];
    const pending = profileService.saveWeaknesses(input);
    input.push("later");
    const result = await pending;

    expect(result).toEqual(["first", "second"]);
    expect(result).not.toBe(input);
    expect(input).toEqual(["first", "second", "first", "later"]);
    result.push("returned-array-only");
    expect(JSON.parse(storage.setItem.mock.calls[0][1]).weaknesses).toEqual(["first", "second"]);
    expect(input).not.toContain("returned-array-only");
  });

  it("avoids a write when normalized selections are unchanged while returning a fresh array", async () => {
    const input = ["previous", "previous"];
    const result = await profileService.saveWeaknesses(input);

    expect(result).toEqual(["previous"]);
    expect(result).not.toBe(input);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("does not create an empty profile for an unchanged empty selection", async () => {
    storage.getItem.mockResolvedValue(null);
    const result = await profileService.saveWeaknesses([]);

    expect(result).toEqual([]);
    expect(result).not.toBe(defaultProfile.weaknesses);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("propagates a read failure without writing a replacement profile", async () => {
    const failure = new Error("read failed");
    storage.getItem.mockRejectedValue(failure);

    await expect(profileService.saveWeaknesses(["selected"])).rejects.toBe(failure);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("propagates a write failure without attempting another write or deletion", async () => {
    const failure = new Error("write failed");
    storage.setItem.mockRejectedValue(failure);

    await expect(profileService.saveWeaknesses(["selected"])).rejects.toBe(failure);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("waits for an in-flight weakness save before another screen loads the profile", async () => {
    const started = deferred();
    const finish = deferred();
    storage.setItem.mockImplementationOnce(async (_key: string, value: string) => {
      started.resolve();
      await finish.promise;
      storedProfile = value;
    });
    const saving = profileService.saveWeaknesses(["selected"]);
    await started.promise;
    const loading = profileService.load();
    await Promise.resolve();
    const readsBeforeSaveFinished = storage.getItem.mock.calls.length;

    finish.resolve();
    await saving;
    expect(await loading).toEqual({ ...existingProfile, weaknesses: ["selected"], weaknessCandidates: ["previous", "selected"] });
    expect(readsBeforeSaveFinished).toBe(1);
  });

  it("continues queued saves and loads after the preceding mutation fails", async () => {
    const started = deferred();
    const finish = deferred();
    const failure = new Error("first write failed");
    storage.setItem.mockImplementationOnce(async () => {
      started.resolve();
      await finish.promise;
    });
    const saving = profileService.saveWeaknesses(["failed"]);
    const rejected = expect(saving).rejects.toBe(failure);
    await started.promise;
    const retrying = profileService.saveWeaknesses(["selected"]);
    const loading = profileService.load();

    finish.reject(failure);
    await rejected;
    expect(await retrying).toEqual(["selected"]);
    expect(await loading).toEqual({ ...existingProfile, weaknesses: ["selected"], weaknessCandidates: ["previous", "selected"] });
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it("serializes full saves, weakness updates and clear in request order", async () => {
    const started = deferred();
    const finish = deferred();
    storage.setItem.mockImplementationOnce(async (_key: string, value: string) => {
      started.resolve();
      await finish.promise;
      storedProfile = value;
    });
    const draft = { ...existingProfile, weaknesses: ["draft"], ninoOutfit: "changed" };
    const saving = profileService.save(draft);
    draft.weaknesses.push("later");
    draft.ninoOutfit = "later";
    await started.promise;
    const updating = profileService.saveWeaknesses(["selected"]);
    const clearing = profileService.clear();
    const loading = profileService.load();
    await Promise.resolve();
    const writesBeforeFirstFinished = storage.setItem.mock.calls.length;
    const clearsBeforeFirstFinished = storage.removeItem.mock.calls.length;

    finish.resolve();
    await Promise.all([saving, updating, clearing]);
    expect(await loading).toEqual(defaultProfile);
    expect(writesBeforeFirstFinished).toBe(1);
    expect(clearsBeforeFirstFinished).toBe(0);
    expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({
      ...existingProfile, weaknesses: ["draft"], weaknessCandidates: ["previous", "draft"], ninoOutfit: "changed",
    });
    expect(JSON.parse(storage.setItem.mock.calls[1][1])).toEqual({
      ...existingProfile, weaknesses: ["selected"], weaknessCandidates: ["previous", "draft", "selected"], ninoOutfit: "changed",
    });
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(profileKey);
  });
});

describe("independent profile candidates", () => {
  const candidateKinds = [
    { method: "addWeaknessCandidate", key: "weaknessCandidates", value: "manual weakness" },
    { method: "addFavoriteCandidate", key: "favoriteCandidateIds", value: "manual-v1:Alex" },
  ] as const;

  it("migrates old selections into candidates and retains them after deselection", async () => {
    const legacy: Partial<ProfileSettings> = { ...existingProfile, favoriteIds: ["old-id"], topFavoriteIds: ["old-id"] };
    delete legacy.weaknessCandidates;
    delete legacy.favoriteCandidateIds;
    storedProfile = JSON.stringify(legacy);

    expect(await profileService.load()).toMatchObject({ weaknessCandidates: ["previous"], favoriteCandidateIds: ["old-id"] });
    await profileService.saveWeaknesses([]);
    await profileService.patch({ favoriteIds: [] });
    expect(await profileService.load()).toMatchObject({
      weaknesses: [], topWeaknesses: [], favoriteIds: [], topFavoriteIds: [],
      weaknessCandidates: ["previous"], favoriteCandidateIds: ["old-id"],
    });
  });

  it("adds candidates without selecting or ranking them and treats duplicate additions as no-ops", async () => {
    await profileService.patch({ topWeaknesses: ["previous"], favoriteIds: ["selected-id"], topFavoriteIds: ["selected-id"] });
    storage.setItem.mockClear();

    await profileService.addWeaknessCandidate("manual weakness");
    await profileService.addFavoriteCandidate("manual-v1:Alex");
    const saved = await profileService.addWeaknessCandidate("manual weakness");
    await profileService.addFavoriteCandidate("manual-v1:Alex");
    expect(saved).toMatchObject({
      ...existingProfile, topWeaknesses: ["previous"], favoriteIds: ["selected-id"], topFavoriteIds: ["selected-id"],
      weaknessCandidates: ["previous", "manual weakness"], favoriteCandidateIds: ["selected-id", "manual-v1:Alex"],
    });
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    saved.weaknessCandidates.push("local-only");
    saved.favoriteCandidateIds.length = 0;
    expect(await profileService.load()).toMatchObject({
      weaknessCandidates: ["previous", "manual weakness"], favoriteCandidateIds: ["selected-id", "manual-v1:Alex"],
    });
  });

  it.each(candidateKinds)("keeps old data and allows retry after $method fails", async ({ method, key, value }) => {
    const previous = storedProfile;
    const failure = new Error("storage full");
    storage.setItem.mockRejectedValueOnce(failure);

    await expect(profileService[method](value)).rejects.toBe(failure);
    expect(storedProfile).toBe(previous);
    const saved = await profileService[method](value);
    expect(saved[key]).toContain(value);
    expect(saved).toMatchObject({ weaknesses: ["previous"], topWeaknesses: [], favoriteIds: [], topFavoriteIds: [] });
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each(candidateKinds)("does not replace existing data when $method cannot read it", async ({ method, value }) => {
    const failure = new Error("read failed");
    storage.getItem.mockRejectedValueOnce(failure);
    await expect(profileService[method](value)).rejects.toBe(failure);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each(["save", "baseline", "patch"] as const)("preserves candidates when an older %s draft is saved", async (method) => {
    const baseline = await profileService.load();
    const draft = { ...baseline, tissueCount: "8" };
    await Promise.all([
      profileService.addWeaknessCandidate("manual weakness"),
      profileService.addFavoriteCandidate("manual-v1:Alex"),
    ]);

    const saved = method === "patch" ? await profileService.patch(draft)
      : await profileService.save(draft, method === "baseline" ? baseline : undefined);
    expect(saved).toMatchObject({
      ...existingProfile, tissueCount: "8", weaknessCandidates: ["previous", "manual weakness"], favoriteCandidateIds: ["manual-v1:Alex"],
    });
  });

  it("queues candidate additions with snapshotted selection updates and later loads", async () => {
    const started = deferred();
    const finish = deferred();
    storage.setItem.mockImplementationOnce(async (_key: string, value: string) => {
      started.resolve();
      await finish.promise;
      storedProfile = value;
    });
    const adding = profileService.addWeaknessCandidate("first");
    await started.promise;
    const weaknessCandidates = ["second"];
    const favoriteCandidateIds = ["manual-v1:Alex"];
    const saving = profileService.patch({ weaknesses: [], weaknessCandidates, favoriteCandidateIds });
    weaknessCandidates.push("late");
    favoriteCandidateIds.length = 0;
    const addingFavorite = profileService.addFavoriteCandidate("manual-v1:Sam");
    const loading = profileService.load();
    await Promise.resolve();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    finish.resolve();
    await Promise.all([adding, saving, addingFavorite]);
    expect(await loading).toMatchObject({
      ...existingProfile, weaknesses: [], weaknessCandidates: ["previous", "first", "second"],
      favoriteCandidateIds: ["manual-v1:Alex", "manual-v1:Sam"],
    });
  });
});

describe("profile rankings and concurrent changes", () => {
  it("removes deselected weaknesses from rankings without limiting the full selection", async () => {
    const weaknesses = ["a", "b", "c", "d", "e", "f", "g"];
    await profileService.patch({ weaknesses, topWeaknesses: ["b", "a", "c", "d", "e"] });
    await profileService.saveWeaknesses(weaknesses.filter((item) => item !== "b"));
    expect(await profileService.load()).toMatchObject({
      weaknesses: ["a", "c", "d", "e", "f", "g"], topWeaknesses: ["a", "c", "d", "e"],
    });
  });

  it("merges only edited fields against the latest data rather than restoring a stale form", async () => {
    const baseline = await profileService.load();
    const draft = { ...baseline, tissueCount: "8" };
    await profileService.patch({ photoFileName: "new.png", favoriteIds: ["one", "two", "three", "four"], topFavoriteIds: ["four", "one"] });
    await profileService.saveWeaknesses(["new weakness"]);
    const saved = await profileService.save(draft, baseline);
    expect(saved).toMatchObject({
      tissueCount: "8", weaknesses: ["new weakness"], photoFileName: "new.png",
      favoriteIds: ["one", "two", "three", "four"], topFavoriteIds: ["four", "one"],
    });
    expect(await profileService.patch({ ninoOutfit: "updated" })).toMatchObject({ ...saved, ninoOutfit: "updated" });
  });

  it("snapshots queued ranked arrays and prunes only removed favorite IDs", async () => {
    const favoriteIds = ["a", "b", "c", "d"];
    const topFavoriteIds = ["d", "c", "a"];
    const saving = profileService.patch({ favoriteIds, topFavoriteIds });
    favoriteIds.push("late"); topFavoriteIds.reverse();
    expect(await saving).toMatchObject({ favoriteIds: ["a", "b", "c", "d"], topFavoriteIds: ["d", "c", "a"] });
    expect(await profileService.patch({ favoriteIds: ["a", "b", "d"] })).toMatchObject({ topFavoriteIds: ["d", "a"] });
  });
});

describe("profile photo ownership", () => {
  const previous = { name: "old.png", purpose: "profile" as const, uri: "file:///old.png", size: 8 };
  const next = { name: "new.png", purpose: "profile" as const, uri: "file:///new.png", size: 8 };

  beforeEach(() => {
    storedProfile = JSON.stringify({ ...existingProfile, photoFileName: previous.name });
    files.list.mockResolvedValue([previous]);
  });

  it("keeps the old attachment on chooser cancel and on profile write failure", async () => {
    files.pickImageAndStore.mockResolvedValueOnce(null);
    expect(await profileService.pickPhoto()).toBeNull();
    expect(await profileService.loadPhoto()).toEqual(previous);
    expect(storage.setItem).not.toHaveBeenCalled();
    files.pickImageAndStore.mockImplementationOnce(async (_purpose, commit) => commit(next));
    storage.setItem.mockRejectedValueOnce(new Error("storage full"));
    await expect(profileService.pickPhoto()).rejects.toThrow("storage full");
    expect(await profileService.loadPhoto()).toEqual(previous);
    expect(files.remove).not.toHaveBeenCalled();
  });

  it("commits the new stable reference before removing the old image and re-resolves its URI", async () => {
    files.list.mockResolvedValue([previous, next]);
    files.pickImageAndStore.mockImplementationOnce(async (_purpose, commit) => commit(next));
    files.remove.mockImplementationOnce(async () => {
      expect(JSON.parse(storedProfile!).photoFileName).toBe(next.name);
    });
    expect(await profileService.pickPhoto()).toEqual(next);
    expect(files.pickImageAndStore).toHaveBeenCalledWith("profile", expect.any(Function));
    expect(files.remove).toHaveBeenCalledExactlyOnceWith(previous);
    files.list.mockResolvedValue([{ ...next, uri: "blob:after-restart" }]);
    expect(await profileService.loadPhoto()).toEqual({ ...next, uri: "blob:after-restart" });
    expect(await profileService.load()).toMatchObject({ ...existingProfile, photoFileName: next.name });
  });

  it("does not delete the old image if clearing its reference fails", async () => {
    storage.setItem.mockRejectedValueOnce(new Error("storage full"));
    await expect(profileService.removePhoto()).rejects.toThrow("storage full");
    expect(files.remove).not.toHaveBeenCalled();
    expect(await profileService.loadPhoto()).toEqual(previous);
    await profileService.removePhoto();
    expect(files.remove).toHaveBeenCalledExactlyOnceWith(previous);
    expect((await profileService.load()).photoFileName).toBeNull();
  });

  it("does not undo committed metadata if old-photo cleanup fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      files.list.mockResolvedValue([previous, next]);
      files.remove.mockRejectedValueOnce(new Error("cleanup failed"));
      files.pickImageAndStore.mockImplementationOnce(async (_purpose, commit) => commit(next));
      expect(await profileService.pickPhoto()).toEqual(next);
      expect((await profileService.load()).photoFileName).toBe(next.name);
      expect(warn).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });

  it("returns null for a missing save-only backup attachment without modifying its stable reference", async () => {
    files.list.mockResolvedValue([]);
    expect(await profileService.loadPhoto()).toBeNull();
    expect((await profileService.load()).photoFileName).toBe(previous.name);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
