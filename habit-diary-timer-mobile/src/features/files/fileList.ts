import type { FilePurpose, StoredFile } from "../../services/fileStorageService";

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

export function filterAndSortFiles(
  files: readonly StoredFile[],
  purpose: FilePurposeFilter,
  search: string,
  sort: FileSortOrder,
) {
  const query = search.trim().toLocaleLowerCase();
  return files.filter((file) => (
    (purpose === "all" || file.purpose === purpose)
    && (displayedFileName(file).toLocaleLowerCase().includes(query)
      || file.name.toLocaleLowerCase().includes(query))
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
