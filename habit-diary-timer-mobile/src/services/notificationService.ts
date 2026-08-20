import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Habit } from "@/types/models";

type NotificationsModule = typeof import("expo-notifications");

const isExpoGo = Constants.appOwnership === "expo";
let notificationsPromise: Promise<NotificationsModule> | null = null;
let handlerConfigured = false;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === "web" || isExpoGo) return null;

  const pendingNotifications = notificationsPromise ?? import("expo-notifications");
  notificationsPromise = pendingNotifications;
  const notifications = await pendingNotifications;

  if (!handlerConfigured) {
    notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
    });
    handlerConfigured = true;
  }

  return notifications;
}

export const notificationService = {
  async requestPermission() {
    const notifications = await getNotifications();
    if (!notifications) return false;
    const current = await notifications.getPermissionsAsync();
    if (current.granted) return true;
    const next = await notifications.requestPermissionsAsync();
    return next.granted;
  },

  async scheduleHabitReminder(habit: Habit) {
    if (!habit.reminder_enabled || !habit.reminder_time) return null;
    const granted = await this.requestPermission();
    if (!granted) return null;
    const notifications = await getNotifications();
    if (!notifications) return null;
    const [hour, minute] = habit.reminder_time.split(":").map(Number);
    return notifications.scheduleNotificationAsync({
      content: {
        title: habit.name,
        body: `${habit.reminder_time} の予定です。今日も少しだけ進めましょう。`,
        data: { habitId: habit.id, screen: "habit-detail" },
      },
      trigger: { type: notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  },

  async scheduleTimerDone(title: string, seconds: number) {
    const granted = await this.requestPermission();
    if (!granted) return null;
    const notifications = await getNotifications();
    if (!notifications) return null;
    return notifications.scheduleNotificationAsync({
      content: { title: "タイマー完了", body: title },
      trigger: { type: notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
    });
  },

  async cancelAll() {
    const notifications = await getNotifications();
    if (!notifications) return;
    await notifications.cancelAllScheduledNotificationsAsync();
  },
};
