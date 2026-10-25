import { ACHIEVEMENT_KEYS, type AchievementKey } from './achievements';
import { ACHIEVEMENT_MOTION } from './achievementMotion';

// Known keys only: backend additions continue to use the registered glyph until artwork is supplied.
const keys = new Set<string>(ACHIEVEMENT_KEYS);
export function achievementArtwork(key: string, large = false): string | undefined {
  if (!keys.has(key)) return undefined;
  return `/achievements/enamel/${ACHIEVEMENT_MOTION[key] ? 'motion/' : ''}${key as AchievementKey}${large ? '' : '-small'}.webp`;
}
