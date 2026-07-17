import type { Href } from "expo-router";

export type AppRoom = {
  key: string;
  name: string;
  title: string;
  description: string;
  href: Href;
  color: string;
  accent: string;
  floor: string;
  furniture: "desk" | "bed" | "clock" | "shelf";
};

export const appRooms: AppRoom[] = [
  {
    key: "habits",
    name: "習慣の部屋",
    title: "毎日の小さな行動を育てる部屋",
    description: "習慣の登録、達成、連続記録を確認します。",
    href: "/(tabs)/habits",
    color: "#eaf7ef",
    accent: "#5fbf78",
    floor: "#d8eadc",
    furniture: "bed",
  },
  {
    key: "records",
    name: "日記の部屋",
    title: "気持ちや出来事をしまう部屋",
    description: "日記、メモ、タグ付きの記録を残します。",
    href: "/(tabs)/records",
    color: "#fff3e6",
    accent: "#f0a11a",
    floor: "#f5dfbf",
    furniture: "desk",
  },
  {
    key: "timer",
    name: "集中の部屋",
    title: "作業と休憩を切り替える部屋",
    description: "タイマー、集中時間、履歴を管理します。",
    href: "/(tabs)/timer",
    color: "#e9f1ff",
    accent: "#4d82d8",
    floor: "#d9e4f6",
    furniture: "clock",
  },
  {
    key: "settings",
    name: "準備の部屋",
    title: "アプリを整える部屋",
    description: "通知、保存、エクスポート、初期化を設定します。",
    href: "/(tabs)/settings",
    color: "#f1ecff",
    accent: "#8a6fd1",
    floor: "#e1d8f6",
    furniture: "shelf",
  },
];
