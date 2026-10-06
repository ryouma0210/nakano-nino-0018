const stageLabels = {
  beginner: "初級サキュバス",
  middle: "上級サキュバス",
  queen: "女王サキュバス",
} as const;

const sceneLabels = {
  chest: "おっぱい",
  back: "お尻",
  foot: "足裏",
} as const;

/** Display stored unlock keys without changing their purchase or unlock identity. */
export function getOutsideLossMemoryLabel(memoryKey: string | null): string {
  const match = memoryKey?.match(/^(beginner|middle|queen):(chest|back|foot)$/);
  if (!match) return memoryKey ?? "";
  const stage = match[1] as keyof typeof stageLabels;
  const scene = match[2] as keyof typeof sceneLabels;
  return `${stageLabels[stage]} / ${sceneLabels[scene]}`;
}
