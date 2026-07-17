export type HabitFrequencyType =
  | "daily"
  | "weekdays"
  | "weekends"
  | "specific_weekdays"
  | "weekly_count"
  | "monthly_count"
  | "custom";

export type HabitRecordStatus = "completed" | "partial" | "missed" | "skipped";

export type JournalRecordType = "diary" | "memo" | "review" | "goal" | "health" | "free";

export type TimerType =
  | "countdown"
  | "stopwatch"
  | "focus"
  | "break"
  | "interval"
  | "custom";

export type TimerCompletionStatus = "completed" | "stopped" | "skipped";

export type Habit = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  color: string;
  frequency_type: HabitFrequencyType;
  target_count: number;
  start_date: string | null;
  end_date: string | null;
  reminder_enabled: number;
  reminder_time: string | null;
  display_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type HabitRecord = {
  id: number;
  habit_id: number;
  record_date: string;
  record_time: string;
  status: HabitRecordStatus;
  completed_count: number;
  duration_seconds: number | null;
  mood: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type HabitWithToday = Habit & {
  today_record_id: number | null;
  today_status: HabitRecordStatus | null;
  today_completed_count: number | null;
  total_completed: number;
};

export type Journal = {
  id: number;
  record_date: string;
  record_time: string;
  title: string;
  body: string;
  record_type: JournalRecordType;
  mood: string | null;
  rating: number | null;
  is_favorite: number;
  related_habit_id: number | null;
  duration_seconds: number | null;
  memo: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
};

export type TimerPreset = {
  id: number;
  name: string;
  timer_type: TimerType;
  duration_seconds: number;
  focus_seconds: number | null;
  break_seconds: number | null;
  set_count: number;
  sound_enabled: number;
  vibration_enabled: number;
  auto_start: number;
  related_habit_id: number | null;
  is_favorite: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type TimerHistory = {
  id: number;
  timer_preset_id: number | null;
  timer_name: string;
  started_at: string;
  ended_at: string | null;
  actual_duration_seconds: number;
  completion_status: TimerCompletionStatus;
  pause_count: number;
  related_habit_id: number | null;
  comment: string | null;
  created_at: string;
};

export type AppSettings = {
  darkMode: boolean;
  backgroundMusicEnabled: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  musicVolume: number;
  soundVolume: number;
  vibrationEnabled: boolean;
  weekStartsOn: "sunday" | "monday";
  dateFormat: "yyyy/mm/dd" | "yyyy-mm-dd";
  initialScreen: "home" | "habits" | "records" | "timer" | "settings";
  listLimit: number;
};
