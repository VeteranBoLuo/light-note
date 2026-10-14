export type ProfileBackgroundId =
  | "background_mountains"
  | "background_sky"
  | "background_coast"
  | "background_stars";
export const PROFILE_BACKGROUND_IDS: readonly ProfileBackgroundId[];
export function isProfileBackgroundId(
  value: unknown,
): value is ProfileBackgroundId;
