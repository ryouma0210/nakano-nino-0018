import AsyncStorage from "@react-native-async-storage/async-storage";

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
};

export const profileService = {
  async load() {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile;
    try {
      return { ...defaultProfile, ...JSON.parse(raw) } as ProfileSettings;
    } catch {
      return defaultProfile;
    }
  },

  async save(value: ProfileSettings) {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(value));
  },

  async clear() {
    await AsyncStorage.removeItem(PROFILE_KEY);
  },
};
