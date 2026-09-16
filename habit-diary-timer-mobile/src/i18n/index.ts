import en from "./en.json";
import ko from "./ko.json";
import zh from "./zh.json";
import { translationTemplates } from "./templates";

export type AppLanguage = "ja" | "en" | "ko" | "zh";
type TranslationCatalog = Record<string, string>;

function normalizeTranslationKey(value: string) {
  return value.replace(/\\n/g, "\n").replace(/\s+/g, " ").replace(/([。！？])\s+/g, "$1").trim();
}

function withWhitespaceAliases(catalog: TranslationCatalog) {
  const expanded: TranslationCatalog = Object.assign(Object.create(null), catalog);
  for (const [source, translated] of Object.entries(catalog)) {
    const normalizedSource = normalizeTranslationKey(source);
    if (normalizedSource && expanded[normalizedSource] === undefined) {
      expanded[normalizedSource] = translated.replace(/\\n/g, "\n").trim();
    }
  }
  return expanded;
}

const catalogs: Record<Exclude<AppLanguage, "ja">, TranslationCatalog> = {
  en: withWhitespaceAliases(en),
  ko: withWhitespaceAliases(ko),
  zh: withWhitespaceAliases(zh),
};
const patterns = new Map<AppLanguage, RegExp>();
const cache = new Map<string, string>();
const languageColumns = { en: 1, ko: 2, zh: 3 } as const;

