import { execute, queryOne, transaction } from "@/database/client";
import {
  POINT_MILESTONES,
  POINT_MILESTONE_SETTING_KEY,
  parsePointMilestoneState,
  pointMilestoneDataError,
  pointMilestoneSnapshot,
  type PointMilestoneSnapshot,
  type PointMilestoneState,
} from "../features/points/milestones";
import { pointRepository } from "./rewardRepository";
import { toDateTimeKey } from "@/utils/date";

export type { PointMilestoneSnapshot } from "../features/points/milestones";

function update(acknowledgeIds: readonly string[] = []): PointMilestoneSnapshot {
  // Reconciliation has its own transaction, so complete it before opening ours.
  pointRepository.reconcileCompletionAwards();
  let snapshot!: PointMilestoneSnapshot;
  transaction(() => {
    const raw = queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key=?", [POINT_MILESTONE_SETTING_KEY],
    )?.setting_value ?? null;
    const previous = parsePointMilestoneState(raw);
    // Positive ledger entries are earned points. Spending, losses and the virtual
    // STG balance bonus never contribute to this total.
    const earned = pointRepository.totalEarned();
    if (!Number.isFinite(earned) || earned < 0) throw new Error(pointMilestoneDataError);
    const unlocked = POINT_MILESTONES
      .filter((milestone) => previous.unlocked.includes(milestone.id) || earned >= milestone.points)
      .map((milestone) => milestone.id);
    if (acknowledgeIds.some((id) => !unlocked.includes(id))) throw new Error(pointMilestoneDataError);
    const next: PointMilestoneState = {
      version: 1,
      unlocked,
      acknowledged: unlocked.filter((id) => previous.acknowledged.includes(id) || acknowledgeIds.includes(id)),
    };
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      execute(
        `INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
        [POINT_MILESTONE_SETTING_KEY, JSON.stringify(next), toDateTimeKey()],
      );
    }
    snapshot = pointMilestoneSnapshot(earned, next);
  });
  return snapshot;
}

export const pointMilestoneRepository = {
  /** Reconcile historical earnings, then persist all newly reached milestones together. */
  sync(): PointMilestoneSnapshot {
    return update();
  },

  /** Called only after the user acts on a notice; later milestones stay pending. */
  acknowledge(ids: readonly string[]): PointMilestoneSnapshot {
    const copiedIds = [...ids];
    if (new Set(copiedIds).size !== copiedIds.length) throw new Error(pointMilestoneDataError);
    return update(copiedIds);
  },

  /** Include this deletion in the same transaction as an explicit points reset. */
  clear() {
    execute("DELETE FROM app_settings WHERE setting_key=?", [POINT_MILESTONE_SETTING_KEY]);
  },
};
