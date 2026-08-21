import { z } from "zod";

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
  ninoOutfit: z.string().default("default"),
  ninoVoiceStyle: z.string().default("queen"),
});

export const appSettingsSchema = z.object({
  playerName: z.string().default("マゾ"), darkMode: z.boolean().default(false),
  language: z.enum(["ja", "en", "ko"]).default("ja"),
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
export const dailyOrderSchema = z.object({ date: z.string(), text: z.string(), completed: z.boolean() });
export const realContractSchema = z.object({
  contractorName: z.string().optional(), contractDate: z.string().optional(),
  releaseMonths: z.number().int().nonnegative().optional(),
});
