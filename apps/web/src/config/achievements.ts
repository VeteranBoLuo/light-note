/**
 * 成就展示元信息(分组顺序)。分组图标统一来自 config/icon.ts 的 growth.*。
 * 阈值(target)与解锁判定在后端 util/growth.js 的 ACHIEVEMENTS 单一事实源,前端只负责呈现。
 * 文案走 i18n:growth.achName.<key> / growth.achDesc.<key>;分组标题 growth.achGroup.<group>。
 */

// 分组展示顺序
export const ACHIEVEMENT_GROUPS = ['checkin', 'create', 'action', 'organize', 'level', 'tenure'] as const;
export type AchievementGroup = (typeof ACHIEVEMENT_GROUPS)[number];
