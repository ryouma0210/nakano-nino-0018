import { describe, expect, it } from "vitest";
import {
  activityCertificateFileName, createActivityCertificateHtml, createActivityCertificatePresentation, formatCertificateDuration,
  validateCertificatePhotoDataUrl, type ActivityCertificateData,
} from "./certificate";
import type { FavoriteCandidate } from "./catalog";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=";
const favorites: readonly FavoriteCandidate[] = [
  { id: "fixture-a", name: "Alex", category: "anime", work: "Fixture Story" },
  { id: "fixture-b", name: "Sam", category: "custom" },
  { id: "fixture-c", name: "Robin", category: "custom" },
  { id: "fixture-d", name: "Casey", category: "custom" },
];
const data: ActivityCertificateData = {
  name: "Test User", photoDataUrl: png, topFavorites: favorites.slice(0, 3), topWeaknesses: ["Early mornings", "Cold weather"],
  erectionLengthCm: "12.50", masturbationPerWeek: "0",
  favoriteCount: 12, weaknessCount: 17, longestActivitySeconds: 3661, totalTimerSeconds: 100000,
  outsidePlayerLevel: 150, outsideSuccubusLevel: 220,
  totalEarnedPoints: 12000, currentPoints: 450, issuedAt: new Date(2026, 9, 13, 0, 3, 4),
};

