import * as Notifications from "expo-notifications";
import type { Habit } from "@/types/models";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const notificationService = {
  async requestPermission() {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  },

  async scheduleHabitReminder(habit: Habit) {
    if (!habit.reminder_enabled || !habit.reminder_time) return null;
    const granted = await this.requestPermission();
    if (!granted) return null;
    const [hour, minute] = habit.reminder_time.split(":").map(Number);
    return Notifications.scheduleNotificationAsync({
      content: {
        title: habit.name,
        body: `${habit.reminder_time} の予定です。今日も少しだけ進めましょう。`,
        data: { habitId: habit.id, screen: "habit-detail" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  },

  async scheduleTimerDone(title: string, seconds: number) {
    const granted = await this.requestPermission();
    if (!granted) return null;
    return Notifications.scheduleNotificationAsync({
      content: { title: "タイマー完了", body: title },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
    });
  },

  async cancelAll() {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },
};
