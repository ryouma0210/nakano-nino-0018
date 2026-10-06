import { execute, query, queryOne, transaction } from "@/database/client";
import { dailyOrderMessages, managementFinalDayMessages, managementInstructionMessages, type ConfigurableMessage } from "@/constants/messages";
import {
  CUSTOM_COMMAND_MAX_LENGTH, CUSTOM_COMMAND_MAX_PER_CATEGORY, CUSTOM_COMMANDS_KEY, SEEN_COMMANDS_KEY, MANAGEMENT_COMMAND_SOURCES_KEY,
  isCommandCategory, parseCustomCommands, parseSeenCommands, parseManagementCommandSources,
  type CommandCategory, type CustomCommand, type SeenCommand,
} from "./customCommandStorage";

export type { CommandCategory, CustomCommand } from "./customCommandStorage";
export { CUSTOM_COMMAND_MAX_LENGTH, CUSTOM_COMMAND_MAX_PER_CATEGORY } from "./customCommandStorage";
export type CommandChoice = { text: string; customCommandId?: string };
export type BuiltinCommand = { id: string; message: ConfigurableMessage; finalDay: boolean };
export const commandCategoryLabels: Record<CommandCategory, string> = {
  daily: "本日の命令", chastity: "射精管理部屋の貞操帯あり", release: "射精管理部屋の貞操帯なし",
};

function readSetting(key: string) {
  return queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key=?", [key])?.setting_value ?? null;
}

