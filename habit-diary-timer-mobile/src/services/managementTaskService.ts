import { execute, query, queryOne, transaction } from "@/database/client";
import { managementFinalDayMessages } from "@/constants/messages";
import type { ManagementCycle, ManagementDailyTask } from "@/repositories/roomRepository";
import { toDateKey } from "@/utils/date";
import { customCommandService, type CommandChoice } from "./customCommandService";

function choice<T>(items: readonly T[]): T { return items[Math.floor(Math.random() * items.length)] ?? items[0]; }

export function replaceManagementInstruction(cycleId: number, recordDate: string, command: CommandChoice) {
  execute("UPDATE management_daily_tasks SET instruction=? WHERE cycle_id=? AND record_date=?", [command.text, cycleId, recordDate]);
  if (command.customCommandId) customCommandService.setManagementSource(cycleId, recordDate, command.customCommandId, true);
  else customCommandService.removeManagementSource(cycleId, recordDate, true);
}

/** A shared path for initial periods and atomic roulette extensions. */
export function createMissingManagementTasks(cycle: ManagementCycle, insideTransaction = false) {
  const start = new Date(`${cycle.start_date}T12:00:00`);
  const end = new Date(`${cycle.end_date}T12:00:00`);
  const totalDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000)) + 1;
  const normalChoices = customCommandService.pool(cycle.mode);
  const finalChoices = managementFinalDayMessages[cycle.mode];
  const work = () => {
    for (let index = 0; index < totalDays; index += 1) {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      const recordDate = toDateKey(date);
      if (queryOne<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE cycle_id=? AND record_date=?", [cycle.id, recordDate])) continue;
      const command: CommandChoice = recordDate >= cycle.end_date ? { text: choice(finalChoices).text } : choice(normalChoices);
      execute("INSERT INTO management_daily_tasks(cycle_id, record_date, instruction) VALUES(?, ?, ?)", [cycle.id, recordDate, command.text]);
      if (command.customCommandId) customCommandService.setManagementSource(cycle.id, recordDate, command.customCommandId, true);
    }
  };
  if (insideTransaction) work(); else transaction(work);
  const saved = query<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE cycle_id=? ORDER BY record_date, id", [cycle.id]);
  if (saved.length < totalDays) throw new Error(`射精管理の日別指示を作成できませんでした。（${saved.length}/${totalDays}日分）`);
}
