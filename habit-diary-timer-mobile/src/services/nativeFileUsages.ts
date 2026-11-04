import * as FileSystem from "expo-file-system/legacy";
import { isFilePurpose, isValidFileUsages, type FileUsage } from "../features/files/usages";
import { isValidFileDisplayName } from "../features/files/details";

export type NativeFileDetails = { usages?: FileUsage[]; displayName?: string };
export type NativeFileUsages = Record<string, NativeFileDetails>;
const directory = ".usages/";
const filename = "current.json";
const previousFilename = "previous.json";

async function exists(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory;
}

/** Recover the previous complete metadata if the app stopped during replacement. */
export async function readNativeFileUsages(root: string): Promise<NativeFileUsages> {
  const current = `${root}${directory}${filename}`;
  const previous = `${root}${directory}${previousFilename}`;
  const uri = await exists(current) ? current : await exists(previous) ? previous : null;
  if (!uri) return {};
  const value: unknown = JSON.parse(await FileSystem.readAsStringAsync(uri));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ファイルの用途データが不正です。");
  const result: NativeFileUsages = {};
  for (const [key, entry] of Object.entries(value)) {
    const identity: unknown = JSON.parse(key);
    // Older versions stored the usage array directly under each stable key.
    const metadata: unknown = Array.isArray(entry) ? { usages: entry } : entry;
    if (!Array.isArray(identity) || identity.length !== 2 || !isFilePurpose(identity[0])
      || identity[0] === "chastity" || identity[0] === "profile" || typeof identity[1] !== "string" || !identity[1]
      || !metadata || typeof metadata !== "object" || Array.isArray(metadata)
      || !isValidFileUsages(identity[0], (metadata as NativeFileDetails).usages)
      || !isValidFileDisplayName((metadata as NativeFileDetails).displayName)) throw new Error("ファイルの用途データが不正です。");
    const { usages, displayName } = metadata as NativeFileDetails;
    result[key] = { ...(usages ? { usages } : {}), ...(displayName !== undefined ? { displayName } : {}) };
  }
  return result;
}

/** Only small metadata is written. The media directory and bytes stay untouched. */
export async function writeNativeFileUsages(root: string, usages: NativeFileUsages) {
  const base = `${root}${directory}`;
  const current = `${base}${filename}`;
  const previous = `${base}${previousFilename}`;
  const pending = `${base}pending.json`;
  await FileSystem.makeDirectoryAsync(base, { intermediates: true });
  if (!await exists(current) && await exists(previous)) {
    await FileSystem.moveAsync({ from: previous, to: current });
  }
  await FileSystem.writeAsStringAsync(pending, JSON.stringify(usages));
  const hadCurrent = await exists(current);
  if (hadCurrent) {
    await FileSystem.deleteAsync(previous, { idempotent: true });
    await FileSystem.moveAsync({ from: current, to: previous });
  }
  try {
    await FileSystem.moveAsync({ from: pending, to: current });
  } catch (error) {
    await FileSystem.deleteAsync(current, { idempotent: true });
    if (hadCurrent) await FileSystem.moveAsync({ from: previous, to: current });
    throw error;
  }
  // Failure to remove an old metadata copy must not report a successful write as failed.
  await FileSystem.deleteAsync(previous, { idempotent: true }).catch((error) => console.warn("Could not clean up file usage metadata", error));
}
