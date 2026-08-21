import en from "./en.json";
import ko from "./ko.json";

export type AppLanguage = "ja" | "en" | "ko";
type TranslationCatalog = Record<string, string>;

function withWhitespaceAliases(catalog: TranslationCatalog) {
  const expanded = { ...catalog };
  for (const [source, translated] of Object.entries(catalog)) {
    const normalizedSource = source.replace(/\s+/g, " ").trim();
    if (normalizedSource && expanded[normalizedSource] === undefined) {
      expanded[normalizedSource] = translated.replace(/\s+/g, " ").trim();
    }
  }
  return expanded;
}

const catalogs: Record<Exclude<AppLanguage, "ja">, TranslationCatalog> = {
  en: withWhitespaceAliases(en),
  ko: withWhitespaceAliases(ko),
};
const patterns = new Map<AppLanguage, RegExp>();
const cache = new Map<string, string>();

const numericUnitTranslations: Record<Exclude<AppLanguage, "ja">, Record<string, string>> = {
  en: { 回: " times", 分: " min", 秒: " sec", 日: " days", 月: " months", 年: " years", 枚: " items", 個: " items", 円: " yen", 倍: "×" },
  ko: { 回: "회", 分: "분", 秒: "초", 日: "일", 月: "개월", 年: "년", 枚: "장", 個: "개", 円: "엔", 倍: "배" },
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function translateStructuredText(value: string, language: Exclude<AppLanguage, "ja">): string | null {
  const available = value.match(/^(.+)は(\d+)ptで交換できます。$/);
  if (available) {
    const item: string = translateText(available[1], language);
    return language === "en"
      ? `${item} can be exchanged for ${available[2]}pt.`
      : `${item}은(는) ${available[2]}pt로 교환할 수 있습니다.`;
  }
  const exchanged = value.match(/^(.+)を(\d+)ptで交換しました。$/);
  if (exchanged) {
    const item: string = translateText(exchanged[1], language);
    return language === "en"
      ? `${item} was exchanged for ${exchanged[2]}pt.`
      : `${item}을(를) ${exchanged[2]}pt로 교환했습니다.`;
  }
  return null;
}

function translateNamedMessage(
  value: string,
  language: Exclude<AppLanguage, "ja">,
  catalog: TranslationCatalog,
): string | null {
  const match = value.match(/^([^。\n]{1,40})。(.*)$/s);
  if (!match) return null;
  const [, playerName, message] = match;
  const translatedMessage = catalog[message];
  if (!translatedMessage) return null;
  return language === "en"
    ? `${playerName}. ${translatedMessage}`
    : `${playerName}님, ${translatedMessage}`;
}

export function translateText(value: string, language: AppLanguage): string {
  if (language === "ja" || value.length === 0) return value;
  const cacheKey = `${language}\u0000${value}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;
  const catalog = catalogs[language];
  const namedMessage = translateNamedMessage(value, language, catalog);
  if (namedMessage !== null) {
    cache.set(cacheKey, namedMessage);
    return namedMessage;
  }
  const structured = translateStructuredText(value, language);
  if (structured !== null) {
    cache.set(cacheKey, structured);
    return structured;
  }
  const exact = catalog[value];
  const trimmed = value.trim();
  const whitespaceExact = trimmed && catalog[trimmed];
  let translated = exact
    ?? (whitespaceExact ? value.replace(trimmed, whitespaceExact) : value.replace(getPattern(language), (source) => catalog[source] ?? source));
  translated = translated.replace(/(?<=\d)(回|分|秒|日|月|年|枚|個|円|倍)/g, (unit) => numericUnitTranslations[language][unit] ?? unit);
  if (language === "en") {
    translated = translated.replace(/(?<=\d)(times|min|sec|days|months|years|items|yen)(?=\b)/g, " $1");
  }
  cache.set(cacheKey, translated);
  return translated;
}
