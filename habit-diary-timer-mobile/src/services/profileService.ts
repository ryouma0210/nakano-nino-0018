import AsyncStorage from "@react-native-async-storage/async-storage";
import { profileSettingsSchema } from "@/schemas/storage";
import { parseStoredJson } from "@/utils/storageValidation";

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
  if (!raw) return defaultProfile;
  return parseStoredJson(raw, profileSettingsSchema, defaultProfile);
}

async function writeProfile(value: ProfileSettings): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(value));
}

export const profileService = {
  async load() {
    return queueProfileOperation(readProfile);
  },

  async save(value: ProfileSettings) {
    const snapshot = { ...value, weaknesses: [...value.weaknesses] };
    return queueProfileOperation(() => writeProfile(snapshot));
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
};
