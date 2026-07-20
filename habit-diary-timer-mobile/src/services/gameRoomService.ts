import AsyncStorage from "@react-native-async-storage/async-storage";
import { toDateKey } from "@/utils/date";
import { pointRepository } from "@/repositories/rewardRepository";
import { dailyOrderMessages } from "@/constants/messages";
import { journalRepository } from "@/repositories/journalRepository";

const CONTRACT_KEY = "nino-room:contract";
const ORDER_PREFIX = "nino-room:daily-order:";

export type ContractSettings = {
  allowRelease: boolean;
  allowChastity: boolean;
  maxPunishmentMinutes: number;
  note: string;
  signature?: string;
  signedAt?: string;
};

export type DailyOrder = {
  date: string;
  text: string;
  completed: boolean;
};

const defaultContract: ContractSettings = {
  allowRelease: true,
  allowChastity: true,
  maxPunishmentMinutes: 30,
  note: "",
};

export const contractService = {
  async load() {
    const raw = await AsyncStorage.getItem(CONTRACT_KEY);
    if (!raw) return defaultContract;
    try { return { ...defaultContract, ...JSON.parse(raw) } as ContractSettings; } catch { return defaultContract; }
  },
  async save(value: ContractSettings) {
    await AsyncStorage.setItem(CONTRACT_KEY, JSON.stringify(value));
  },
};

export const dailyOrderService = {
  saveJournal(order: DailyOrder) {
    journalRepository.upsertSystemRecord(
      {
        recordDate: order.date,
        title: "本日の命令記録",
        body: `本日の命令\n${order.text}\n\n実施完了`,
        recordType: "diary",
        tags: "本日の命令,完了,削除不可",
      },
      "本日の命令固定記録",
    );
  },

  async load(date = toDateKey()) {
    const raw = await AsyncStorage.getItem(`${ORDER_PREFIX}${date}`);
    if (!raw) return null;
    try {
      const order = JSON.parse(raw) as DailyOrder;
      if (order.completed) this.saveJournal(order);
      return order;
    } catch { return null; }
  },
  async draw(date = toDateKey()) {
    const existing = await this.load(date);
    if (existing) return existing;
    const order: DailyOrder = { date, text: dailyOrderMessages[Math.floor(Math.random() * dailyOrderMessages.length)].text, completed: false };
    await AsyncStorage.setItem(`${ORDER_PREFIX}${date}`, JSON.stringify(order));
    return order;
  },
  async complete(order: DailyOrder) {
    const next = { ...order, completed: true };
    await AsyncStorage.setItem(`${ORDER_PREFIX}${order.date}`, JSON.stringify(next));
    pointRepository.award(`daily-order:${order.date}`, 1, "本日の命令を完了");
    this.saveJournal(next);
    return next;
  },
  async remove(date = toDateKey()) {
    await AsyncStorage.removeItem(`${ORDER_PREFIX}${date}`);
  },
  async syncCompletedJournals() {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(ORDER_PREFIX));
    if (keys.length === 0) return;
    const entries = await AsyncStorage.multiGet(keys);
    entries.forEach(([, raw]) => {
      if (!raw) return;
      try {
        const order = JSON.parse(raw) as DailyOrder;
        if (order.completed) this.saveJournal(order);
      } catch {
        // 壊れた旧データは日記へ同期しない。
      }
    });
  },
  async clearAll() {
    const keys = await AsyncStorage.getAllKeys();
    const targets = keys.filter(
      (key) => key.startsWith(ORDER_PREFIX) || key === CONTRACT_KEY,
    );
    if (targets.length) await AsyncStorage.multiRemove(targets);
  },
};
