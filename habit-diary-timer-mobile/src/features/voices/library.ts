export type VoicePlaybackMode = "one" | "all";
// "all", "unfiled", or the ID of an existing folder; validated when persisted.
export type VoiceScope = string;
export type VoiceFolder = { id: string; name: string };

export type StoredVoice = {
  id: string;
  name: string;
  uri: string;
  size: number;
  originalName: string;
  folderIds: string[];
};

export type VoiceMetadata = Omit<StoredVoice, "uri"> & { fileName: string; mimeType: string };
export type VoiceLibrary = {
  version: 3;
  voices: VoiceMetadata[];
  mode: VoicePlaybackMode;
  folders: VoiceFolder[];
  scope: VoiceScope;
};
export const invalidVoiceLibraryMessage = "ボイスの保存データが不正です。";
export const invalidVoiceOrderMessage = "ボイスの一覧が変更されました。順序変更を開き直してください。";
export const VOICE_NAME_LIMIT = 100;
export const VOICE_FOLDER_NAME_LIMIT = 100;

const audioTypes: Readonly<Record<string, string>> = {
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg",
  aac: "audio/aac", flac: "audio/flac", opus: "audio/ogg", aif: "audio/aiff", aiff: "audio/aiff",
  amr: "audio/amr", caf: "audio/x-caf", weba: "audio/webm",
};
export const VOICE_FILE_EXTENSIONS = Object.keys(audioTypes).map((extension) => `.${extension}`);

export function audioFileType(name: string, mimeType?: string): { extension: string; mimeType: string } | null {
  const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
  const type = mimeType?.trim().toLowerCase() ?? "";
  if (/^audio\/[a-z0-9.+-]+$/.test(type)) {
    return { extension: /^[a-z0-9]{1,10}$/.test(extension) && name.includes(".") ? extension : "audio", mimeType: type };
  }
  return audioTypes[extension] ? { extension, mimeType: audioTypes[extension] } : null;
}

export function voiceDisplayName(input: string): string {
  const name = input.trim();
  if (!name) throw new Error("表示名を入力してください。");
  if (name.length > VOICE_NAME_LIMIT) throw new Error("表示名は100文字以内で入力してください。");
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error("表示名に使用できない文字が含まれています。");
  return name;
}

export function emptyVoiceLibrary(): VoiceLibrary {
  return { version: 3, voices: [], mode: "one", folders: [], scope: "all" };
}

export function voiceFolderName(input: string): string {
  const name = input.trim();
  if (!name) throw new Error("フォルダ名を入力してください。");
  if (name.length > VOICE_FOLDER_NAME_LIMIT) throw new Error("フォルダ名は100文字以内で入力してください。");
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error("フォルダ名に使用できない文字が含まれています。");
  return name;
}

export function normalizedVoiceFolderName(name: string): string {
  return name.trim().normalize("NFKC").toLowerCase();
}

