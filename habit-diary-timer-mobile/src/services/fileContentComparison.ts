import * as FileSystem from "expo-file-system/legacy";

// Keep memory bounded when checking large videos and recordings. Compare every
// byte, including the final chunk: equal names/sizes alone are not duplicates.
export const CONTENT_COMPARE_CHUNK_SIZE = 256 * 1024;
const comparisonError = "ファイルの内容を比較できませんでした。もう一度お試しください。";

export async function sameBlobContent(left: Blob, right: Blob): Promise<boolean> {
  if (left.size !== right.size) return false;
  for (let position = 0; position < left.size; position += CONTENT_COMPARE_CHUNK_SIZE) {
    const end = Math.min(left.size, position + CONTENT_COMPARE_CHUNK_SIZE);
    const [a, b] = await Promise.all([
      left.slice(position, end).arrayBuffer(), right.slice(position, end).arrayBuffer(),
    ]);
    if (a.byteLength !== end - position || b.byteLength !== end - position) throw new Error(comparisonError);
    const leftBytes = new Uint8Array(a);
    const rightBytes = new Uint8Array(b);
    for (let index = 0; index < leftBytes.length; index++) {
      if (leftBytes[index] !== rightBytes[index]) return false;
    }
  }
  return true;
}

async function nativeSize(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || !Number.isSafeInteger(info.size) || info.size < 0) {
    throw new Error(comparisonError);
  }
  return info.size;
}

function validBase64Chunk(value: string, length: number) {
  return typeof value === "string" && value.length === Math.ceil(length / 3) * 4
    && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
    && (value.match(/=*$/)?.[0].length ?? 0) === (3 - length % 3) % 3;
}

export async function sameNativeFileContent(leftUri: string, rightUri: string): Promise<boolean> {
  const [leftSize, rightSize] = await Promise.all([nativeSize(leftUri), nativeSize(rightUri)]);
  if (leftSize !== rightSize) return false;
  for (let position = 0; position < leftSize; position += CONTENT_COMPARE_CHUNK_SIZE) {
    const length = Math.min(CONTENT_COMPARE_CHUNK_SIZE, leftSize - position);
    const options = { encoding: FileSystem.EncodingType.Base64, position, length };
    const chunks = await Promise.all([
      FileSystem.readAsStringAsync(leftUri, options), FileSystem.readAsStringAsync(rightUri, options),
    ]);
    const [left, right] = chunks.map((chunk) => typeof chunk === "string" ? chunk.replace(/[\r\n]/g, "") : chunk);
    // A missing/short read must never make two broken sources look identical.
    if (!validBase64Chunk(left, length) || !validBase64Chunk(right, length)) throw new Error(comparisonError);
    if (left !== right) return false;
  }
  const [finalLeftSize, finalRightSize] = await Promise.all([nativeSize(leftUri), nativeSize(rightUri)]);
  if (finalLeftSize !== leftSize || finalRightSize !== rightSize) throw new Error(comparisonError);
  return true;
}