function writeSetting(key: string, value: unknown, insideTransaction = false) {
  const work = () => execute(
    `INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
    [key, JSON.stringify(value), new Date().toISOString()],
  );
  if (insideTransaction) work(); else transaction(work);
}

function builtins(category: CommandCategory): BuiltinCommand[] {
  const normal = category === "daily" ? dailyOrderMessages : managementInstructionMessages[category];
  const final = category === "daily" ? [] : managementFinalDayMessages[category];
  return [
    ...normal.map((message, index) => ({ id: `${category}:${index}`, message, finalDay: false })),
    ...final.map((message, index) => ({ id: `${category}:final:${index}`, message, finalDay: true })),
  ];
}

function customCommands() { return parseCustomCommands(readSetting(CUSTOM_COMMANDS_KEY)); }
function seenCommands() { return parseSeenCommands(readSetting(SEEN_COMMANDS_KEY)); }
function managementSources() { return parseManagementCommandSources(readSetting(MANAGEMENT_COMMAND_SOURCES_KEY)); }
function sameSeen(a: SeenCommand, b: SeenCommand) { return a.category === b.category && a.finalDay === b.finalDay && a.text === b.text; }

function validateInput(category: CommandCategory, text: string) {
  if (!isCommandCategory(category)) throw new Error("追加先を選択してください。");
  if (typeof text !== "string" || !text.trim()) throw new Error("命令の内容を入力してください。");
  if (text.length > CUSTOM_COMMAND_MAX_LENGTH) throw new Error("命令の内容は4000文字以内で入力してください。");
}

function markSeen(category: CommandCategory, choices: readonly (CommandChoice & { finalDay?: boolean })[], insideTransaction = false) {
  const existing = seenCommands();
  const catalog = builtins(category);
  const next = [...existing];
  for (const choice of choices) {
    if (choice.customCommandId) continue;
    const command = catalog.find((item) => item.message.text === choice.text && item.finalDay === Boolean(choice.finalDay));
    if (!command) continue;
    const seen = { category, text: choice.text, finalDay: command.finalDay };
    if (!next.some((item) => sameSeen(item, seen))) next.push(seen);
  }
  if (next.length !== existing.length) writeSetting(SEEN_COMMANDS_KEY, { version: 1, commands: next }, insideTransaction);
}

let idSequence = 0;
export const customCommandService = {
  builtins,
  list(category?: CommandCategory) { return customCommands().filter((command) => !category || command.category === category); },
  pool(category: CommandCategory): CommandChoice[] {
    return [
      ...builtins(category).filter((item) => !item.finalDay).map((item) => ({ text: item.message.text })),
      ...customCommands().filter((item) => item.category === category).map((item) => ({ text: item.text, customCommandId: item.id })),
    ];
  },
  add(category: CommandCategory, text: string) {
    validateInput(category, text);
    const commands = customCommands();
    if (commands.filter((item) => item.category === category).length >= CUSTOM_COMMAND_MAX_PER_CATEGORY) throw new Error("追加できる命令は各種類100件までです。");
    const now = new Date().toISOString();
    const command: CustomCommand = { id: `custom-${Date.now().toString(36)}-${(++idSequence).toString(36)}-${Math.random().toString(36).slice(2, 10)}`, category, text, createdAt: now, updatedAt: now };
    writeSetting(CUSTOM_COMMANDS_KEY, { version: 1, commands: [...commands, command] });
    return command;
  },
  update(id: string, text: string) {
    const commands = customCommands();
    const existing = commands.find((command) => command.id === id);
    if (!existing) throw new Error("追加した命令が見つかりません。");
    validateInput(existing.category, text);
    const next = { ...existing, text, updatedAt: new Date().toISOString() };
    writeSetting(CUSTOM_COMMANDS_KEY, { version: 1, commands: commands.map((command) => command.id === id ? next : command) });
    return next;
  },
  remove(id: string) {
    const commands = customCommands();
    if (!commands.some((command) => command.id === id)) throw new Error("追加した命令が見つかりません。");
    writeSetting(CUSTOM_COMMANDS_KEY, { version: 1, commands: commands.filter((command) => command.id !== id) });
  },
  markSeen,
  seen(category: CommandCategory) { return seenCommands().filter((item) => item.category === category); },
  catalog(category: CommandCategory) {
    const seen = seenCommands();
    return builtins(category).map((item) => ({
      id: item.id, finalDay: item.finalDay,
      message: seen.some((entry) => sameSeen(entry, { category, text: item.message.text, finalDay: item.finalDay })) ? item.message : null,
    }));
  },
  managementSource(cycleId: number, date: string) { return managementSources()[`${cycleId}:${date}`]; },
  setManagementSource(cycleId: number, date: string, customCommandId: string, insideTransaction = false) {
    const sources = managementSources();
    writeSetting(MANAGEMENT_COMMAND_SOURCES_KEY, { version: 1, sources: { ...sources, [`${cycleId}:${date}`]: customCommandId } }, insideTransaction);
  },
  removeManagementSource(cycleId: number, date: string, insideTransaction = false) {
    const sources = managementSources();
    if (!sources[`${cycleId}:${date}`]) return;
    delete sources[`${cycleId}:${date}`];
    writeSetting(MANAGEMENT_COMMAND_SOURCES_KEY, { version: 1, sources }, insideTransaction);
  },
  removeManagementSources(cycleId: number, insideTransaction = false) {
    const sources = managementSources();
    const remaining = Object.fromEntries(Object.entries(sources).filter(([key]) => !key.startsWith(`${cycleId}:`)));
    if (Object.keys(remaining).length !== Object.keys(sources).length) writeSetting(MANAGEMENT_COMMAND_SOURCES_KEY, { version: 1, sources: remaining }, insideTransaction);
  },
  syncCompletedManagement() {
    const sources = managementSources();
    const tasks = query<{ cycle_id: number; record_date: string; instruction: string }>("SELECT * FROM management_daily_tasks WHERE completed_at IS NOT NULL");
    for (const task of tasks) {
      const cycle = queryOne<{ mode: CommandCategory; end_date: string }>("SELECT * FROM management_cycles WHERE id=?", [task.cycle_id]);
      if (!cycle || (cycle.mode !== "release" && cycle.mode !== "chastity")) continue;
      markSeen(cycle.mode, [{ text: task.instruction, customCommandId: sources[`${task.cycle_id}:${task.record_date}`], finalDay: task.record_date >= cycle.end_date }]);
    }
  },
  clearRecords() {
    transaction(() => {
      execute("DELETE FROM app_settings WHERE setting_key=?", [SEEN_COMMANDS_KEY]);
      execute("DELETE FROM app_settings WHERE setting_key=?", [MANAGEMENT_COMMAND_SOURCES_KEY]);
    });
  },
  clearAll() {
    transaction(() => {
      execute("DELETE FROM app_settings WHERE setting_key=?", [CUSTOM_COMMANDS_KEY]);
      execute("DELETE FROM app_settings WHERE setting_key=?", [SEEN_COMMANDS_KEY]);
      execute("DELETE FROM app_settings WHERE setting_key=?", [MANAGEMENT_COMMAND_SOURCES_KEY]);
    });
  },
};
