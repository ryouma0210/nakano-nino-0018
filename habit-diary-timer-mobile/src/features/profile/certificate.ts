import { translateText, type AppLanguage } from "../../i18n";
import { toDateKey } from "../../utils/date";
import { invalidProfilePhotoMessage, profilePhotoMatchesSignature } from "../files/profilePhoto";
import { favoriteCategoryLabel, type FavoriteCandidate } from "./catalog";

// Intentionally accepts only the fields published in the activity certificate, never a profile object.
export type ActivityCertificateData = {
  name: string;
  photoDataUrl?: string | null;
  topFavorites: readonly FavoriteCandidate[];
  favoriteCount: number;
  activityCount: number;
  longestActivitySeconds: number | null;
  totalTimerSeconds: number;
  totalEarnedPoints: number;
  currentPoints: number;
  issuedAt: Date;
};

const locales: Record<AppLanguage, string> = { ja: "ja-JP", en: "en-US", ko: "ko-KR", zh: "zh-CN" };
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function escapeCertificateHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function validateCertificatePhotoDataUrl(value: string): string {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new Error(invalidProfilePhotoMessage);
  const prefix = match[2].slice(0, 16);
  const bytes: number[] = [];
  for (let index = 0; index < prefix.length; index += 4) {
    const [a, b, c, d] = [...prefix.slice(index, index + 4)].map((letter) => alphabet.indexOf(letter));
    bytes.push((a << 2) | (b >> 4));
    if (c !== -1) bytes.push(((b & 15) << 4) | (c >> 2));
    if (d !== -1) bytes.push(((c & 3) << 6) | d);
  }
  if (!profilePhotoMatchesSignature(Uint8Array.from(bytes), match[1])) throw new Error(invalidProfilePhotoMessage);
  return value;
}

function validIssueDate(date: Date): Date {
  if (!Number.isFinite(date.getTime())) throw new Error("発行日時を確認してください。");
  return date;
}

function metric(value: number, allowNegative = false): number {
  if (!Number.isFinite(value) || (!allowNegative && value < 0)) throw new Error("活動実績を読み込めませんでした。");
  return Math.floor(value);
}

export function formatCertificateDuration(seconds: number): string {
  const total = metric(seconds);
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map((value) => String(value).padStart(2, "0")).join(":");
}

