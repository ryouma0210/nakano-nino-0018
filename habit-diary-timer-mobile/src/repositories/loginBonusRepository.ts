import { execute, query, queryOne } from "@/database/client";
import { toDateKey, toDateTimeKey } from "@/utils/date";
import { pointRepository } from "@/repositories/rewardRepository";

const lastClaimedKey = "login_bonus_last_claimed_date";
const streakKey = "login_bonus_streak";

export type LoginBonusStatus = {
  today: string;
  lastClaimedDate: string | null;
  alreadyClaimed: boolean;
  currentStreak: number;
  claimStreak: number;
  claimPoints: number;
  nextClaimStreak: number;
  nextClaimPoints: number;
};

export type LoginBonusStamp = {
  date: string;
  day: number;
  claimed: boolean;
  points: number;
};

function bonusPoints(streak: number) {
  if (streak <= 1) return 1;
  if (streak >= 7) return 50;
  return 10;
}

function readSetting(key: string) {
  return (
    queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1",
      [key],
    )?.setting_value ?? null
  );
}

function readNumberSetting(key: string) {
  const value = Number(readSetting(key) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function setSetting(key: string, value: string) {
  const now = toDateTimeKey();
  const existing = queryOne<{ id: number }>(
    "SELECT id FROM app_settings WHERE setting_key=? LIMIT 1",
    [key],
  );
  if (existing) {
    execute("UPDATE app_settings SET setting_value=?, updated_at=? WHERE id=?", [
      value,
      now,
      existing.id,
    ]);
    return;
  }
  execute(
    "INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)",
    [key, value, now],
  );
}

function dateDiffDays(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  const diff = toDate.getTime() - fromDate.getTime();
  return Math.round(diff / 86_400_000);
}

function nextStreak(lastClaimedDate: string | null, currentStreak: number, today: string) {
  if (!lastClaimedDate) return 1;
  if (lastClaimedDate === today) return Math.max(1, currentStreak);
  return dateDiffDays(lastClaimedDate, today) === 1
    ? Math.min(7, Math.max(1, currentStreak) + 1)
    : 1;
}

function currentMonthKey(today = toDateKey()) {
  return today.slice(0, 7);
}

function monthDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

export const loginBonusRepository = {
  status(): LoginBonusStatus {
    const today = toDateKey();
    const lastClaimedDate = readSetting(lastClaimedKey);
    const currentStreak = readNumberSetting(streakKey);
    const alreadyClaimed = lastClaimedDate === today;
    const claimStreak = nextStreak(lastClaimedDate, currentStreak, today);
    const nextClaimStreak = Math.min(7, claimStreak + 1);

    return {
      today,
      lastClaimedDate,
      alreadyClaimed,
      currentStreak,
      claimStreak,
      claimPoints: bonusPoints(claimStreak),
      nextClaimStreak,
      nextClaimPoints: bonusPoints(nextClaimStreak),
    };
  },

  claim(): LoginBonusStatus {
    const current = this.status();
    if (current.alreadyClaimed) return current;

    pointRepository.award(
      `login-bonus:${current.today}`,
      current.claimPoints,
      `ログインボーナス（${current.claimStreak}日目）`,
    );
    setSetting(lastClaimedKey, current.today);
    setSetting(streakKey, String(current.claimStreak));

    return this.status();
  },

  monthlyStamps(monthKey = currentMonthKey()): LoginBonusStamp[] {
    const rows = query<{ source_key: string; points: number }>(
      "SELECT source_key, points FROM point_transactions WHERE source_key LIKE ?",
      [`login-bonus:${monthKey}-%`],
    );
    const claimedByDate = new Map(
      rows.map((row) => [row.source_key.replace("login-bonus:", ""), row.points]),
    );

    return Array.from({ length: monthDays(monthKey) }, (_, index) => {
      const day = index + 1;
      const date = `${monthKey}-${String(day).padStart(2, "0")}`;
      const points = claimedByDate.get(date) ?? 0;
      return {
        date,
        day,
        claimed: points > 0,
        points,
      };
    });
  },
};
