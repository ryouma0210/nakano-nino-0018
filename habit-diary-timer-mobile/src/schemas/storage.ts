import { z } from "zod";
import { FAVORITE_RANKING_LIMIT } from "../constants/profile";

const profileExperience = z.enum(["unknown", "yes", "no"]);
export const profileSettingsSchema = z.object({
  sexualExperience: profileExperience.default("unknown"),
  romanceExperience: profileExperience.default("unknown"),
  analExperience: profileExperience.default("unknown"),
  nippleExperience: profileExperience.default("unknown"),
  exposureExperience: profileExperience.default("unknown"),
  specialFetish: profileExperience.default("unknown"),
  erectionLengthCm: z.string().default(""),
  masturbationPerWeek: z.string().default(""),
  masturbationMinutes: z.string().default(""),
  tissueCount: z.string().default(""),
  weaknesses: z.array(z.string()).default([]),
  weaknessCandidates: z.array(z.string()).default([]),
  topWeaknesses: z.array(z.string()).default([]),
  favoriteIds: z.array(z.string()).default([]),
  favoriteCandidateIds: z.array(z.string()).default([]),
  topFavoriteIds: z.array(z.string()).default([]),
  photoFileName: z.string().min(1).refine((name) => name !== "." && name !== ".." && !/[\\/\u0000-\u001f]/.test(name)).nullable().default(null),
  ninoOutfit: z.string().default("default"),
  ninoVoiceStyle: z.string().default("queen"),
}).transform((profile) => ({
  ...profile,
  weaknesses: [...new Set(profile.weaknesses)],
  weaknessCandidates: [...new Set([...profile.weaknessCandidates, ...profile.weaknesses])],
  topWeaknesses: [...new Set(profile.topWeaknesses)].filter((item) => profile.weaknesses.includes(item)).slice(0, 5),
  favoriteIds: [...new Set(profile.favoriteIds)],
  favoriteCandidateIds: [...new Set([...profile.favoriteCandidateIds, ...profile.favoriteIds])],
  topFavoriteIds: [...new Set(profile.topFavoriteIds)].filter((id) => profile.favoriteIds.includes(id)).slice(0, FAVORITE_RANKING_LIMIT),
}));

export const appSettingsSchema = z.object({
  playerName: z.string().default("マゾ"), darkMode: z.boolean().default(false),
  language: z.enum(["ja", "en", "ko", "zh"]).default("ja"),
  backgroundMusicEnabled: z.boolean().default(true), notificationsEnabled: z.boolean().default(true),
  soundEnabled: z.boolean().default(true), musicVolume: z.number().min(0).max(1).default(0.35),
  soundVolume: z.number().min(0).max(1).default(0.7), vibrationEnabled: z.boolean().default(true),
  weekStartsOn: z.enum(["sunday", "monday"]).default("monday"),
  dateFormat: z.enum(["yyyy/mm/dd", "yyyy-mm-dd"]).default("yyyy/mm/dd"),
  initialScreen: z.enum(["home", "habits", "records", "timer", "settings"]).default("home"),
  listLimit: z.number().int().min(1).max(500).default(50),
});

export const contractSettingsSchema = z.object({
  allowRelease: z.boolean().default(true), allowChastity: z.boolean().default(true),
  maxPunishmentMinutes: z.number().int().min(0).max(1440).default(30), note: z.string().default(""),
  signature: z.string().optional(), signedAt: z.string().optional(),
});
export const dailyOrderSchema = z.object({ date: z.string(), text: z.string(), completed: z.boolean(), customCommandId: z.string().min(1).optional() });
export const realContractSchema = z.object({
  contractorName: z.string().optional(), contractDate: z.string().optional(),
  releaseMonths: z.number().int().nonnegative().optional(),
});
