export const CUSTOM_COMMANDS_KEY = "custom_commands_v1";
export const SEEN_COMMANDS_KEY = "seen_commands_v1";
export const MANAGEMENT_COMMAND_SOURCES_KEY = "management_command_sources_v1";
export const CUSTOM_COMMAND_MAX_LENGTH = 4000;
export const CUSTOM_COMMAND_MAX_PER_CATEGORY = 100;

export type CommandCategory = "daily" | "chastity" | "release";
export type CustomCommand = { id: string; category: CommandCategory; text: string; createdAt: string; updatedAt: string };
export type SeenCommand = { category: CommandCategory; text: string; finalDay: boolean };
export type ManagementCommandSources = Record<string, string>;

const invalidMessage = "追加命令の保存データが不正です。";
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const isCommandCategory = (value: unknown): value is CommandCategory => value === "daily" || value === "chastity" || value === "release";
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= CUSTOM_COMMAND_MAX_LENGTH;
const isTimestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const isId = (value: unknown): value is string => typeof value === "string" && /^custom-[a-z0-9-]+$/.test(value) && value.length <= 100;

function decode(raw: string | null): unknown {
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { throw new Error(invalidMessage); }
}

export function parseCustomCommands(raw: string | null): CustomCommand[] {
  const value = decode(raw);
  if (value === null && raw === null) return [];
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.commands)) throw new Error(invalidMessage);
  const ids = new Set<string>();
  const counts = { daily: 0, chastity: 0, release: 0 };
  for (const command of value.commands) {
    if (!isObject(command) || !isId(command.id) || ids.has(command.id) || !isCommandCategory(command.category)
      || !isText(command.text) || !isTimestamp(command.createdAt) || !isTimestamp(command.updatedAt)) throw new Error(invalidMessage);
    ids.add(command.id);
    if (++counts[command.category] > CUSTOM_COMMAND_MAX_PER_CATEGORY) throw new Error(invalidMessage);
  }
  return value.commands as CustomCommand[];
}

export function parseSeenCommands(raw: string | null): SeenCommand[] {
  const value = decode(raw);
  if (value === null && raw === null) return [];
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.commands)
    || value.commands.some((item) => !isObject(item) || !isCommandCategory(item.category) || !isText(item.text) || typeof item.finalDay !== "boolean")) {
    throw new Error(invalidMessage);
  }
  return value.commands as SeenCommand[];
}

export function parseManagementCommandSources(raw: string | null): ManagementCommandSources {
  const value = decode(raw);
  if (value === null && raw === null) return {};
  if (!isObject(value) || value.version !== 1 || !isObject(value.sources)
    || Object.entries(value.sources).some(([key, id]) => !/^\d+:\d{4}-\d{2}-\d{2}$/.test(key) || !isId(id))) throw new Error(invalidMessage);
  return value.sources as ManagementCommandSources;
}

/** Used before restoring a backup, so invalid command data cannot replace good data. */
export function validateCustomCommandSettings(rows: readonly Record<string, unknown>[]) {
  const parsers: Record<string, (raw: string | null) => unknown> = {
    [CUSTOM_COMMANDS_KEY]: parseCustomCommands,
    [SEEN_COMMANDS_KEY]: parseSeenCommands,
    [MANAGEMENT_COMMAND_SOURCES_KEY]: parseManagementCommandSources,
  };
  const keys = new Set<string>();
  for (const row of rows) {
    const key = row.setting_key;
    if (typeof key !== "string" || !Object.hasOwn(parsers, key)) continue;
    if (keys.has(key) || typeof row.setting_value !== "string") throw new Error(invalidMessage);
    keys.add(key);
    parsers[key](row.setting_value);
  }
}