export function parseVoiceLibrary(value: unknown): VoiceLibrary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(invalidVoiceLibraryMessage);
  const state = value as Record<string, unknown>;
  if ((state.version !== 1 && state.version !== 2 && state.version !== 3) || (state.mode !== "one" && state.mode !== "all") || !Array.isArray(state.voices)) {
    throw new Error(invalidVoiceLibraryMessage);
  }
  const folders: VoiceFolder[] = [];
  const folderIds = new Set<string>();
  const folderNames = new Set<string>();
  let scope: VoiceScope = "all";
  if (state.version !== 1) {
    if (!Array.isArray(state.folders)) throw new Error(invalidVoiceLibraryMessage);
    for (const entry of state.folders) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.id !== "string"
        || !/^folder-[a-zA-Z0-9_-]{1,120}$/.test(entry.id) || folderIds.has(entry.id) || typeof entry.name !== "string") {
        throw new Error(invalidVoiceLibraryMessage);
      }
      let name: string;
      try { name = voiceFolderName(entry.name); } catch { throw new Error(invalidVoiceLibraryMessage); }
      const normalized = normalizedVoiceFolderName(name);
      if (folderNames.has(normalized)) throw new Error(invalidVoiceLibraryMessage);
      folderIds.add(entry.id);
      folderNames.add(normalized);
      folders.push({ id: entry.id, name });
    }
    if (state.scope !== "all" && state.scope !== "unfiled" && (typeof state.scope !== "string" || !folderIds.has(state.scope))) {
      throw new Error(invalidVoiceLibraryMessage);
    }
    scope = state.scope as VoiceScope;
  }
  const seen = new Set<string>();
  const voices = state.voices.map((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !/^voice-[a-zA-Z0-9_-]{1,120}$/.test(entry.id)
      || seen.has(entry.id) || typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > VOICE_NAME_LIMIT
      || /[\u0000-\u001f\u007f]/.test(entry.name) || typeof entry.originalName !== "string" || !entry.originalName.trim()
      || entry.originalName.length > 1024 || /[\u0000-\u001f\u007f]/.test(entry.originalName)
      || !Number.isSafeInteger(entry.size) || entry.size <= 0 || typeof entry.fileName !== "string"
      || !entry.fileName.startsWith(`${entry.id}.`) || !/^[a-zA-Z0-9_-]+\.[a-z0-9]{1,10}$/.test(entry.fileName)
      || typeof entry.mimeType !== "string" || !/^audio\/[a-z0-9.+-]+$/.test(entry.mimeType)) {
      throw new Error(invalidVoiceLibraryMessage);
    }
    let memberships: string[] = [];
    if (state.version === 2) {
      if (entry.folderId !== null && (typeof entry.folderId !== "string" || !folderIds.has(entry.folderId))) {
        throw new Error(invalidVoiceLibraryMessage);
      }
      memberships = entry.folderId === null ? [] : [entry.folderId];
    } else if (state.version === 3) {
      if (!Array.isArray(entry.folderIds)) throw new Error(invalidVoiceLibraryMessage);
      memberships = [...entry.folderIds];
      if (memberships.some((id) => typeof id !== "string" || !folderIds.has(id))
        || new Set(memberships).size !== memberships.length) {
        throw new Error(invalidVoiceLibraryMessage);
      }
    }
    seen.add(entry.id);
    return { id: entry.id, name: entry.name, originalName: entry.originalName, size: entry.size,
      fileName: entry.fileName, mimeType: entry.mimeType, folderIds: memberships };
  });
  return { version: 3, mode: state.mode, voices, folders, scope };
}

export function voicesInScope<T extends { folderIds: readonly string[] }>(voices: readonly T[], scope: VoiceScope): T[] {
  return voices.filter((voice) => scope === "all" || (scope === "unfiled" ? voice.folderIds.length === 0 : voice.folderIds.includes(scope)));
}

export const getVoicesInScope = voicesInScope;

export function reorderVoices<T extends { id: string; folderIds: readonly string[] }>(
  voices: readonly T[], orderedIds: readonly string[], scope: VoiceScope = "all",
): T[] {
  if (!Array.isArray(orderedIds)) throw new Error(invalidVoiceOrderMessage);
  const ids = [...orderedIds];
  const scoped = voicesInScope(voices, scope);
  const byId = new Map(scoped.map((voice) => [voice.id, voice]));
  if (ids.length !== scoped.length || byId.size !== scoped.length || new Set(ids).size !== ids.length
    || ids.some((id) => typeof id !== "string" || !byId.has(id))) throw new Error(invalidVoiceOrderMessage);
  let index = 0;
  return voices.map((voice) => byId.has(voice.id) ? byId.get(ids[index++])! : voice);
}

export function moveVoice(voices: readonly VoiceMetadata[], id: string, direction: -1 | 1, scope: VoiceScope = "all"): VoiceMetadata[] {
  if (direction !== -1 && direction !== 1) throw new Error(invalidVoiceLibraryMessage);
  const scoped = voicesInScope(voices, scope);
  const index = scoped.findIndex((voice) => voice.id === id);
  if (index < 0) throw new Error("ボイスが見つかりません。");
  const target = index + direction;
  const reordered = [...voices];
  if (target >= 0 && target < scoped.length) {
    const sourceIndex = voices.indexOf(scoped[index]);
    const targetIndex = voices.indexOf(scoped[target]);
    [reordered[sourceIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[sourceIndex]];
  }
  return reordered;
}
