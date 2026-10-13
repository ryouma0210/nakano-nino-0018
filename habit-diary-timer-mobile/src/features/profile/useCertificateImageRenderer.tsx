import type { NativeCertificateImageRenderer } from "./certificateExport";

// Web exports the existing HTML design through its dedicated canvas renderer.
// Match the .native.tsx extension: Metro would resolve a generic .ts first,
// skipping the native renderer even when building Android or iOS.
export function useCertificateImageRenderer() {
  const renderImage: NativeCertificateImageRenderer = async () => {
    throw new Error("証明書の画像作成を開始できませんでした。");
  };
  return { renderImage, renderHost: null };
}
