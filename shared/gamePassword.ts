// One source for the game's validator and the password included in rewards.
export const GAME_UNLOCK_PASSWORD = "NinoLave20260505";
export const GAME_PASSWORD_LABEL = "ゲームのPW（⑤・⑥）";
const passwordSuffix = `\n\n${GAME_PASSWORD_LABEL}\n${GAME_UNLOCK_PASSWORD}`;

export function stripGamePassword(content: string): string {
  return content.endsWith(passwordSuffix) ? content.slice(0, -passwordSuffix.length) : content;
}

export function appendGamePassword(content: string): string {
  return `${stripGamePassword(content)}${passwordSuffix}`;
}
