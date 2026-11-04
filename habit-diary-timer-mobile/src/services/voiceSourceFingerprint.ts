import * as FileSystem from "expo-file-system/legacy";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { VoiceSourceFingerprint } from "../features/voices/library";

const chunkSize = 256 * 1024;
const failure = "ファイルの内容を比較できませんでした。もう一度お試しください。";

// Retain the identity of the picked file when the app's copy is normalized.
// Only normalized files need this hash; ordinary imports keep their byte comparison.
export async function fingerprintVoiceBlob(blob: Blob): Promise<VoiceSourceFingerprint> {
  const hash = sha256.create();
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    hash.update(new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer()));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return { sha256: bytesToHex(hash.digest()), size: blob.size };
}

function decodeBase64(value: string, size: number): Uint8Array {
  const text = value.replace(/[\r\n]/g, "");
  if (text.length !== Math.ceil(size / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error(failure);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new Uint8Array(size);
  let bits = 0; let buffer = 0; let index = 0;
  for (const char of text) {
    if (char === "=") break;
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes[index++] = (buffer >> bits) & 255; }
  }
  if (index !== size) throw new Error(failure);
  return bytes;
}

export async function fingerprintVoiceFile(uri: string): Promise<VoiceSourceFingerprint> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || !Number.isSafeInteger(info.size) || info.size <= 0) throw new Error(failure);
  const hash = sha256.create();
  for (let position = 0; position < info.size; position += chunkSize) {
    const length = Math.min(chunkSize, info.size - position);
    const value = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position, length });
    hash.update(decodeBase64(value, length));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const after = await FileSystem.getInfoAsync(uri);
  if (!after.exists || after.isDirectory || after.size !== info.size) throw new Error(failure);
  return { sha256: bytesToHex(hash.digest()), size: info.size };
}
