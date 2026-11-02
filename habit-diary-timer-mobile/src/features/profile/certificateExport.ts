import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Image, Platform } from "react-native";
import { translateText, type AppLanguage } from "../../i18n";
import { fileStorageService, mimeTypeForName, type StoredFile } from "../../services/fileStorageService";
import { invalidProfilePhotoMessage, isProfilePhotoMetadata } from "../files/profilePhoto";
import { activityCertificateFileName, createActivityCertificateHtml, validateCertificatePhotoDataUrl, type ActivityCertificateData } from "./certificate";
import { printCertificateHtml } from "./certificatePrint";
import { downloadCertificatePng, renderCertificatePng, type CertificatePng } from "./certificateImage";

export type NativeCertificateImageRenderer = (data: ActivityCertificateData, language: AppLanguage) => Promise<string>;

export type ActivityCertificateExportResult = {
  status: "saved" | "shared" | "printed" | "cancelled";
  fileName: string;
  uri?: string;
};

type CertificatePreviewImage = {
  uri: string;
  width: number;
  height: number;
  png?: CertificatePng;
};

export type ActivityCertificatePreview = {
  data: ActivityCertificateData;
  language: AppLanguage;
  image: CertificatePreviewImage;
  dispose: () => Promise<void>;
};

// Prepare the actual output, without requesting permissions, downloading,
// printing, sharing, or writing an issued certificate to permanent storage.
export async function prepareActivityCertificatePreview(
  data: ActivityCertificateData,
  language: AppLanguage,
  renderNativeImage?: NativeCertificateImageRenderer,
): Promise<ActivityCertificatePreview> {
  const snapshot: ActivityCertificateData = {
    ...data,
    issuedAt: new Date(data.issuedAt),
    topWeaknesses: [...data.topWeaknesses],
    topFavorites: data.topFavorites.map((favorite) => ({ ...favorite })),
  };
  const html = createActivityCertificateHtml(snapshot, language);
  if (Platform.OS === "web") {
    const png = await renderCertificatePng(html);
    return { data: snapshot, language, image: { uri: png.dataUrl, width: png.width, height: png.height, png }, dispose: async () => undefined };
  }
  if (!renderNativeImage) throw new Error("証明書の画像作成を開始できませんでした。");
  const uri = await renderNativeImage(snapshot, language);
  try {
    const { width, height } = await Image.getSize(uri);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("証明書の画像を生成できませんでした。");
    }
    let disposed = false;
    return {
      data: snapshot, language, image: { uri, width, height },
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        await removeTemporaryFile(uri);
      },
    };
  } catch (error) {
    await removeTemporaryFile(uri);
    throw error;
  }
}

// Reuse the preview's pixels and snapshot, including its name and timestamp.
// The caller retains ownership until the preview is closed or issuance ends.
export function exportPreparedActivityCertificate(
  preview: ActivityCertificatePreview,
  action: "save" | "share" | "print" = "save",
): Promise<ActivityCertificateExportResult> {
  return exportActivityCertificate(preview.data, preview.language, action, undefined, preview.image);
}

export async function activityCertificatePhotoDataUrl(photo: StoredFile | null): Promise<string | null> {
  if (!photo) return null;
  const mimeType = mimeTypeForName(photo.name);
  if (!isProfilePhotoMetadata(photo.name, mimeType)) throw new Error(invalidProfilePhotoMessage);
  if (Platform.OS === "web") {
    // Read the persisted blob, not a transient object URL or an arbitrary network resource.
    const blob = await fileStorageService.getBlob(photo);
    if (!blob) throw new Error("画像を読み込めませんでした。");
    if (blob.type && blob.type !== mimeType) throw new Error(invalidProfilePhotoMessage);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      reader.onabort = () => reject(new Error("画像を読み込めませんでした。"));
      reader.onload = () => typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("画像を読み込めませんでした。"));
      reader.readAsDataURL(blob.type ? blob : blob.slice(0, blob.size, mimeType));
    });
    return validateCertificatePhotoDataUrl(dataUrl);
  }
  if (!photo.uri.startsWith("file://")) throw new Error("画像を読み込めませんでした。");
  const base64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 });
  return validateCertificatePhotoDataUrl(`data:${mimeType};base64,${base64}`);
}

async function removeTemporaryFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    console.warn("Could not remove a temporary activity certificate", error);
  }
}

async function unusedImageTarget(directory: string, requestedName: string): Promise<{ fileName: string; uri: string }> {
  // Repeated exports on the same day must preserve earlier saved/shared images.
  for (let suffix = 0; ; suffix += 1) {
    const fileName = suffix === 0 ? requestedName : requestedName.replace(/\.png$/, `-${suffix}.png`);
    const uri = `${directory}${encodeURIComponent(fileName)}`;
    if (!(await FileSystem.getInfoAsync(uri)).exists) return { fileName, uri };
  }
}

export async function exportActivityCertificate(
  data: ActivityCertificateData,
  language: AppLanguage = "ja",
  action: "save" | "share" | "print" = "save",
  renderNativeImage?: NativeCertificateImageRenderer,
  preparedImage?: CertificatePreviewImage,
): Promise<ActivityCertificateExportResult> {
  const html = createActivityCertificateHtml(data, language);
  let fileName = activityCertificateFileName(data.issuedAt, data.name);
  if (Platform.OS === "web") {
    if (action === "print") {
      await printCertificateHtml(html);
      return { status: "printed", fileName };
    }
    const image = preparedImage?.png ?? await renderCertificatePng(html);
    await downloadCertificatePng(image, fileName);
    return { status: "saved", fileName };
  }
  if (action === "print") {
    await Print.printAsync({ html });
    return { status: "printed", fileName };
  }
  let directoryUri: string | undefined;
  if (!renderNativeImage && !preparedImage) throw new Error("画像を保存できませんでした。");
  if (action === "share") {
    if (!(await Sharing.isAvailableAsync())) throw new Error("共有画面を開けませんでした。");
  } else if (Platform.OS === "android") {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return { status: "cancelled", fileName };
    directoryUri = permission.directoryUri;
  }

  const temporaryUri = preparedImage?.uri ?? await renderNativeImage!(data, language);
  let targetUri: string | undefined;
  try {
    if (action === "share") {
      if (!FileSystem.cacheDirectory) throw new Error("画像を保存できませんでした。");
      const directory = `${FileSystem.cacheDirectory}activity-certificates/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const target = await unusedImageTarget(directory, fileName);
      targetUri = target.uri;
      fileName = target.fileName;
      await FileSystem.copyAsync({ from: temporaryUri, to: targetUri });
      await Sharing.shareAsync(targetUri, {
        mimeType: "image/png", UTI: "public.png", dialogTitle: translateText("活動記録証明書", language),
      });
      // Keep a successfully shared copy in OS-managed cache: receivers may read it after this promise resolves.
      return { status: "shared", fileName, uri: targetUri };
    }
    if (directoryUri) {
      targetUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, fileName, "image/png");
      const base64 = await FileSystem.readAsStringAsync(temporaryUri, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    } else {
      if (!FileSystem.documentDirectory) throw new Error("画像を保存できませんでした。");
      const target = await unusedImageTarget(FileSystem.documentDirectory, fileName);
      targetUri = target.uri;
      fileName = target.fileName;
      await FileSystem.copyAsync({ from: temporaryUri, to: targetUri });
    }
    return { status: "saved", fileName, uri: targetUri };
  } catch (error) {
    if (targetUri) await removeTemporaryFile(targetUri);
    throw error;
  } finally {
    if (!preparedImage) await removeTemporaryFile(temporaryUri);
  }
}
