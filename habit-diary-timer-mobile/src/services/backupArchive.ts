/**
 * A deliberately small ZIP32/STORED profile. Media is copied in bounded chunks;
 * only the central directory is retained in memory. No native ZIP module is
 * needed, so the same format works in Expo and in the desktop/browser app.
 */
export const BACKUP_ARCHIVE_CHUNK_SIZE = 256 * 1024;
const MAX_ENTRIES = 10_000;
const MAX_DIRECTORY_SIZE = 4 * 1024 * 1024;
const MAX_ZIP32 = 0xfffffffe; // 0xffffffff is reserved for ZIP64.
const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const DESCRIPTOR = 0x08074b50;
const END_DIRECTORY = 0x06054b50;
const UTF8 = 0x0800;
const HAS_DESCRIPTOR = 0x0008;
const WRITE_FLAGS = UTF8 | HAS_DESCRIPTOR;

export type RandomAccessReader = {
  size: number;
  /** May return fewer bytes than requested, but never more. */
  read: (offset: number, length: number) => Promise<Uint8Array>;
};

export type ArchiveWriter = { write: (chunk: Uint8Array) => Promise<void> };
export type BackupArchiveSource = RandomAccessReader & { name: string };
export type BackupArchiveEntry = BackupArchiveSource & { verify: () => Promise<void> };

function invalid(reason: string): never {
  throw new Error(`Invalid backup archive: ${reason}`);
}

function validInteger(value: number, maximum = MAX_ZIP32): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function checkRange(size: number, offset: number, length: number): void {
  if (!validInteger(offset) || !validInteger(length) || offset + length > size) {
    invalid("file range is outside the archive");
  }
}

/** All calls into a filesystem adapter stay small, including short-read retries. */
async function readExact(reader: RandomAccessReader, offset: number, length: number): Promise<Uint8Array> {
  checkRange(reader.size, offset, length);
  if (length === 0) return new Uint8Array(0);
  let result: Uint8Array | undefined;
  let received = 0;
  while (received < length) {
    const requested = Math.min(BACKUP_ARCHIVE_CHUNK_SIZE, length - received);
    const chunk = await reader.read(offset + received, requested);
    if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0 || chunk.byteLength > requested) {
      invalid("file was truncated or returned an invalid chunk");
    }
    if (received === 0 && chunk.byteLength === length) return chunk;
    result ??= new Uint8Array(length);
    result.set(chunk, received);
    received += chunk.byteLength;
  }
  return result!;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

