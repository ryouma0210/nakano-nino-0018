import { queryOne, transaction } from "@/database/client";
import { DAILY_ROOM_POINTS } from "../constants/roomPoints";
import { toDateKey, toDateTimeKey } from "@/utils/date";
import { journalRepository } from "./journalRepository";
import { pointRepository } from "@/repositories/rewardRepository";

export const brainwashRepository = {
  hasCompleted(date = toDateKey()) {
    const tag = `洗脳部屋${date}`;
    return Boolean(queryOne<{ id: number }>(
      "SELECT id FROM journals WHERE record_date=? AND tags LIKE ? LIMIT 1",
      [date, `%${tag}%`],
    ));
  },

  complete() {
    const date = toDateKey();
    const now = toDateTimeKey();
    let awarded = false;
    transaction(() => {
      if (this.hasCompleted(date)) return;
      journalRepository.upsertSystemRecord({
        recordDate: date,
        title: "洗脳部屋記録",
        body: "洗脳完了しました。",
        recordType: "diary",
        tags: "洗脳部屋,調教記録",
      }, `洗脳部屋${date}`);
      if (!this.hasCompleted(date)) throw new Error("洗脳部屋の保存結果を取得できませんでした。");
      awarded = pointRepository.award(`brainwash:${date}`, DAILY_ROOM_POINTS.brainwash, "本日初回の洗脳を完了", now, { notify: false });
    });
    if (awarded) pointRepository.notifyChanged();
  },
};
