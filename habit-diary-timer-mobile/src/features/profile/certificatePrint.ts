// Expo Print's web implementation prints the app page and ignores its HTML option.
// Isolate certificate markup in a same-origin iframe so only the intended document is printed.
export async function printCertificateHtml(html: string): Promise<void> {
  if (typeof document === "undefined") throw new Error("印刷画面を開けませんでした。");
  const frame = document.createElement("iframe");
  frame.title = "Activity certificate";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-100000px;top:0;width:210mm;height:297mm;border:0;";
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
    frame.remove();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const loadTimeout = setTimeout(() => reject(new Error("印刷画面を開けませんでした。")), 30_000);
      let loading = false;
      frame.onload = () => {
        if (loading || removed) return;
        loading = true;
        void (async () => {
          const printWindow = frame.contentWindow;
          const printDocument = frame.contentDocument;
          if (!printWindow || !printDocument) throw new Error("印刷画面を開けませんでした。");
          await printDocument.fonts?.ready;
          await Promise.all([...printDocument.images].map((img) => img.decode()));
          if (removed) return;
          clearTimeout(loadTimeout);
          printWindow.addEventListener("afterprint", remove, { once: true });
          // Some browsers do not dispatch afterprint. Retain the document long enough for their print UI.
          cleanupTimer = setTimeout(remove, 180_000);
          printWindow.focus();
          printWindow.print();
          resolve();
        })().catch((error) => { clearTimeout(loadTimeout); reject(error); });
      };
      frame.onerror = () => { clearTimeout(loadTimeout); reject(new Error("印刷画面を開けませんでした。")); };
      frame.srcdoc = html;
      document.body.appendChild(frame);
    });
  } catch (error) {
    remove();
    throw error;
  }
}
