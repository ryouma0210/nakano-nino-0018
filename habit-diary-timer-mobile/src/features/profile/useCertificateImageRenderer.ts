import type { NativeCertificateImageRenderer } from "./certificateExport";

// Web exports the existing HTML design through its dedicated canvas renderer.
export function useCertificateImageRenderer() {
  const renderImage: NativeCertificateImageRenderer = async () => {
    throw new Error("証明書の画像作成を開始できませんでした。");
  };
  return { renderImage, renderHost: null };
}
