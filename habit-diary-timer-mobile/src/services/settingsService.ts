import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppSettings } from "@/types/models";

const SETTINGS_KEY = "habit-diary-timer:settings";

export const defaultSettings: AppSettings = {
  playerName: "マゾ",
  darkMode: false,
  backgroundMusicEnabled: true,
  notificationsEnabled: true,
  soundEnabled: true,
  musicVolume: 0.35,
  soundVolume: 0.7,
  vibrationEnabled: true,
  weekStartsOn: "monday",
  dateFormat: "yyyy/mm/dd",
  initialScreen: "home",
  listLimit: 50,
};

export const settingsService = {
  async load(): Promise<AppSettings> {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    try {
      return { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
      return defaultSettings;
    }
  },

  async save(settings: AppSettings) {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  async reset() {
    await AsyncStorage.removeItem(SETTINGS_KEY);
  },
};