// These small UTF-8 helpers avoid depending on a TextDecoder polyfill on native.
function encodeName(name: string): Uint8Array {
  if (name.length > 0xffff) invalid("file name is too long");
  const result: number[] = [];
  for (const character of name) {
    const code = character.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) invalid("file name is not valid Unicode");
    if (code < 0x80) result.push(code);
    else if (code < 0x800) result.push(0xc0 | (code >>> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) result.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
    else result.push(0xf0 | (code >>> 18), 0x80 | ((code >>> 12) & 0x3f), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
    if (result.length > 0xffff) invalid("file name is too long");
  }
  return new Uint8Array(result);
}

function decodeName(bytes: Uint8Array, utf8: boolean): string {
  const result: string[] = [];
  for (let offset = 0; offset < bytes.length;) {
    const first = bytes[offset++];
    if (first < 0x80) {
      result.push(String.fromCharCode(first));
      continue;
    }
    if (!utf8) invalid("non-ASCII file name is missing the UTF-8 flag");
    const following = first >= 0xc2 && first <= 0xdf ? 1 : first >= 0xe0 && first <= 0xef ? 2 : first >= 0xf0 && first <= 0xf4 ? 3 : 0;
    if (following === 0 || offset + following > bytes.length) invalid("file name is not valid UTF-8");
    let code = first & (0x7f >>> following);
    for (let index = 0; index < following; index++) {
      const next = bytes[offset++];
      if ((next & 0xc0) !== 0x80) invalid("file name is not valid UTF-8");
      code = (code << 6) | (next & 0x3f);
    }
    const minimum = following === 1 ? 0x80 : following === 2 ? 0x800 : 0x10000;
    if (code < minimum || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) invalid("file name is not valid UTF-8");
    result.push(String.fromCodePoint(code));
  }
  return result.join("");
}

function safeName(name: string): string {
  if (!name || name.includes("\\") || name.includes(":") || [...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    invalid("unsafe file name");
  }
  for (const segment of name.split("/")) {
    if (!segment || segment === "." || segment === ".." || /[. ]$/.test(segment) || /[<>"|?*]/.test(segment) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)) {
      invalid("unsafe file name");
    }
  }
  // Also reject aliases which would collide after extraction on Windows/macOS.
  return name.normalize("NFC").toLowerCase();
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

function updateCrc(crc: number, bytes: Uint8Array): number {
  for (let index = 0; index < bytes.length; index++) crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return crc;
}

/** Writes ordinary, uncompressed ZIP entries without buffering their contents. */
export async function writeBackupArchive(entries: BackupArchiveSource[], output: ArchiveWriter): Promise<void> {
  if (entries.length > MAX_ENTRIES) invalid("too many files");
  const seen = new Set<string>();
  let directorySize = 0;
  let bodySize = 0;
  // Preflight all sizes/names before writing anything to the destination.
  const prepared = entries.map((entry) => {
    const key = safeName(entry.name);
    if (seen.has(key)) invalid("duplicate file name");
    seen.add(key);
    if (!validInteger(entry.size)) invalid("file is too large for ZIP32");
    const nameBytes = encodeName(entry.name);
    const offset = bodySize;
    bodySize += 30 + nameBytes.length + entry.size + 16;
    directorySize += 46 + nameBytes.length;
    if (directorySize > MAX_DIRECTORY_SIZE || bodySize + directorySize + 22 > MAX_ZIP32) invalid("archive is too large for ZIP32");
    return { entry, nameBytes, offset, crc: 0 };
  });

  for (const item of prepared) {
    const header = new Uint8Array(30 + item.nameBytes.length);
    const fields = view(header);
    fields.setUint32(0, LOCAL_HEADER, true);
    fields.setUint16(4, 20, true);
    fields.setUint16(6, WRITE_FLAGS, true);
    fields.setUint16(12, 0x21, true); // A valid DOS date: 1980-01-01.
    fields.setUint16(26, item.nameBytes.length, true);
    header.set(item.nameBytes, 30);
    await output.write(header);

    let crc = 0xffffffff;
    for (let offset = 0; offset < item.entry.size;) {
      const chunk = await readExact(item.entry, offset, Math.min(BACKUP_ARCHIVE_CHUNK_SIZE, item.entry.size - offset));
      crc = updateCrc(crc, chunk);
      await output.write(chunk);
      offset += chunk.length;
    }
    item.crc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = new Uint8Array(16);
    const descriptorFields = view(descriptor);
    descriptorFields.setUint32(0, DESCRIPTOR, true);
    descriptorFields.setUint32(4, item.crc, true);
    descriptorFields.setUint32(8, item.entry.size, true);
    descriptorFields.setUint32(12, item.entry.size, true);
    await output.write(descriptor);
  }

  for (const item of prepared) {
    const header = new Uint8Array(46 + item.nameBytes.length);
    const fields = view(header);
    fields.setUint32(0, CENTRAL_HEADER, true);
    fields.setUint16(4, 20, true);
    fields.setUint16(6, 20, true);
    fields.setUint16(8, WRITE_FLAGS, true);
    fields.setUint16(14, 0x21, true);
    fields.setUint32(16, item.crc, true);
    fields.setUint32(20, item.entry.size, true);
    fields.setUint32(24, item.entry.size, true);
    fields.setUint16(28, item.nameBytes.length, true);
    fields.setUint32(42, item.offset, true);
    header.set(item.nameBytes, 46);
    await output.write(header);
  }

  const end = new Uint8Array(22);
  const fields = view(end);
  fields.setUint32(0, END_DIRECTORY, true);
  fields.setUint16(8, entries.length, true);
  fields.setUint16(10, entries.length, true);
  fields.setUint32(12, directorySize, true);
  fields.setUint32(16, bodySize, true);
  await output.write(end);
}

function checkExtra(bytes: Uint8Array): void {
  const fields = view(bytes);
  for (let offset = 0; offset < bytes.length;) {
    if (offset + 4 > bytes.length) invalid("truncated extra field");
    const id = fields.getUint16(offset, true);
    const size = fields.getUint16(offset + 2, true);
    if (id === 1) invalid("ZIP64 is not supported");
    offset += 4 + size;
    if (offset > bytes.length) invalid("truncated extra field");
  }
}

type DirectoryEntry = {
  name: string; nameBytes: Uint8Array; size: number; crc: number; flags: number;
  version: number; time: number; date: number; offset: number; dataOffset: number;
};

/**
 * Validates all directory and local-header structure before returning entries.
 * Call every entry's verify() before modifying live data. Entry reads are capped
 * at BACKUP_ARCHIVE_CHUNK_SIZE; the caller must stream large attachments.
 */
export async function readBackupArchive(reader: RandomAccessReader): Promise<BackupArchiveEntry[]> {
  if (!validInteger(reader.size) || reader.size < 22) invalid("invalid archive size");
  const tail = await readExact(reader, Math.max(0, reader.size - 22 - 0xffff), Math.min(reader.size, 22 + 0xffff));
  const tailFields = view(tail);
  let endIndex = -1;
  for (let index = tail.length - 22; index >= 0; index--) {
    if (tailFields.getUint32(index, true) === END_DIRECTORY && index + 22 + tailFields.getUint16(index + 20, true) === tail.length) {
      endIndex = index;
      break;
    }
  }
  if (endIndex < 0) invalid("end of directory is missing");
  const end = view(tail.subarray(endIndex));
  const endOffset = reader.size - tail.length + endIndex;
  const count = end.getUint16(10, true);
  const directorySize = end.getUint32(12, true);
  const directoryOffset = end.getUint32(16, true);
  if (end.getUint16(4, true) !== 0 || end.getUint16(6, true) !== 0 || end.getUint16(8, true) !== count) invalid("split ZIP archives are not supported");
  if (count > MAX_ENTRIES || directorySize > MAX_DIRECTORY_SIZE) invalid("directory exceeds the supported limits");
  if (directoryOffset + directorySize !== endOffset || count * 46 > directorySize) invalid("invalid central directory range");
  const directory = await readExact(reader, directoryOffset, directorySize);
  const fields = view(directory);
  const seen = new Set<string>();
  const parsed: DirectoryEntry[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > directory.length || fields.getUint32(cursor, true) !== CENTRAL_HEADER) invalid("invalid directory entry");
    const version = fields.getUint16(cursor + 6, true);
    const flags = fields.getUint16(cursor + 8, true);
    if (version < 10 || version > 20 || (flags & ~WRITE_FLAGS) !== 0 || fields.getUint16(cursor + 10, true) !== 0) invalid("unsupported ZIP encoding or compression");
    const size = fields.getUint32(cursor + 24, true);
    if (!validInteger(size) || fields.getUint32(cursor + 20, true) !== size) invalid("invalid stored file size");
    if (fields.getUint16(cursor + 34, true) !== 0) invalid("split ZIP archives are not supported");
    const attributes = fields.getUint32(cursor + 38, true);
    const unixType = (attributes >>> 16) & 0xf000;
    if ((attributes & 0x10) !== 0 || (unixType !== 0 && unixType !== 0x8000)) invalid("only regular files are supported");
    const nameLength = fields.getUint16(cursor + 28, true);
    const extraLength = fields.getUint16(cursor + 30, true);
    const commentLength = fields.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > directory.length) invalid("truncated directory entry");
    const nameBytes = directory.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decodeName(nameBytes, Boolean(flags & UTF8));
    const key = safeName(name);
    if (seen.has(key)) invalid("duplicate file name");
    seen.add(key);
    checkExtra(directory.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength));
    parsed.push({ name, nameBytes, size, crc: fields.getUint32(cursor + 16, true), flags, version,
      time: fields.getUint16(cursor + 12, true), date: fields.getUint16(cursor + 14, true),
      offset: fields.getUint32(cursor + 42, true), dataOffset: 0 });
    cursor = next;
  }
  if (cursor !== directory.length) invalid("unexpected central directory data");
  const ordered = [...parsed].sort((a, b) => a.offset - b.offset);
  if ((ordered[0]?.offset ?? directoryOffset) !== 0) invalid("unexpected data before the first file");

  for (let index = 0; index < ordered.length; index++) {
    const entry = ordered[index];
    const boundary = ordered[index + 1]?.offset ?? directoryOffset;
    if (entry.offset + 30 > boundary) invalid("overlapping local file headers");
    const header = await readExact(reader, entry.offset, 30);
    const local = view(header);
    if (local.getUint32(0, true) !== LOCAL_HEADER || local.getUint16(4, true) !== entry.version || local.getUint16(6, true) !== entry.flags || local.getUint16(8, true) !== 0 || local.getUint16(10, true) !== entry.time || local.getUint16(12, true) !== entry.date) invalid("local header does not match the directory");
    const hasDescriptor = Boolean(entry.flags & HAS_DESCRIPTOR);
    const expected = [entry.crc, entry.size, entry.size];
    for (let field = 0; field < expected.length; field++) {
      const actual = local.getUint32(14 + field * 4, true);
      if (actual !== expected[field] && !(hasDescriptor && actual === 0)) invalid("local file metadata does not match the directory");
    }
    const nameLength = local.getUint16(26, true);
    const extraLength = local.getUint16(28, true);
    entry.dataOffset = entry.offset + 30 + nameLength + extraLength;
    const dataEnd = entry.dataOffset + entry.size;
    if (nameLength !== entry.nameBytes.length || dataEnd > boundary) invalid("file data extends past its boundary");
    const localNameAndExtra = await readExact(reader, entry.offset + 30, nameLength + extraLength);
    if (!equalBytes(entry.nameBytes, localNameAndExtra.subarray(0, nameLength))) invalid("local file name does not match the directory");
    checkExtra(localNameAndExtra.subarray(nameLength));
    const descriptorLength = boundary - dataEnd;
    if (hasDescriptor) {
      if (descriptorLength !== 12 && descriptorLength !== 16) invalid("invalid file descriptor size");
      const descriptor = view(await readExact(reader, dataEnd, descriptorLength));
      const firstField = descriptorLength === 16 ? 4 : 0;
      if (firstField && descriptor.getUint32(0, true) !== DESCRIPTOR) invalid("invalid file descriptor signature");
      if (descriptor.getUint32(firstField, true) !== entry.crc || descriptor.getUint32(firstField + 4, true) !== entry.size || descriptor.getUint32(firstField + 8, true) !== entry.size) invalid("file descriptor does not match the directory");
    } else if (descriptorLength !== 0) invalid("unexpected data after the file");
  }

  return parsed.map((entry) => ({
    name: entry.name,
    size: entry.size,
    read: async (offset: number, length: number) => {
      checkRange(entry.size, offset, length);
      if (length > BACKUP_ARCHIVE_CHUNK_SIZE) invalid("entry reads must use bounded chunks");
      return readExact(reader, entry.dataOffset + offset, length);
    },
    verify: async () => {
      let crc = 0xffffffff;
      for (let offset = 0; offset < entry.size;) {
        const chunk = await readExact(reader, entry.dataOffset + offset, Math.min(BACKUP_ARCHIVE_CHUNK_SIZE, entry.size - offset));
        crc = updateCrc(crc, chunk);
        offset += chunk.length;
      }
      if (((crc ^ 0xffffffff) >>> 0) !== entry.crc) invalid("file checksum does not match");
    },
  }));
}
