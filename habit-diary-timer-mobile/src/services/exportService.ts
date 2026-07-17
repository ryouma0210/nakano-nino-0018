import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { execute, query } from "@/database/client";
import type { Habit, HabitRecord, Journal, TimerHistory, TimerPreset } from "@/types/models";
import { toDateTimeKey } from "@/utils/date";

type ExportPayload = {
  exportedAt: string;
  habits: Habit[];
  habitRecords: HabitRecord[];
  journals: Journal[];
  timerPresets: TimerPreset[];
  timerHistories: TimerHistory[];
};

export const exportService = {
  buildPayload(): ExportPayload {
    return {
      exportedAt: toDateTimeKey(),
      habits: query<Habit>("SELECT * FROM habits"),
      habitRecords: query<HabitRecord>("SELECT * FROM habit_records"),
      journals: query<Journal>("SELECT * FROM journals"),
      timerPresets: query<TimerPreset>("SELECT * FROM timer_presets"),
      timerHistories: query<TimerHistory>("SELECT * FROM timer_histories"),
    };
  },

  async exportJson() {
    const payload = this.buildPayload();
    const uri = `${FileSystem.cacheDirectory}habit-diary-timer-export.json`;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "application/json" });
    }
    return uri;
  },

  async importJson(mode: "append" | "replace") {
    const picked = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
    if (picked.canceled) return { imported: false };
    const raw = await FileSystem.readAsStringAsync(picked.assets[0].uri);
    const payload = JSON.parse(raw) as Partial<ExportPayload>;
    if (!Array.isArray(payload.habits) || !Array.isArray(payload.journals)) {
      throw new Error("不正なエクスポートファイルです。");
    }
    if (mode === "replace") {
      execute("DELETE FROM timer_histories");
      execute("DELETE FROM timer_presets");
      execute("DELETE FROM journals");
      execute("DELETE FROM habit_records");
      execute("DELETE FROM habits");
    }
    payload.habits.forEach((habit) => {
      execute(
        `INSERT OR IGNORE INTO habits(id, name, description, category, icon, color, frequency_type, target_count, start_date, end_date, reminder_enabled, reminder_time, display_order, is_active, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          habit.id,
          habit.name,
          habit.description,
          habit.category,
          habit.icon,
          habit.color,
          habit.frequency_type,
          habit.target_count,
          habit.start_date,
          habit.end_date,
          habit.reminder_enabled,
          habit.reminder_time,
          habit.display_order,
          habit.is_active,
          habit.created_at,
          habit.updated_at,
        ],
      );
    });
    return { imported: true };
  },
};
