import type { FilePurpose, StoredFile } from "../../services/fileStorageService";
import { fileHasPurpose } from "./usages";
import { normalizeSearchText } from "@nino/shared/search";

export type FileSortOrder = "newest" | "oldest" | "name" | "size";
export type FilePurposeFilter = "all" | FilePurpose;

export function storedFileKey(file: StoredFile) {
  return `${file.purpose}:${file.name}`;
}

function storedNameParts(name: string) {
  const match = name.match(/^(\d{13})_(?:(\d+)_)?/);
  return {
    name: match ? name.slice(match[0].length) : name,
    timestamp: match ? Number(match[1]) : null,
    sequence: match?.[2] ? Number(match[2]) : 0,
  };
}

export function displayedFileName(file: StoredFile) {
  return storedNameParts(file.name).name;
}

/** Search does not reorder media or change selections owned by the caller. */
export function filterFilesByName(files: readonly StoredFile[], search: string) {
  const query = normalizeSearchText(search).trim();
  return files.filter((file) => normalizeSearchText(displayedFileName(file)).includes(query)
    || normalizeSearchText(file.name).includes(query));
}

export function filterAndSortFiles(
  files: readonly StoredFile[],
  purpose: FilePurposeFilter,
  search: string,
  sort: FileSortOrder,
) {
  return filterFilesByName(files, search).filter((file) => (
    file.purpose !== "chastity" && (purpose === "all" || fileHasPurpose(file, purpose))
  )).sort((left, right) => {
    const a = storedNameParts(left.name);
    const b = storedNameParts(right.name);
    const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
      || storedFileKey(left).localeCompare(storedFileKey(right));
    if (sort === "name") return byName;
    if (sort === "size") return right.size - left.size || byName;
    // Older backups can contain names with no import date. Keep them at the end.
    if (a.timestamp === null) return b.timestamp === null ? byName : 1;
    if (b.timestamp === null) return -1;
    const byDate = a.timestamp - b.timestamp || a.sequence - b.sequence;
    return (sort === "newest" ? -byDate : byDate) || byName;
  });
}

export function selectedVisibleFiles(files: readonly StoredFile[], selectedKeys: ReadonlySet<string>) {
  return files.filter((file) => selectedKeys.has(storedFileKey(file)));
}
