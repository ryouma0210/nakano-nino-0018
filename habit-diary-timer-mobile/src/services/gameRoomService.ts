import AsyncStorage from "@react-native-async-storage/async-storage";
import { toDateKey } from "@/utils/date";
import { pointRepository } from "@/repositories/rewardRepository";

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

const dailyOrders = [
  "首輪を着けて、鏡の前で『二ノ様の命令に従います』と10回言いなさい。",
  "土下座の姿勢を3分間保ちなさい。",
  "四つん這いの姿勢で寸止めを3回しなさい。",
  "足を伸ばした姿勢で寸止めを3回しなさい。",
  "正座して、今日受けたい命令を3つ書き出しなさい。",
  "今日は二ノ様の許可なしに射精禁止よ。",
  "首輪を着けたまま30分間過ごしなさい。",
  "土下座の姿勢で寸止めを5回しなさい。",
  "ヨダレを垂らした状態で寸止めを5回しなさい。",
  "鏡を見ながら『私は二ノ様の奴隷です』と20回言いなさい。",
  "乳首を左右交互に5分間刺激しなさい。",
  "ゆっくり100回数えながら刺激し、射精せずに止めなさい。",
  "四つん這いのまま腰を100回振りなさい。",
  "土下座を10回して、毎回『お願いします』と言いなさい。",
  "今日の服従度を5段階で自己評価し、理由を日記に書きなさい。",
  "下着を脱いで正座し、5分間待機しなさい。",
  "寸止めを1回するたびに『二ノ様好き』と5回言い、合計3セット行いなさい。",
  "両手を後ろに組み、膝立ちの姿勢を3分間保ちなさい。",
  "刺激を30秒、停止を30秒の間隔で10セット行いなさい。",
  "今日は刺激を始めても、命令完了まで射精してはいけません。",
  "首輪を着けて土下座し、二ノ様への誓いを声に出して読みなさい。",
  "弱い刺激だけで10分間耐え、最後まで射精せずに終えなさい。",
  "寸止めを3回したあと、正座して5分間反省しなさい。",
  "四つん這いで『もっと命令してください』と10回言いなさい。",
  "鏡の前で自分の服従姿勢を確認し、最もきれいな土下座を10回しなさい。",
  "乳首を刺激しながら、ゆっくり腰を50回振りなさい。",
  "今日の命令を始める前に、首輪を着けて一礼しなさい。",
  "寸止めを5回行い、それぞれの間に1分間待機しなさい。",
  "命令中は『やめたい』ではなく『もっとください』と5回言いなさい。",
  "今日の命令を終えた感想と次回の目標を調教日記に残しなさい。",
] as const;

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
  async load(date = toDateKey()) {
    const raw = await AsyncStorage.getItem(`${ORDER_PREFIX}${date}`);
    if (!raw) return null;
    try { return JSON.parse(raw) as DailyOrder; } catch { return null; }
  },
  async draw(date = toDateKey()) {
    const existing = await this.load(date);
    if (existing) return existing;
    const order: DailyOrder = { date, text: dailyOrders[Math.floor(Math.random() * dailyOrders.length)], completed: false };
    await AsyncStorage.setItem(`${ORDER_PREFIX}${date}`, JSON.stringify(order));
    return order;
  },
  async complete(order: DailyOrder) {
    const next = { ...order, completed: true };
    await AsyncStorage.setItem(`${ORDER_PREFIX}${order.date}`, JSON.stringify(next));
    pointRepository.award(`daily-order:${order.date}`, 1, "本日の命令を完了");
    return next;
  },
  async remove(date = toDateKey()) {
    await AsyncStorage.removeItem(`${ORDER_PREFIX}${date}`);
  },
  async clearAll() {
    const keys = await AsyncStorage.getAllKeys();
    const targets = keys.filter((key) => key.startsWith(ORDER_PREFIX) || key === CONTRACT_KEY);
    if (targets.length) await AsyncStorage.multiRemove(targets);
  },
};
