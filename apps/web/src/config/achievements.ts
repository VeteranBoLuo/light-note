/**
 * 成就展示元信息(图标 + 分组顺序)。
 * 阈值(target)与解锁判定在后端 util/growth.js 的 ACHIEVEMENTS 单一事实源,前端只负责呈现。
 * 文案走 i18n:growth.achName.<key> / growth.achDesc.<key>;分组标题 growth.achGroup.<group>。
 */

// 成就 key → emoji 图标
export const ACHIEVEMENT_ICONS: Record<string, string> = {
  first_checkin: '📅',
  streak_7: '🔥',
  streak_30: '⚡',
  checkin_50: '📌',
  checkin_100: '🏛️',
  first_bookmark: '🔖',
  bookmark_50: '📚',
  bookmark_200: '🗂️',
  first_note: '✍️',
  note_20: '📝',
  note_50: '📖',
  first_file: '📁',
  level_5: '🎓',
  level_10: '🏅',
  level_15: '👑',
  join_7: '🌱',
  join_30: '🌿',
  join_100: '🌳',
  join_365: '🎂',
};

// 分组展示顺序
export const ACHIEVEMENT_GROUPS = ['checkin', 'create', 'level', 'tenure'] as const;
export type AchievementGroup = (typeof ACHIEVEMENT_GROUPS)[number];