const numericUnitTranslations: Record<Exclude<AppLanguage, "ja">, Record<string, string>> = {
  en: { 回: " times", 分: " min", 秒: " sec", 日: " days", 月: " months", 年: " years", 枚: " items", 個: " items", 体: " defeated", 円: " yen", 倍: "×" },
  ko: { 回: "회", 分: "분", 秒: "초", 日: "일", 月: "개월", 年: "년", 枚: "장", 個: "개", 体: "마리", 円: "엔", 倍: "배" },
  zh: { 回: "次", 分: "分钟", 秒: "秒", 日: "天", 月: "个月", 年: "年", 枚: "张", 個: "个", 体: "只", 円: "日元", 倍: "倍" },
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const templates = translationTemplates.map((entry) => {
  const slots: number[] = [];
  const parts = normalizeTranslationKey(entry[0]).split(/(\{\d+\})/);
  const pattern = parts.map((part, index) => {
    if (/^\{\d+\}$/.test(part)) {
      slots.push(Number(part.slice(1, -1)));
      const following = parts[index + 1] ?? "";
      const preceding = parts[index - 1] ?? "";
      if (/^(pt|Pt|回|秒|分|日|か月|個|列|種類|体|枚|倍|レベル|HP|MP)/.test(following) || /(Lv\.|MP|HP|あと)$/.test(preceding)) {
        return "\\s*?(-?\\d[\\d,]*(?:\\.\\d+)?)\\s*?";
      }
      return "(.*?)";
    }
    return escapeRegExp(part).replace(/ /g, "\\s*?").replace(/([。！？])/g, "$1\\s*?");
  }).join("");
  return { entry, slots, pattern: new RegExp(`^${pattern}$`, "s") };
}).sort((a, b) => b.entry[0].replace(/\{\d+\}/g, "").length - a.entry[0].replace(/\{\d+\}/g, "").length);

function translateTemplate(value: string, language: Exclude<AppLanguage, "ja">): string | null {
  for (const { entry, slots, pattern } of templates) {
    if (value.includes("\n") && !entry[0].includes("\n")) continue;
    const match = value.match(pattern);
    if (!match) continue;
    const values = new Map(slots.map((slot, index) => [slot,
      entry[4]?.includes(slot) ? match[index + 1] : match[index + 1].replace(/^[^\S\r\n]+|[^\S\r\n]+$/g, ""),
    ]));
    return inflectTemplate(entry[languageColumns[language]], values, language).replace(/\{(\d+)\}/g, (_, slot: string) => {
      const source = values.get(Number(slot)) ?? "";
      return entry[4]?.includes(Number(slot)) ? source : translateText(source, language);
    });
  }
  return null;
}

const englishMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekdays: Record<AppLanguage, readonly string[]> = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ko: ["일", "월", "화", "수", "목", "금", "토"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
};

export function translateWeekday(day: number, language: AppLanguage): string {
  return weekdays[language][day] ?? "";
}

function inflectTemplate(template: string, values: ReadonlyMap<number, string>, language: AppLanguage) {
  if (language !== "en") return template;
  return template.replace(/\{(\d+)\}( more)? (times|days|months|years|items|files|columns|weak spots|levels)\b( were)?/g, (match, slot: string, more: string | undefined, unit: string, verb: string | undefined) =>
    values.get(Number(slot)) === "1" ? `{${slot}}${more ?? ""} ${unit.slice(0, -1)}${verb ? " was" : ""}` : match);
}

export function translateWithValues(source: string, values: readonly string[], language: AppLanguage): string {
  const entry = translationTemplates.find((item) => normalizeTranslationKey(item[0]) === normalizeTranslationKey(source));
  const template = language === "ja" ? source : entry?.[languageColumns[language]] ?? source;
  return inflectTemplate(template, new Map(values.map((value, index) => [index, value])), language).replace(/\{(\d+)\}/g, (_, slot: string) => {
    const value = values[Number(slot)] ?? "";
    return language === "ja" || entry?.[4]?.includes(Number(slot)) ? value : translateText(value, language);
  });
}

function translateDate(value: string, language: Exclude<AppLanguage, "ja">): string | null {
  const date = value.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日(?:（([日月火水木金土])）)?)?$/);
  if (date) {
    const [, year, month, day, weekday] = date;
    if (Number(month) < 1 || Number(month) > 12) return null;
    let result = language === "en"
      ? `${englishMonths[Number(month) - 1]}${day ? ` ${day},` : ""} ${year}`
      : language === "ko" ? `${year}년 ${month}월${day ? ` ${day}일` : ""}`
        : `${year}年${month}月${day ? `${day}日` : ""}`;
    if (weekday) {
      const label = translateWeekday("日月火水木金土".indexOf(weekday), language);
      result += language === "zh" ? `（${label}）` : ` (${label})`;
    }
    return result;
  }
  const month = value.match(/^(\d{1,2})月$/);
  if (month && Number(month[1]) >= 1 && Number(month[1]) <= 12) {
    return language === "en" ? englishMonths[Number(month[1]) - 1] : language === "ko" ? `${month[1]}월` : value;
  }
  return null;
}

function getPattern(language: Exclude<AppLanguage, "ja">) {
  const cached = patterns.get(language);
  if (cached) return cached;
  const keys = Object.keys(catalogs[language])
    // One-character entries are usually particles and must not be replaced
    // inside sentences. 「マゾ」 can be a saved player name, so it is also
    // protected from fragment replacement. Exact labels still translate.
    .filter((key) => key.length >= 2 && key.length <= 500 && key !== "マゾ")
    .sort((a, b) => b.length - a.length);
  const pattern = keys.length > 0
    ? new RegExp(keys.map(escapeRegExp).join("|"), "g")
    : /$a/;
  patterns.set(language, pattern);
  return pattern;
}

function translateNamedMessage(
  value: string,
  language: Exclude<AppLanguage, "ja">,
  catalog: TranslationCatalog,
): string | null {
  // A saved name can itself contain punctuation. Find the separator whose
  // suffix is a complete known message instead of splitting at the first dot.
  for (let index = 1; index <= Math.min(40, value.length - 1); index++) {
    if (value[index] !== "。") continue;
    const prefix = value.slice(0, index);
    if (/[\r\n]/.test(prefix) || catalog[`${prefix}。`] !== undefined) continue;
    const message = value.slice(index + 1);
    const translatedMessage = catalog[message] ?? catalog[normalizeTranslationKey(message)];
    if (translatedMessage) return `${prefix}${language === "zh" ? "，" : ", "}${translatedMessage}`;
  }
  return null;
}

