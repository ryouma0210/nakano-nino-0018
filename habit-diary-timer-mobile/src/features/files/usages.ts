export const FILE_USAGES = ["training", "punishment", "endurance"] as const;
export type FileUsage = typeof FILE_USAGES[number];
/** The physical location is also the stable identity used by existing records. */
export type FilePurpose = FileUsage | "chastity" | "profile";
export type FileUsageMetadata = { purpose: FilePurpose; usages?: FileUsage[] };

export function isFilePurpose(value: unknown): value is FilePurpose {
  return value === "chastity" || value === "profile" || FILE_USAGES.some((usage) => usage === value);
}

export function isValidFileUsages(purpose: FilePurpose, value: unknown): value is FileUsage[] | undefined {
  if (value === undefined) return true;
  return purpose !== "chastity" && purpose !== "profile" && Array.isArray(value) && value.length > 0
    && value.length <= FILE_USAGES.length && new Set(value).size === value.length
    && value.every((usage) => FILE_USAGES.includes(usage));
}

export function getFileUsages(file: FileUsageMetadata): FileUsage[] {
  if (file.purpose === "chastity" || file.purpose === "profile") return [];
  const usages = file.usages ?? [file.purpose];
  return FILE_USAGES.filter((usage) => usages.includes(usage));
}

export function fileHasPurpose(file: FileUsageMetadata, purpose: FilePurpose): boolean {
  if (purpose === "chastity" || purpose === "profile") return file.purpose === purpose;
  return getFileUsages(file).includes(purpose);
}

export function fileUsageKey(file: { purpose: FilePurpose; name: string }) {
  return JSON.stringify([file.purpose, file.name]);
}
