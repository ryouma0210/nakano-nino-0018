import { execute, query, queryOne, transaction } from "@/database/client";
import { toDateTimeKey } from "@/utils/date";
import {
  rewardBrutalOrderMessages,
  rewardInsultMessages,
  rewardPraiseMessages,
  rewardSecretMessages,
} from "@/constants/messages";

export const rewardCatalog = {
  insult: {
    key: "insult",
    name: "罵倒のコメント交換♡マゾはこれで十分よね♡",
    cost: 10,
    contents: rewardInsultMessages.map((message) => message.text),
  },
  praise: {
    key: "praise",
    name: "称賛のコメント交換♡頑張ったお兄さんに特別よ♡",
    cost: 50,
    contents: rewardPraiseMessages.map((message) => message.text),
  },
  video: { key: "video", name: "ご褒美動画交換♡", cost: 500 },
  brutal: {
    key: "brutal",
    name: "鬼畜の調教命令交換♡",
    cost: 1000,
    contents: rewardBrutalOrderMessages.map((message) => message.text),
  },
  voice: {
    key: "voice",
    name: "好きボイス3秒♡",
    cost: 5000,
    content: "二ノの好きボイス3秒",
  },
  secret: {
    key: "secret",
    name: "秘密♡交換時のお楽しみ♡",
    cost: 10000,
    contents: rewardSecretMessages.map((message) => message.text),
  },
} as const;

export type RandomRewardKey = "insult" | "praise" | "brutal";
export type RewardRedemption = {
  id: number;
  reward_key: string;
  reward_name: string;
  points_spent: number;
  reward_content: string | null;
  file_uri: string | null;
  redeemed_at: string;
};

const stgBonus = process.env.EXPO_PUBLIC_APP_ENV === "stg" ? 99999 : 0;
const pointChangeListeners = new Set<() => void>();

export const pointRepository = {
  award(sourceKey: string, points: number, description: string) {
    const result = execute(
      "INSERT OR IGNORE INTO point_transactions(source_key, points, description, created_at) VALUES(?, ?, ?, ?)",
      [sourceKey, points, description, toDateTimeKey()],
    );
    const awarded = result.changes > 0;
    if (awarded) pointChangeListeners.forEach((listener) => listener());
    return awarded;
  },

  subscribe(listener: () => void) {
    pointChangeListeners.add(listener);
    return () => {
      pointChangeListeners.delete(listener);
    };
  },

  /**
   * 完了記録は保存されたもののポイント行だけ作成されなかった旧データを補完する。
   * source_key は UNIQUE のため、既に付与済みのポイントは重複しない。
   */
  reconcileCompletionAwards() {
    const now = toDateTimeKey();
    const resetAt = queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key='points_reset_at'",
    )?.setting_value ?? "";
    transaction(() => {
      execute(
        `INSERT OR IGNORE INTO point_transactions(source_key, points, description, created_at)
         SELECT 'daily-order:' || record_date, 1, '本日の命令を完了',
                COALESCE(created_at, ?)
           FROM journals
          WHERE title = '本日の命令記録'
            AND created_at > ?`,
        [now, resetAt],
      );
      execute(
        `INSERT OR IGNORE INTO point_transactions(source_key, points, description, created_at)
         SELECT 'training:' || record_date, 5, '本日初回の調教を完了',
                MIN(COALESCE(created_at, ?))
           FROM journals
          WHERE title = '調教完了記録'
            AND created_at > ?
          GROUP BY record_date`,
        [now, resetAt],
      );
      execute(
        `INSERT OR IGNORE INTO point_transactions(source_key, points, description, created_at)
         SELECT 'management-task:' || id, 10, '射精管理の本日の命令を完了',
                COALESCE(completed_at, ?)
           FROM management_daily_tasks
          WHERE completed_at IS NOT NULL
            AND completed_at > ?`,
        [now, resetAt],
      );
    });
  },
};

export const rewardRepository = {
  balance() {
    pointRepository.reconcileCompletionAwards();
    const activityPoints =
      queryOne<{ total: number }>(
        "SELECT COALESCE(SUM(points), 0) AS total FROM point_transactions",
      )?.total ?? 0;
    const spent =
      queryOne<{ total: number }>(
        "SELECT COALESCE(SUM(points_spent), 0) AS total FROM reward_redemptions",
      )?.total ?? 0;
    const earned = activityPoints + stgBonus;
    return { earned, spent, available: Math.max(0, earned - spent), stgBonus };
  },

  acquired() {
    return query<RewardRedemption>(
      "SELECT * FROM reward_redemptions ORDER BY id DESC",
    );
  },

  remaining(key: RandomRewardKey) {
    const reward = rewardCatalog[key];
    const acquired = new Set(
      query<{ reward_content: string | null }>(
        "SELECT reward_content FROM reward_redemptions WHERE reward_key=?",
        [key],
      )
        .map((item) => item.reward_content)
        .filter(Boolean),
    );
    return reward.contents.filter((content) => !acquired.has(content));
  },

  redeemRandom(key: RandomRewardKey) {
    const reward = rewardCatalog[key];
    const choices = this.remaining(key);
    if (choices.length === 0) return null;
    const content = choices[Math.floor(Math.random() * choices.length)];
    let redeemed = false;
    transaction(() => {
      if (this.balance().available < reward.cost) return;
      execute(
        "INSERT INTO reward_redemptions(reward_key, reward_name, points_spent, reward_content, redeemed_at) VALUES(?, ?, ?, ?, ?)",
        [reward.key, reward.name, reward.cost, content, toDateTimeKey()],
      );
      redeemed = true;
    });
    return redeemed ? content : null;
  },

  redeemVideo(name: string) {
    const reward = rewardCatalog.video;
    let redeemed = false;
    transaction(() => {
      const existing = queryOne<{ count: number }>(
        "SELECT COUNT(*) AS count FROM reward_redemptions WHERE reward_key='video' AND reward_content=?",
        [name],
      )?.count ?? 0;
      if (existing > 0) return;
      if (this.balance().available < reward.cost) return;
      execute(
        "INSERT INTO reward_redemptions(reward_key, reward_name, points_spent, reward_content, redeemed_at) VALUES('video', ?, ?, ?, ?)",
        [reward.name, reward.cost, name, toDateTimeKey()],
      );
      redeemed = true;
    });
    return redeemed;
  },

  hasRedeemed(key: string) {
    return (queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM reward_redemptions WHERE reward_key=?",
      [key],
    )?.count ?? 0) > 0;
  },

  redeemVoice() {
    const reward = rewardCatalog.voice;
    let redeemed = false;
    transaction(() => {
      if (this.hasRedeemed(reward.key)) return;
      if (this.balance().available < reward.cost) return;
      execute(
        "INSERT INTO reward_redemptions(reward_key, reward_name, points_spent, reward_content, redeemed_at) VALUES(?, ?, ?, ?, ?)",
        [reward.key, reward.name, reward.cost, reward.content, toDateTimeKey()],
      );
      redeemed = true;
    });
    return redeemed;
  },

  redeemSecret() {
    const reward = rewardCatalog.secret;
    let redeemed = false;
    transaction(() => {
      if (this.balance().available < reward.cost) return;
      execute(
        "INSERT INTO reward_redemptions(reward_key, reward_name, points_spent, reward_content, redeemed_at) VALUES('secret', ?, ?, ?, ?)",
        [reward.name, reward.cost, reward.contents[0], toDateTimeKey()],
      );
      redeemed = true;
    });
    return redeemed ? reward.contents[0] : null;
  },
};
