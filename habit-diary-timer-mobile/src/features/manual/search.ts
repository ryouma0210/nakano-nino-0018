import type { ManualSection } from "./content";
import { normalizeSearchText } from "@nino/shared/search";

export function searchManual(sections: readonly ManualSection[], keyword: string, translate: (text: string) => string = (text) => text) {
  const terms = normalizeSearchText(keyword).trim().split(/\s+/).filter(Boolean);
  return sections.flatMap((section) => section.entries.filter((entry) => {
    const fields = [section.title, entry.title, entry.summary, ...entry.details];
    const text = normalizeSearchText(fields.flatMap((field) => [field, translate(field)]).join("\n"));
    return terms.every((term) => text.includes(term));
  }).map((entry) => ({ section, entry })));
}
