import { publicArtworkUrl } from '@/utils/publicArtwork';
export interface AchievementMotionArtwork {
  key: string;
  kind: 'pages' | 'pen' | 'sun' | 'bookmark' | 'files' | 'flag' | 'drawer' | 'tree' | 'lighthouse';
  // Back-to-front order; all layers share the same 512 × 512 registration.
  layers: readonly string[];
}
export const ACHIEVEMENT_MOTION: Readonly<Record<string, AchievementMotionArtwork>> = {
  public_resource_500: { key: 'public_resource_500', kind: 'lighthouse', layers: ['base'] },
  level_15: { key: 'level_15', kind: 'pages', layers: ['base', 'left', 'right'] },
  note_500: { key: 'note_500', kind: 'pen', layers: ['base', 'pen'] },
  streak_365: { key: 'streak_365', kind: 'sun', layers: ['base', 'sun', 'pendant-left', 'pendant-right', 'front'] },
  bookmark_500: { key: 'bookmark_500', kind: 'bookmark', layers: ['base', 'bookmark'] },
  file_500: { key: 'file_500', kind: 'files', layers: ['base', 'folder', 'document'] },
  todo_1000: { key: 'todo_1000', kind: 'flag', layers: ['base', 'flag'] },
  organize_1000: { key: 'organize_1000', kind: 'drawer', layers: ['base', 'cards', 'drawer'] },
  join_365: { key: 'join_365', kind: 'tree', layers: ['base', 'left', 'right'] },
};
export function achievementMotionLayer(artwork: AchievementMotionArtwork, layer: string, large = false): string {
  return publicArtworkUrl(`/achievements/enamel/motion/${artwork.key}-${layer}${large ? '' : '-small'}.webp`);
}
