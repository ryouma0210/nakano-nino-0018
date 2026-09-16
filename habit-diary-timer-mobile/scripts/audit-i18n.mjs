import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const catalogs = Object.fromEntries(await Promise.all(["en", "ko", "zh"].map(async (language) => [
  language,
  JSON.parse(await readFile(path.join(root, "src", "i18n", `${language}.json`), "utf8")),
])));
const normalize = (value) => value.replace(/\\n/g, "\n").replace(/\s+/g, " ").replace(/([。！？])\s+/g, "$1").trim();
const normalizedCatalogs = Object.fromEntries(Object.entries(catalogs).map(([language, catalog]) => [
  language,
  new Set(Object.keys(catalog).map(normalize)),
]));
const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const ignored = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|PRAGMA|ALTER|DROP)\b/i;
const allowedNativeLabels = new Set(["English", "한국어", "简体中文"]);
const extensions = new Set([".ts", ".tsx"]);
const templateSource = ts.createSourceFile("templates.ts", await readFile(path.join(root, "src", "i18n", "templates.ts"), "utf8"), ts.ScriptTarget.Latest, true);
const templateKeys = new Set();
const inspectTemplates = (node) => {
  if (ts.isArrayLiteralExpression(node) && node.elements.length >= 4 && node.elements.slice(0, 4).every(ts.isStringLiteral)) {
    templateKeys.add(normalize(node.elements[0].text));
  }
  ts.forEachChild(node, inspectTemplates);
};
inspectTemplates(templateSource);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return extensions.has(path.extname(entry.name)) ? [fullPath] : [];
  }));
  return nested.flat();
}

const missing = { en: [], ko: [], zh: [] };
for (const file of [...await listFiles(path.join(root, "app")), ...await listFiles(path.join(root, "src")), ...await listFiles(path.join(root, "..", "shared"))]) {
  if (file.includes(`${path.sep}i18n${path.sep}`) || /\.test\.tsx?$/.test(file)) continue;
  const sourceText = await readFile(file, "utf8");
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const inspect = (node) => {
    if (ts.isTemplateExpression(node)) {
      const fullKey = node.head.text + node.templateSpans.map((span, index) => `{${index}}${span.literal.text}`).join("");
      const isDate = /^\{0\}年\{1\}月(?:\{2\}日(?:（\{3\}）)?)?$/.test(fullKey);
      if (isDate || templateKeys.has(normalize(fullKey))) {
        for (const span of node.templateSpans) inspect(span.expression);
        return;
      }
    }
    let value = null;
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) value = node.text;
    if (value && japanese.test(value) && !allowedNativeLabels.has(value.trim()) && !ignored.test(value.trim()) && value.length <= 500) {
      const normalized = normalize(value);
      for (const language of Object.keys(catalogs)) {
        if (!normalizedCatalogs[language].has(normalized) && !templateKeys.has(normalized)) {
          missing[language].push({ file: path.relative(root, file), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: normalized });
        }
      }
    }
    ts.forEachChild(node, inspect);
  };
  inspect(source);
}

let failed = false;
const allKeys = new Set(Object.values(catalogs).flatMap(Object.keys));
for (const [language, catalog] of Object.entries(catalogs)) {
  const problems = [];
  for (const key of allKeys) {
    const translated = catalog[key];
    if (typeof translated !== "string" || (!translated.trim() && !(language === "zh" && key === "を"))) {
      problems.push(`Missing or empty translation: ${key}`);
      continue;
    }
    // Legacy catalog entries include SQL and HTML. They are not UI prose.
    if (ignored.test(key.trim()) || /<[a-z!/]/i.test(key)) continue;
    if (/___\w+_\d+___|\uFFFD/.test(translated)) problems.push(`Broken placeholder or encoding: ${key}`);
    const untranslatedScript = language === "zh" ? /[\p{Script=Hiragana}\p{Script=Katakana}]/u : japanese;
    if (untranslatedScript.test(translated) && !allowedNativeLabels.has(translated)) {
      problems.push(`Japanese remains in translation: ${key}`);
    }
  }
  console.log(`${language}: ${problems.length} catalog integrity issues`);
  for (const problem of problems.slice(0, 100)) console.log(`  ${problem}`);
  if (problems.length > 0) failed = true;
}
for (const [language, items] of Object.entries(missing)) {
  const unique = [...new Map(items.map((item) => [`${item.file}:${item.line}:${item.text}`, item])).values()];
  console.log(`${language}: ${unique.length} untranslated Japanese strings`);
  for (const item of unique.slice(0, 100)) console.log(`  ${item.file}:${item.line} ${item.text}`);
  if (unique.length > 0) failed = true;
}
if (failed) process.exitCode = 1;
