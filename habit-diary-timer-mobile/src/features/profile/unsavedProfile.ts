import type { ProfileSettings } from "@/services/profileService";

/** Match the name-save normalization; a blank name keeps the current saved name. */
export function hasUnsavedProfileChanges(draft: ProfileSettings, saved: ProfileSettings, draftName: string, savedName: string): boolean {
  if ((draftName.trim() || savedName) !== savedName) return true;
  return (Object.keys(draft) as (keyof ProfileSettings)[]).some((key) => JSON.stringify(draft[key]) !== JSON.stringify(saved[key]));
}
