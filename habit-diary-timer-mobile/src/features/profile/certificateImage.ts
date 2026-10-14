import type { CertificatePng } from "./certificateImage.types";

export type { CertificatePng } from "./certificateImage.types";

export async function renderCertificatePng(_html: string): Promise<CertificatePng> {
  throw new Error("WEB画像出力を利用できません。");
}

export async function downloadCertificatePng(_image: CertificatePng, _fileName: string): Promise<void> {
  throw new Error("WEB画像出力を利用できません。");
}
