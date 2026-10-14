import AsyncStorage from "@react-native-async-storage/async-storage";
import { profileSettingsSchema } from "@/schemas/storage";
import { parseStoredJson } from "@/utils/storageValidation";
import { fileStorageService, type StoredFile } from "./fileStorageService";

const PROFILE_KEY = "nino-room:profile";

export type ProfileExperience = "unknown" | "yes" | "no";

export type ProfileSettings = {
  sexualExperience: ProfileExperience;
  romanceExperience: ProfileExperience;
  analExperience: ProfileExperience;
  nippleExperience: ProfileExperience;
  exposureExperience: ProfileExperience;
  specialFetish: ProfileExperience;
  erectionLengthCm: string;
  masturbationPerWeek: string;
  masturbationMinutes: string;
  tissueCount: string;
  weaknesses: string[];
  weaknessCandidates: string[];
  topWeaknesses: string[];
  favoriteIds: string[];
  favoriteCandidateIds: string[];
  topFavoriteIds: string[];
  photoFileName: string | null;
  ninoOutfit: string;
  ninoVoiceStyle: string;
};

export const defaultProfile: ProfileSettings = {
  sexualExperience: "unknown",
  romanceExperience: "unknown",
  analExperience: "unknown",
  nippleExperience: "unknown",
  exposureExperience: "unknown",
  specialFetish: "unknown",
  erectionLengthCm: "",
  masturbationPerWeek: "",
  masturbationMinutes: "",
  tissueCount: "",
  weaknesses: [],
  weaknessCandidates: [],
  topWeaknesses: [],
  favoriteIds: [],
  favoriteCandidateIds: [],
  topFavoriteIds: [],
  photoFileName: null,
  ninoOutfit: "default",
  ninoVoiceStyle: "queen",
};

let pendingOperation: Promise<void> = Promise.resolve();

function queueProfileOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingOperation.then(operation);
  // Recover the queue without swallowing the error returned to this caller.
  pendingOperation = result.then(() => undefined, () => undefined);
  return result;
}

async function readProfile(): Promise<ProfileSettings> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return profileSettingsSchema.parse(defaultProfile);
  return profileSettingsSchema.parse(parseStoredJson(raw, profileSettingsSchema, defaultProfile));
}

async function writeProfile(value: ProfileSettings): Promise<ProfileSettings> {
  const normalized = profileSettingsSchema.parse(value);
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(normalized));
  return normalized;
}

function snapshotPatch(value: Partial<ProfileSettings>): Partial<ProfileSettings> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Array.isArray(item) ? [...item] : item]));
}

function mergeProfile(current: ProfileSettings, patch: Partial<ProfileSettings>): ProfileSettings {
  return {
    ...current,
    ...patch,
    // Candidate additions are independent of form selection drafts. A stale save
    // must not remove entries saved by another screen or an earlier queued add.
    weaknessCandidates: [...new Set([...current.weaknessCandidates, ...(patch.weaknessCandidates ?? [])])],
    favoriteCandidateIds: [...new Set([...current.favoriteCandidateIds, ...(patch.favoriteCandidateIds ?? [])])],
  };
}

function addCandidate(key: "weaknessCandidates" | "favoriteCandidateIds", value: string): Promise<ProfileSettings> {
  return queueProfileOperation(async () => {
    const profile = await readProfile();
    if (profile[key].includes(value)) return profile;
    return writeProfile({ ...profile, [key]: [...profile[key], value] });
  });
}

async function discardPhotos(files: StoredFile[]) {
  for (const file of files) {
    // The reference is already committed. Cleanup failure must not undo the new photo.
    await fileStorageService.remove(file).catch((error) => console.warn("Could not remove an unused profile photo", error));
  }
}

export const profileService = {
  async load() {
    return queueProfileOperation(readProfile);
  },

  async save(value: ProfileSettings, baseline?: ProfileSettings): Promise<ProfileSettings> {
    const snapshot = profileSettingsSchema.parse(value);
    const original = baseline ? profileSettingsSchema.parse(baseline) : undefined;
    return queueProfileOperation(async () => {
      const current = await readProfile();
      if (!original) return writeProfile(mergeProfile(current, snapshot));
      const changed = Object.fromEntries(Object.entries(snapshot).filter(([key, item]) => (
        JSON.stringify(item) !== JSON.stringify(original[key as keyof ProfileSettings])
      )));
      return writeProfile(mergeProfile(current, changed));
    });
  },

  async patch(value: Partial<ProfileSettings>): Promise<ProfileSettings> {
    const snapshot = snapshotPatch(value);
    return queueProfileOperation(async () => writeProfile(mergeProfile(await readProfile(), snapshot)));
  },

  addWeaknessCandidate(value: string): Promise<ProfileSettings> {
    return addCandidate("weaknessCandidates", value);
  },

  addFavoriteCandidate(id: string): Promise<ProfileSettings> {
    return addCandidate("favoriteCandidateIds", id);
  },

  async saveWeaknesses(weaknesses: string[]): Promise<string[]> {
    const savedWeaknesses = [...new Set(weaknesses)];
    return queueProfileOperation(async () => {
      const profile = await readProfile();
      const unchanged = profile.weaknesses.length === savedWeaknesses.length
        && profile.weaknesses.every((weakness, index) => weakness === savedWeaknesses[index]);
      if (!unchanged) {
        await writeProfile({ ...profile, weaknesses: savedWeaknesses });
      }
      return savedWeaknesses;
    });
  },

  async clear() {
    return queueProfileOperation(() => AsyncStorage.removeItem(PROFILE_KEY));
  },

  async loadPhoto(): Promise<StoredFile | null> {
    return queueProfileOperation(async () => {
      const profile = await readProfile();
      if (!profile.photoFileName) return null;
      return (await fileStorageService.list("profile")).find((file) => file.name === profile.photoFileName) ?? null;
    });
  },

  async pickPhoto(): Promise<StoredFile | null> {
    // Invoke the chooser before awaiting anything to preserve browser user activation.
    return fileStorageService.pickImageAndStore("profile", (file) => queueProfileOperation(async () => {
      const profile = await readProfile();
      const files = await fileStorageService.list("profile");
      await writeProfile({ ...profile, photoFileName: file.name });
      await discardPhotos(files.filter((previous) => previous.name !== file.name));
      return file;
    }));
  },

  async removePhoto(): Promise<void> {
    return fileStorageService.withExclusiveFiles(() => queueProfileOperation(async () => {
      const profile = await readProfile();
      const files = await fileStorageService.list("profile");
      await writeProfile({ ...profile, photoFileName: null });
      await discardPhotos(files);
    }));
  },
};
