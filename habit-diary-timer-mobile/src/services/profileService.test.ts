import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProfile, profileService, type ProfileSettings } from "./profileService";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("@/schemas/storage", () => import("../schemas/storage"));
vi.mock("@/utils/storageValidation", () => import("../utils/storageValidation"));

const profileKey = "nino-room:profile";
const existingProfile: ProfileSettings = {
  sexualExperience: "yes", romanceExperience: "no", analExperience: "no",
  nippleExperience: "yes", exposureExperience: "no", specialFetish: "yes",
  erectionLengthCm: "15", masturbationPerWeek: "3", masturbationMinutes: "10",
  tissueCount: "2", weaknesses: ["previous"], ninoOutfit: "custom", ninoVoiceStyle: "soft",
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
});

describe("saving profile weaknesses", () => {
  it("updates only weaknesses using the latest stored profile", async () => {
    await profileService.saveWeaknesses(["selected"]);

    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(profileKey);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
      profileKey, JSON.stringify({ ...existingProfile, weaknesses: ["selected"] }),
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
    expect(await loading).toEqual({ ...existingProfile, weaknesses: ["selected"] });
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
    expect(await loading).toEqual({ ...existingProfile, weaknesses: ["selected"] });
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
      ...existingProfile, weaknesses: ["draft"], ninoOutfit: "changed",
    });
    expect(JSON.parse(storage.setItem.mock.calls[1][1])).toEqual({
      ...existingProfile, weaknesses: ["selected"], ninoOutfit: "changed",
    });
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(profileKey);
  });
});
