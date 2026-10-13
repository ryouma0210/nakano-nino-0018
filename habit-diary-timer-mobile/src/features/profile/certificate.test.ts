import { describe, expect, it } from "vitest";
import {
  activityCertificateFileName, createActivityCertificateHtml, createActivityCertificatePresentation, formatCertificateDuration,
  validateCertificatePhotoDataUrl, type ActivityCertificateData,
} from "./certificate";
import { resolveFavorites } from "./catalog";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=";
const data: ActivityCertificateData = {
  name: "Test User", photoDataUrl: png, topFavorites: resolveFavorites(["anime-002", "anime-001", "actress-001"]),
  favoriteCount: 12, activityCount: 45, longestActivitySeconds: 3661, totalTimerSeconds: 100000,
  totalEarnedPoints: 12000, currentPoints: 450, issuedAt: new Date(2026, 9, 13, 0, 3, 4),
};

describe("activity certificate HTML", () => {
  it("publishes only the selected, ordered favorites and permitted activity fields", () => {
    const html = createActivityCertificateHtml({ ...data, privateNotes: "DO_NOT_PUBLISH" } as ActivityCertificateData);
    expect(html).toContain("活動記録証明書");
    expect(html).toContain('class="page activity-certificate"');
    expect(html).toContain(`src="${png}"`);
    expect(html.indexOf("中野二乃")).toBeLessThan(html.indexOf("中野一花"));
    expect(html.indexOf("中野一花")).toBeLessThan(html.indexOf("橋本環奈"));
    expect(html).toContain("アニメ / 五等分の花嫁");
    expect(html).toContain("01:01:01");
    expect(html).toContain("27:46:40");
    expect(html).toContain("12,000 Pt");
    expect(html).not.toContain("DO_NOT_PUBLISH");
  });

  it("escapes names, work titles and translated labels without turning proper names into translations", () => {
    const html = createActivityCertificateHtml({ ...data, name: '<img src=x onerror="bad">&\'', topFavorites: [
      { id: "custom", name: "<Name & Friend>", work: '</span><script>bad()</script>', category: "anime" },
    ] }, "en");
    expect(html).toContain("&lt;img src=x onerror=&quot;bad&quot;&gt;&amp;&#39;");
    expect(html).toContain("&lt;Name &amp; Friend&gt;");
    expect(html).toContain("&lt;/span&gt;&lt;script&gt;bad()&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("limits the ranking to three unique entries and handles missing photo or activity", () => {
    const html = createActivityCertificateHtml({ ...data, photoDataUrl: null, longestActivitySeconds: null,
      topFavorites: [data.topFavorites[0], data.topFavorites[0], ...resolveFavorites(["actress-001", "performer-001", "anime-003"])],
    });
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain("三上悠亜");
    expect(html).not.toContain("中野三玖");
    expect(html).not.toContain("<img");
    expect(html).toContain("記録なし");
    expect(createActivityCertificateHtml({ ...data, topFavorites: [] })).toContain("未登録");
  });

  it("rejects invalid metrics and dates instead of inventing recorded values", () => {
    expect(() => createActivityCertificateHtml({ ...data, activityCount: Number.NaN })).toThrow();
    expect(() => createActivityCertificateHtml({ ...data, totalTimerSeconds: -1 })).toThrow();
    expect(() => createActivityCertificateHtml({ ...data, issuedAt: new Date("invalid") })).toThrow();
    expect(formatCertificateDuration(0)).toBe("00:00:00");
    expect(activityCertificateFileName(data.issuedAt, data.name)).toBe("マゾ証明書_2026-10-13_TestUser.png");
  });
});

describe("shared image certificate content", () => {
  it("gives native and browser renderers the same localized values, with plain proper names", () => {
    const content = createActivityCertificatePresentation({ ...data, name: "A & B", topFavorites: [
      data.topFavorites[0], data.topFavorites[0], ...data.topFavorites.slice(1),
    ] }, "en");
    expect(content.name).toBe("A & B");
    expect(content.title).toBe("Activity Record Certificate");
    expect(content.favorites.map(({ name }) => name)).toEqual(["中野二乃", "中野一花", "橋本環奈"]);
    expect(content.metrics.map(({ value }) => value)).toEqual(["12", "45", "01:01:01", "27:46:40", "12,000 Pt", "450 Pt"]);
    expect(content.photoDataUrl).toBe(png);
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
