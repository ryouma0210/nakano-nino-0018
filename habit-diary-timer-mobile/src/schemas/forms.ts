import { z } from "zod";

export const habitFormSchema = z.object({
  name: z.string().trim().min(1, "習慣名を入力してください。").max(80),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(40).optional(),
  icon: z.string().trim().max(40).optional(),
  color: z.string().trim().default("#2f8b72"),
  frequencyType: z.string().trim().default("daily"),
  targetCount: z.coerce.number().int().min(1).max(99).default(1),
  reminderEnabled: z.boolean().default(false),
  reminderTime: z.string().trim().optional(),
});

export const journalFormSchema = z.object({
  recordDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DDで入力してください。"),
  title: z.string().trim().min(1, "タイトルを入力してください。").max(120),
  body: z.string().trim().min(1, "本文を入力してください。").max(10000),
  recordType: z.enum(["diary", "memo", "review", "goal", "health", "free"]).default("diary"),
  mood: z.string().trim().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  isFavorite: z.boolean().default(false),
  tags: z.string().trim().optional(),
});

export type HabitFormValues = z.infer<typeof habitFormSchema>;
export type JournalFormValues = z.infer<typeof journalFormSchema>;
