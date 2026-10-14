// 稳定装扮 ID；目录回退不撤销已兑换的永久背景。
export const PROFILE_BACKGROUND_IDS = Object.freeze([
  "background_mountains",
  "background_sky",
  "background_coast",
  "background_stars",
]);

export function isProfileBackgroundId(value) {
  return typeof value === "string" && PROFILE_BACKGROUND_IDS.includes(value);
}