describe("activity certificate HTML", () => {
  it("publishes only ranked entries and permitted metrics without leaking private profile fields", () => {
    const input = {
      ...data, privateNotes: "PRIVATE_NOTE", weaknessCandidates: ["PRIVATE_CANDIDATE"],
      favoriteCandidateIds: ["PRIVATE_FAVORITE"], sexualExperience: "PRIVATE_STATUS", weaknesses: ["PRIVATE_UNRANKED"],
      rightHeaderLabel: "PRIVATE_HEADER", rightHeaderValue: "PRIVATE_PERSON",
    } as ActivityCertificateData;
    const html = createActivityCertificateHtml(input);
    expect(html).toContain("活動記録証明書");
    expect(html).toContain('class="page activity-certificate"');
    expect(html).toContain(`src="${png}"`);
    expect(html.indexOf("Alex")).toBeLessThan(html.indexOf("Sam"));
    expect(html.indexOf("Sam")).toBeLessThan(html.indexOf("Robin"));
    expect(html).toContain("アニメ / Fixture Story");
    expect(html.indexOf("Early mornings")).toBeLessThan(html.indexOf("Cold weather"));
    expect(html).toContain("01:01:01");
    expect(html).toContain("27:46:40");
    expect(html).toContain("12,000 Pt");
    expect(html).not.toContain("PRIVATE_");
    expect(JSON.stringify(createActivityCertificatePresentation(input))).not.toContain("PRIVATE_");
  });

  it("escapes names, weaknesses and recorded strings without allowing HTML injection", () => {
    const html = createActivityCertificateHtml({ ...data, name: '<img src=x onerror="bad">&\'',
      erectionLengthCm: '<span>12.50 & "value"</span>', masturbationPerWeek: '</td><script>bad()</script>',
      topFavorites: [{ id: "fixture", name: "<Name & Friend>", work: '</span><script>bad()</script>', category: "anime" }],
      topWeaknesses: ['<script>weakness("x")</script> & \'quoted\''],
    }, "en");
    expect(html).toContain("&lt;img src=x onerror=&quot;bad&quot;&gt;&amp;&#39;");
    expect(html).toContain("&lt;span&gt;12.50 &amp; &quot;value&quot;&lt;/span&gt;");
    expect(html).toContain("&lt;/td&gt;&lt;script&gt;bad()&lt;/script&gt;");
    expect(html).toContain("&lt;Name &amp; Friend&gt;");
    expect(html).toContain("&lt;/span&gt;&lt;script&gt;bad()&lt;/script&gt;");
    expect(html).toContain("&lt;script&gt;weakness(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;");
    expect(html).not.toContain("<script>");
  });

  it("limits weaknesses to five unique entries and handles missing photo or activity", () => {
    const html = createActivityCertificateHtml({ ...data, photoDataUrl: null, longestActivitySeconds: null, topFavorites: [],
      topWeaknesses: ["First", "First", "Second", "Third", "Fourth", "Fifth", "Sixth"],
    });
    expect(html.match(/<li>/g)).toHaveLength(5);
    expect(html).toContain("Fifth");
    expect(html).not.toContain("Sixth");
    expect(html).not.toContain("<img");
    expect(html).toContain("記録なし");
    expect(createActivityCertificateHtml({ ...data, topWeaknesses: [] })).toContain("未登録");
  });

  it("rejects invalid metrics and dates instead of inventing recorded values", () => {
    for (const field of ["weaknessCount", "outsidePlayerLevel", "outsideSuccubusLevel"] as const) {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        expect(() => createActivityCertificateHtml({ ...data, [field]: value })).toThrow("活動実績を読み込めませんでした。");
      }
    }
    expect(() => createActivityCertificateHtml({ ...data, totalTimerSeconds: -1 })).toThrow();
    expect(() => createActivityCertificateHtml({ ...data, issuedAt: new Date("invalid") })).toThrow();
    expect(formatCertificateDuration(0)).toBe("00:00:00");
    expect(activityCertificateFileName(data.issuedAt, data.name)).toBe("活動記録証明書_2026-10-13_TestUser.png");
  });

  it("renders both rankings and five four-cell metric rows in their published order", () => {
    const html = createActivityCertificateHtml(data);
    expect(html).toContain("弱点上位5");
    expect(html).toContain('class="ranking-column favorites"');
    expect(html.match(/<ol\b/g)).toHaveLength(2);
    const rows = html.match(/<tr>[\s\S]*?<\/tr>/g)!;
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.match(/<th\b/g)).toHaveLength(2);
      expect(row.match(/<td\b/g)).toHaveLength(2);
    }
    expect(rows[0]).toMatch(/長さ（cm）[\s\S]*?<td[^>]*>12\.50<\/td>[\s\S]*?頻度（回\/1週間）[\s\S]*?<td[^>]*>0<\/td>/);
    expect(rows[1]).toMatch(/弱点登録数[\s\S]*?<td[^>]*>17<\/td>[\s\S]*?オカズ登録数[\s\S]*?<td[^>]*>12<\/td>/);
    expect(rows[2]).toMatch(/調教最長[\s\S]*?01:01:01[\s\S]*?お仕置き総計[\s\S]*?27:46:40/);
    expect(rows[3]).toMatch(/あなたLv\(館の外\)[\s\S]*?<td[^>]*>150<\/td>[\s\S]*?サキュバスLv\(館の外\)[\s\S]*?<td[^>]*>220<\/td>/);
    expect(rows[4]).toMatch(/累計獲得Pt[\s\S]*?12,000 Pt[\s\S]*?所持Pt[\s\S]*?450 Pt/);
  });
});

