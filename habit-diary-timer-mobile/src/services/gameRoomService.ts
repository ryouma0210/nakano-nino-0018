import AsyncStorage from "@react-native-async-storage/async-storage";
import { queryOne } from "@/database/client";
import { toDateKey } from "@/utils/date";
import { pointRepository } from "@/repositories/rewardRepository";
import { dailyOrderMessages } from "@/constants/messages";
import { journalRepository } from "@/repositories/journalRepository";
import { contractSettingsSchema, dailyOrderSchema } from "@/schemas/storage";
import { parseStoredJson } from "@/utils/storageValidation";

const CONTRACT_KEY = "nino-room:contract";
const ORDER_PREFIX = "nino-room:daily-order:";
const ORDER_JOURNAL_TAG = "本日の命令固定記録";

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
    return parseStoredJson(raw, contractSettingsSchema, defaultContract);
  },
  async save(value: ContractSettings) {
    await AsyncStorage.setItem(CONTRACT_KEY, JSON.stringify(value));
  },
  async clear() {
    await AsyncStorage.removeItem(CONTRACT_KEY);
  },
};

let pendingOrderOperation: Promise<void> = Promise.resolve();

function queueOrderOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingOrderOperation.then(operation);
  pendingOrderOperation = result.then(() => undefined, () => undefined);
  return result;
}

function parseOrder(raw: string | null, date: string): DailyOrder | null {
  if (!raw) return null;
  try {
    const order = dailyOrderSchema.parse(JSON.parse(raw));
    return order.date === date ? order : null;
  } catch {
    return null;
  }
}

async function readOrder(date: string): Promise<DailyOrder | null> {
  return parseOrder(await AsyncStorage.getItem(`${ORDER_PREFIX}${date}`), date);
}

async function readOrders(): Promise<DailyOrder[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(ORDER_PREFIX));
  if (keys.length === 0) return [];
  const entries = await AsyncStorage.multiGet(keys);
  return entries.flatMap(([key, raw]) => {
    const order = parseOrder(raw, key.slice(ORDER_PREFIX.length));
    return order ? [order] : [];
  });
}

function saveOrderJournal(order: DailyOrder) {
  journalRepository.upsertSystemRecord(
    {
      recordDate: order.date,
      title: "本日の命令記録",
      body: `本日の命令\n${order.text}\n\n実施完了`,
      recordType: "diary",
      tags: "本日の命令,完了,削除不可",
    },
    ORDER_JOURNAL_TAG,
  );
}

async function loadOrder(date: string): Promise<DailyOrder | null> {
  const order = await readOrder(date);
  if (order?.completed) {
    saveOrderJournal(order);
    const journal = queryOne<{ created_at: string }>(
      "SELECT created_at FROM journals WHERE record_date=? AND tags LIKE ? LIMIT 1",
      [date, `%${ORDER_JOURNAL_TAG}%`],
    );
    const resetAt = queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key='points_reset_at'",
    )?.setting_value ?? "";
    if (journal && journal.created_at > resetAt) {
      pointRepository.award(`daily-order:${date}`, 1, "本日の命令を完了");
    }
  }
  return order;
}

export const dailyOrderService = {
  saveJournal: saveOrderJournal,

  async load(date = toDateKey()) {
    return queueOrderOperation(() => loadOrder(date));
  },
  async draw(date = toDateKey()) {
    return queueOrderOperation(async () => {
      const existing = await loadOrder(date);
      if (existing) return existing;
      const order: DailyOrder = { date, text: dailyOrderMessages[Math.floor(Math.random() * dailyOrderMessages.length)].text, completed: false };
      await AsyncStorage.setItem(`${ORDER_PREFIX}${date}`, JSON.stringify(order));
      return order;
    });
  },
  async complete(order: DailyOrder) {
    const { date, text } = order;
    return queueOrderOperation(async () => {
      const existing = await readOrder(date);
      if (!existing || existing.text !== text) {
        throw new Error("保存済みの命令と一致しません。再読み込みしてください。");
      }
      const next = { ...existing, completed: true };
      if (!existing.completed) {
        await AsyncStorage.setItem(`${ORDER_PREFIX}${date}`, JSON.stringify(next));
      }
      pointRepository.award(`daily-order:${date}`, 1, "本日の命令を完了");
      saveOrderJournal(next);
      return next;
    });
  },
  async completedTexts(): Promise<string[]> {
    return queueOrderOperation(async () => [
      ...new Set((await readOrders()).filter((order) => order.completed).map((order) => order.text)),
    ]);
  },
  async remove(date = toDateKey()) {
    return queueOrderOperation(() => AsyncStorage.removeItem(`${ORDER_PREFIX}${date}`));
  },
  async clearOrders() {
    return queueOrderOperation(async () => {
      const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(ORDER_PREFIX));
      if (keys.length) await AsyncStorage.multiRemove(keys);
    });
  },
  async syncCompletedJournals() {
    return queueOrderOperation(async () => {
      const orders = await readOrders();
      orders.filter((order) => order.completed).forEach(saveOrderJournal);
    });
  },
  async clearAll() {
    return queueOrderOperation(async () => {
      const keys = await AsyncStorage.getAllKeys();
      const targets = keys.filter((key) => key.startsWith(ORDER_PREFIX) || key === CONTRACT_KEY);
      if (targets.length) await AsyncStorage.multiRemove(targets);
    });
  },
};
