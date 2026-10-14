import html2pdf from "html2pdf.js";
import type { CertificatePng } from "./certificateImage.types";

export type { CertificatePng } from "./certificateImage.types";

const invalidImageMessage = "証明書の画像を生成できませんでした。";

function assertBrowser() {
  if (typeof window === "undefined" || typeof document === "undefined") throw new Error("WEB画像出力を利用できません。");
}

export async function renderCertificatePng(html: string): Promise<CertificatePng> {
  assertBrowser();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const sourcePage = parsed.querySelector<HTMLElement>(".page.activity-certificate");
  if (!sourcePage) throw new Error(invalidImageMessage);

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:210mm;background:#fff;pointer-events:none;";
  parsed.querySelectorAll("style").forEach((style) => host.appendChild(style.cloneNode(true)));
  const page = sourcePage.cloneNode(true) as HTMLElement;
  host.appendChild(page);
  let overlay: HTMLElement | undefined;
  try {
    document.body.appendChild(host);
    await document.fonts?.ready;
    await Promise.all([...page.querySelectorAll("img")].map((image) => image.decode()));
    const width = Math.ceil(page.getBoundingClientRect().width);
    if (!Number.isFinite(width) || width <= 0) throw new Error(invalidImageMessage);
    const worker = html2pdf()
      .set({
        margin: 0,
        image: { type: "png" },
        html2canvas: {
          // Fix the export resolution, independent of the device's pixel density.
          scale: 2, width, windowWidth: width, backgroundColor: "#ffffff", useCORS: true,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(page);
    // Track this worker's overlay so a failed canvas render cannot leave an invisible input blocker.
    overlay = await worker.toContainer().get("overlay") as HTMLElement;
    const canvas = await worker.toCanvas().get("canvas") as HTMLCanvasElement;
    const dataUrl = canvas.toDataURL("image/png");
    if (!dataUrl.startsWith("data:image/png;base64,") || canvas.width <= 0 || canvas.height <= 0) {
      throw new Error(invalidImageMessage);
    }
    return { dataUrl, width: canvas.width, height: canvas.height };
  } finally {
    overlay?.remove();
    host.remove();
  }
}

export async function downloadCertificatePng(image: CertificatePng, fileName: string): Promise<void> {
  assertBrowser();
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl)) throw new Error(invalidImageMessage);
  // A blob URL also supports downloads larger than browser data-URL navigation limits.
  const blob = await (await fetch(image.dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Windows/WebView download handlers can read the URL after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
