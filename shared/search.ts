/** Match compatibility-width characters and letter case without changing stored text. */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}