describe("shared image certificate content", () => {
  it("gives native and browser renderers the same localized values, with plain proper names", () => {
    const content = createActivityCertificatePresentation({ ...data, name: "A & B",
      topFavorites: [favorites[0], favorites[0], ...favorites.slice(1)],
    }, "en");
    expect(content.name).toBe("A & B");
    expect(content.title).toBe("Activity Record Certificate");
    expect(content.favorites.map(({ name }) => name)).toEqual(["Alex", "Sam", "Robin"]);
    expect(content.weaknesses).toEqual(["Early mornings", "Cold weather"]);
    expect(content.metrics.map(({ value }) => value)).toEqual(["12.50", "0", "17", "12", "01:01:01", "27:46:40", "150", "220", "12,000 Pt", "450 Pt"]);
    expect(content.metricRows).toEqual([content.metrics.slice(0, 2), content.metrics.slice(2, 4), content.metrics.slice(4, 6), content.metrics.slice(6, 8), content.metrics.slice(8, 10)]);
    expect(content.photoDataUrl).toBe(png);
  });

  it("normalizes up to five ordered weaknesses while displaying the recorded registration count", () => {
    const topWeaknesses = ["  First ", "", "   ", "Second", "First", "Third", "Fourth", "Fifth", "Sixth"];
    const content = createActivityCertificatePresentation({ ...data, topWeaknesses });
    expect(content.weaknesses).toEqual(["First", "Second", "Third", "Fourth", "Fifth"]);
    expect(content.weaknessesLabel).toBe("弱点上位5");
    expect(content.metrics).toEqual([
      { label: "長さ（cm）", value: "12.50" }, { label: "頻度（回/1週間）", value: "0" },
      { label: "弱点登録数", value: "17" }, { label: "オカズ登録数", value: "12" },
      { label: "調教最長", value: "01:01:01" }, { label: "お仕置き総計", value: "27:46:40" },
      { label: "あなたLv(館の外)", value: "150" }, { label: "サキュバスLv(館の外)", value: "220" },
      { label: "累計獲得Pt", value: "12,000 Pt" }, { label: "所持Pt", value: "450 Pt" },
    ]);
    expect(topWeaknesses).toEqual(["  First ", "", "   ", "Second", "First", "Third", "Fourth", "Fifth", "Sixth"]);
    expect(createActivityCertificatePresentation({ ...data, topWeaknesses: [] }).weaknesses).toEqual([]);
  });

  it.each([
    { length: " 12.50 ", frequency: " 0 ", expected: ["12.50", "0"] },
    { length: " approx. 12 ", frequency: " 3–4 ", expected: ["approx. 12", "3–4"] },
    { length: " \t ", frequency: " \n ", expected: ["未設定", "未設定"] },
  ])("preserves recorded strings $length / $frequency, trimming only surrounding whitespace", ({ length, frequency, expected }) => {
    const content = createActivityCertificatePresentation({ ...data, erectionLengthCm: length, masturbationPerWeek: frequency });
    expect(content.metrics.slice(0, 2).map(({ value }) => value)).toEqual(expected);
  });

  it.each([
    { state: "omitted", values: {} },
    { state: "undefined", values: { erectionLengthCm: undefined, masturbationPerWeek: undefined } },
    { state: "null", values: { erectionLengthCm: null, masturbationPerWeek: null } },
    { state: "empty", values: { erectionLengthCm: "", masturbationPerWeek: "" } },
  ])("renders $state optional records as unset in presentation and HTML", ({ values }) => {
    const input = { ...data };
    delete input.erectionLengthCm;
    delete input.masturbationPerWeek;
    Object.assign(input, values);
    const content = createActivityCertificatePresentation(input, "en");
    expect(content.metrics.slice(0, 2).map(({ value }) => value)).toEqual(["Not set", "Not set"]);
    expect(content.metricRows).toHaveLength(5);
    const html = createActivityCertificateHtml(input, "en");
    const firstRow = html.match(/<tr>[\s\S]*?<\/tr>/)?.[0];
    expect(firstRow?.match(/<td>Not set<\/td>/g)).toHaveLength(2);
  });
});

describe("embedded certificate photo", () => {
  it("accepts the same four raster image signatures as photo storage", () => {
    for (const value of [png, "data:image/jpeg;base64,/9j/AA==", "data:image/gif;base64,R0lGODlh", "data:image/webp;base64,UklGRgAAAABXRUJQ"]) {
      expect(validateCertificatePhotoDataUrl(value)).toBe(value);
    }
  });

  it.each([
    "https://example.test/photo.png", "file:///private/photo.jpg", "blob:private-photo", "data:image/svg+xml;base64,PHN2Zz4=",
    'data:image/png;base64,iVBORw0KGgo=" onerror="bad', "data:image/png;base64,R0lGODlh",
    "data:image/png;base64,iVBORw0KGgo==", "data:image/jpeg;base64,AAAA", "data:text/html;base64,PHNjcmlwdD4=",
  ])("rejects untrusted or mismatched photo %s", (value) => {
    expect(() => validateCertificatePhotoDataUrl(value)).toThrow();
    expect(() => createActivityCertificateHtml({ ...data, photoDataUrl: value })).toThrow();
  });
});
