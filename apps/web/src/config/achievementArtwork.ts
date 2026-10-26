import { ACHIEVEMENT_KEYS, type AchievementKey } from './achievements';
import { ACHIEVEMENT_MOTION } from './achievementMotion';

// Known keys only: backend additions continue to use the registered glyph until artwork is supplied.
// Public contribution uses the registered glyph family, with no missing bitmap request.
const keys = new Set<string>(ACHIEVEMENT_KEYS.filter((key) => !key.startsWith('public_resource_')));
export function achievementArtwork(key: string, large = false): string | undefined {
  if (!keys.has(key)) return undefined;
  return `/achievements/enamel/${ACHIEVEMENT_MOTION[key] ? 'motion/' : ''}${key as AchievementKey}${large ? '' : '-small'}.webp`;
}
