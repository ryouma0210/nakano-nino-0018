import html2pdf from "html2pdf.js";

export async function downloadHtmlAsPdf(html: string, fileName: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("WEB PDF出力を利用できません。");
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const sourcePage = parsed.querySelector<HTMLElement>(".page");
  if (!sourcePage) throw new Error("契約書のPDFレイアウトを読み込めませんでした。");

  const renderHost = document.createElement("div");
  renderHost.setAttribute("aria-hidden", "true");
  renderHost.style.position = "fixed";
  renderHost.style.left = "-100000px";
  renderHost.style.top = "0";
  renderHost.style.width = "210mm";
  renderHost.style.background = "#ffffff";
  renderHost.style.pointerEvents = "none";

  parsed.querySelectorAll("style").forEach((style) => {
    renderHost.appendChild(style.cloneNode(true));
  });
  const renderPage = sourcePage.cloneNode(true) as HTMLElement;
  renderHost.appendChild(renderPage);
  document.body.appendChild(renderHost);

  try {
    await document.fonts?.ready;
    await html2pdf()
      .set({
        margin: 0,
        filename: fileName,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: 794,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(renderPage)
      .save(fileName);
  } finally {
    renderHost.remove();
  }
}
