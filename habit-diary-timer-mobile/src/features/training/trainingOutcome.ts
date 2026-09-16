export const trainingLevels = [
  { key: "easy", label: "イージー", rate: 1, targetSeconds: 5 * 60 },
  { key: "normal", label: "ノーマル", rate: 3, targetSeconds: 7 * 60 },
  { key: "hard", label: "ハード", rate: 5, targetSeconds: 10 * 60 },
] as const;

const requiredTag = "お仕置き対象";
const unnecessaryTag = "お仕置き不要";

export function trainingOutcomeTag(elapsedSeconds: number, targetSeconds: number): string {
  return elapsedSeconds < targetSeconds ? requiredTag : unnecessaryTag;
}

export function trainingNeedsPunishment(record: {
  tags: string | null;
  duration_seconds?: number | null;
}): boolean | null {
  const tags = new Set((record.tags ?? "").split(",").map((tag) => tag.trim()));
  const explicitlyRequired = tags.has(requiredTag);
  const explicitlyUnnecessary = tags.has(unnecessaryTag);
  if (explicitlyRequired && explicitlyUnnecessary) return null;
  if (explicitlyRequired) return true;
  if (explicitlyUnnecessary) return false;

  // Older records saved their difficulty and elapsed time, but not the outcome.
  const levels = trainingLevels.filter((level) => tags.has(level.label));
  const elapsedSeconds = record.duration_seconds;
  if (levels.length !== 1 || typeof elapsedSeconds !== "number"
    || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return null;
  return elapsedSeconds < levels[0].targetSeconds;
}