export function translateText(value: string, language: AppLanguage): string {
  if (language === "ja" || value.length === 0) return value;
  const cacheKey = `${language}\u0000${value}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;
  const catalog = catalogs[language];
  const exact = catalog[value];
  const trimmed = value.trim();
  // File names and storage/download locations are user data, even if their
  // names happen to contain catalog words. Never rewrite the displayed path.
  if (exact === undefined && !/[\r\n]/.test(value) && (
    /^(?:[a-z][a-z\d+.-]*:\/\/|data:|blob:|[a-z]:[\\/])/i.test(trimmed)
    || /^[^\\/:*?"<>|]+\.(?:pdf|png|jpe?g|webp|gif|mp4|mov|webm|mp3|m4a|wav|ogg|json|zip)$/i.test(trimmed)
  )) return value;
  const normalizedTrimmed = normalizeTranslationKey(trimmed);
  const whitespaceExact = normalizedTrimmed && catalog[normalizedTrimmed];
  // Known complete prose must win over the saved-name heuristic. Otherwise a
  // normal first sentence gets mistaken for the player's name and stays Japanese.
  let translated = exact ?? (whitespaceExact
    ? `${value.slice(0, value.indexOf(trimmed))}${whitespaceExact}${value.slice(value.indexOf(trimmed) + trimmed.length)}`
    : undefined);
  if (translated === undefined) {
    const whole = translateDate(trimmed, language)
      ?? translateTemplate(trimmed, language)
      ?? translateNamedMessage(trimmed, language, catalog);
    if (whole !== null) {
      translated = `${value.slice(0, value.indexOf(trimmed))}${whole}${value.slice(value.indexOf(trimmed) + trimmed.length)}`;
    } else if (value.includes("\n")) {
      const lines = value.split("\n");
      const blocks: string[] = [];
      for (let start = 0; start < lines.length;) {
        let end = lines.length;
        let block: string | null = null;
        for (; end > start + 1; end--) {
          const candidate = lines.slice(start, end).join("\n");
          const normalized = normalizeTranslationKey(candidate);
          block = catalog[candidate] ?? (normalized ? catalog[normalized] : undefined)
            ?? translateNamedMessage(candidate, language, catalog);
          if (block !== null && block !== undefined) break;
        }
        blocks.push(block ?? translateText(lines[start], language));
        start = block === null || block === undefined ? start + 1 : end;
      }
      translated = blocks.join("\n");
    } else {
      const sentences = value.match(/[^。！？]+[。！？]?/g);
      if (sentences && sentences.length > 1) {
        translated = sentences.map((sentence) => translateText(sentence, language)).join(language === "zh" ? "" : " ");
      } else {
        // Localize numbers before fragment matching so calendar/duration units
        // cannot be confused with weekday labels or lose their spacing.
        translated = value.replace(/(-?\d[\d,]*(?:\.\d+)?)(か月|日間|回|分|秒|日|年|枚|個|体|円|倍)/g, (_, count: string, unit: string) => {
          if (unit === "か月") return `${count}${language === "en" ? (count === "1" ? " month" : " months") : language === "ko" ? "개월" : "个月"}`;
          if (unit === "日間") unit = "日";
          const translatedUnit = numericUnitTranslations[language][unit];
          return `${count}${language === "en" && count === "1" ? translatedUnit.replace(/s$/, "") : translatedUnit}`;
        });
        translated = translated.replace(getPattern(language), (source) => catalog[source] ?? source);
      }
    }
  }
  if (cache.size >= 2000) cache.clear();
  cache.set(cacheKey, translated);
  return translated;
}