export function activityCertificateFileName(issuedAt: Date, name: string): string {
  const date = toDateKey(validIssueDate(issuedAt));
  const fileNamePart = name.trim().replace(/[\\/:*?"<>|\p{Cc}]/gu, "").replace(/\s+/g, "") || "名前未設定";
  return `マゾ証明書_${date}_${fileNamePart}.png`;
}

// The browser and native image renderers share the same validated, localized content.
export function createActivityCertificatePresentation(data: ActivityCertificateData, language: AppLanguage = "ja") {
  const t = (text: string) => translateText(text, language);
  const photo = data.photoDataUrl ? validateCertificatePhotoDataUrl(data.photoDataUrl) : null;
  const date = new Intl.DateTimeFormat(locales[language], {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(validIssueDate(data.issuedAt));
  const number = (value: number, allowNegative = false) => new Intl.NumberFormat(locales[language]).format(metric(value, allowNegative));
  const seen = new Set<string>();
  const favorites = data.topFavorites.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  }).slice(0, 3);
  const values: [string, string][] = [
    ["オカズ登録数", number(data.favoriteCount)],
    ["活動回数", number(data.activityCount)],
    ["最長活動時間", data.longestActivitySeconds === null ? t("記録なし") : formatCertificateDuration(data.longestActivitySeconds)],
    ["タイマー累計", formatCertificateDuration(data.totalTimerSeconds)],
    ["累計獲得Pt", `${number(data.totalEarnedPoints)} Pt`],
    ["所持Pt", `${number(data.currentPoints, true)} Pt`],
  ];
  return {
    title: t("活動記録証明書"), nameLabel: t("氏名"), name: data.name,
    photoLabel: t("証明写真"), photoDataUrl: photo,
    favoritesLabel: t("オカズ上位3"), emptyFavoritesLabel: t("未登録"),
    favorites: favorites.map((candidate) => ({
      name: candidate.name,
      detail: [t(favoriteCategoryLabel(candidate.category)), candidate.work ?? ""].filter(Boolean).join(" / "),
    })),
    metrics: values.map(([label, value]) => ({ label: t(label), value })),
    issuedLabel: t("発行日時"), issuedAt: date,
    note: t("アプリに記録された活動実績をまとめた証明書です。"),
  };
}

export function createActivityCertificateHtml(data: ActivityCertificateData, language: AppLanguage = "ja"): string {
  const content = createActivityCertificatePresentation(data, language);
  const h = escapeCertificateHtml;
  const favoriteRows = content.favorites.map((candidate, index) => `<li>
    <span class="rank">${index + 1}</span><div><strong>${h(candidate.name)}</strong>
    <span class="detail">${h(candidate.detail)}</span></div>
  </li>`).join("");
  return `<!DOCTYPE html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(content.title)}</title><style>
@page { size: A4; margin: 0; }
.activity-certificate, .activity-certificate * { box-sizing: border-box; }
.activity-certificate { width: 210mm; min-height: 296mm; margin: 0; padding: 17mm; background: #fff; color: #26334b; font-family: Arial, "Noto Sans JP", sans-serif; font-size: 12px; line-height: 1.5; }
.activity-certificate .frame { border: 2px solid #9d8257; min-height: 261mm; padding: 12mm; }
.activity-certificate .brand { text-align: center; color: #80683f; font-size: 13px; letter-spacing: 3px; margin: 0 0 8px; }
.activity-certificate h1 { text-align: center; font-size: 28px; line-height: 1.3; margin: 0 0 8mm; font-weight: 700; }
.activity-certificate .identity { display: table; width: 100%; border-bottom: 1px solid #d5c8b3; padding-bottom: 7mm; }
.activity-certificate .identity-name { display: table-cell; vertical-align: middle; padding-right: 6mm; }
.activity-certificate .label, .activity-certificate .detail { display: block; color: #5f697a; font-size: 11px; }
.activity-certificate .name { font-size: 24px; font-weight: 700; overflow-wrap: anywhere; word-break: break-word; }
.activity-certificate .photo { display: table-cell; width: 30mm; height: 40mm; vertical-align: middle; text-align: center; background: #f3f4f6; color: #6e7582; }
.activity-certificate .photo-frame { display: flex; width: 30mm; height: 40mm; align-items: center; justify-content: center; }
.activity-certificate .photo img { display: block; width: auto; height: auto; max-width: 100%; max-height: 100%; }
.activity-certificate h2 { margin: 7mm 0 3mm; font-size: 16px; }
.activity-certificate ol { padding: 0; margin: 0; list-style: none; }
.activity-certificate li { display: flex; gap: 4mm; align-items: center; padding: 3mm 0; border-bottom: 1px solid #ece8e1; break-inside: avoid; overflow-wrap: anywhere; }
.activity-certificate .rank { color: #80683f; font-size: 18px; min-width: 5mm; }
.activity-certificate li strong { font-size: 15px; }
.activity-certificate table { border-collapse: collapse; width: 100%; margin-top: 7mm; }
.activity-certificate th, .activity-certificate td { text-align: left; padding: 3mm; border-bottom: 1px solid #e2e5e9; }
.activity-certificate th { width: 55%; font-weight: 400; background: #f5f6f8; }
.activity-certificate td { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
.activity-certificate .issued { margin: 7mm 0 2mm; font-size: 11px; }
.activity-certificate .note { margin: 0; color: #5f697a; font-size: 10px; }
</style></head><body style="margin:0"><main class="page activity-certificate"><div class="frame">
<p class="brand">Nino Room</p><h1>${h(content.title)}</h1>
<div class="identity"><div class="identity-name"><span class="label">${h(content.nameLabel)}</span><div class="name">${h(content.name)}</div></div>
<div class="photo"><div class="photo-frame">${content.photoDataUrl ? `<img src="${content.photoDataUrl}" alt="${h(content.photoLabel)}">` : h(content.photoLabel)}</div></div></div>
<h2>${h(content.favoritesLabel)}</h2>${content.favorites.length ? `<ol>${favoriteRows}</ol>` : `<p class="detail">${h(content.emptyFavoritesLabel)}</p>`}
<table><tbody>${content.metrics.map(({ label, value }) => `<tr><th scope="row">${h(label)}</th><td>${h(value)}</td></tr>`).join("")}</tbody></table>
<p class="issued">${h(content.issuedLabel)}: ${h(content.issuedAt)}</p>
<p class="note">${h(content.note)}</p>
</div></main></body></html>`;
}
