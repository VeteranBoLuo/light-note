import {
  FEATURE_SHORTCUTS,
  getFeatureShortcut,
  type FeatureShortcutDefinition,
  type FeatureShortcutPlatform,
} from '@/config/featureShortcuts';

export const FEATURE_SHORTCUT_MATCH_LIMIT = 3;
export const FEATURE_SHORTCUT_MIN_QUERY_LENGTH = 2;
export const FEATURED_FEATURES_MAX_ITEMS = 3;
export const FEATURED_FEATURE_DESCRIPTION_MAX = 30;

export interface FeatureShortcutContext {
  platform: FeatureShortcutPlatform;
  isGuest: boolean;
}

export interface FeatureShortcutMatch {
  feature: FeatureShortcutDefinition;
  /** 只靠别名命中时，用于提示「也叫……」；名称已包含关键词时为空。 */
  alias: string | null;
}

/** 与服务端 config_json 存储一致的一项「最近上线」；没有到期时间，Root 移除前一直展示。 */
export interface FeaturedFeatureItem {
  featureId: string;
  description: string;
  /** 只用于展示上线日期。 */
  publishDate: string;
}

export interface FeaturedFeatureEntry {
  feature: FeatureShortcutDefinition;
  item: FeaturedFeatureItem;
}

function normalizeText(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isFeatureShortcutAvailable(feature: FeatureShortcutDefinition, context: FeatureShortcutContext) {
  return feature.platforms.includes(context.platform) && !(feature.requiresLogin && context.isGuest);
}

/**
 * 名称开头命中 > 名称包含（或关键词包含名称）> 说法命中；同分保持清单顺序，最多 3 项。
 * 「怎么导入书签」这类整句也能通过「关键词包含说法」命中。
 */
export function matchFeatureShortcuts(
  keyword: string,
  context: FeatureShortcutContext,
  titleOf: (feature: FeatureShortcutDefinition) => string,
  limit = FEATURE_SHORTCUT_MATCH_LIMIT,
): FeatureShortcutMatch[] {
  const query = normalizeText(keyword);
  if (Array.from(query).length < FEATURE_SHORTCUT_MIN_QUERY_LENGTH) return [];
  const scored: Array<FeatureShortcutMatch & { score: number; order: number }> = [];
  FEATURE_SHORTCUTS.forEach((feature, order) => {
    if (!isFeatureShortcutAvailable(feature, context)) return;
    const title = normalizeText(titleOf(feature));
    if (title.startsWith(query)) {
      scored.push({ feature, alias: null, score: 3, order });
      return;
    }
    if (title.includes(query) || (title && query.includes(title))) {
      scored.push({ feature, alias: null, score: 2, order });
      return;
    }
    const alias =
      feature.aliases.find((item) => normalizeText(item).includes(query)) ||
      feature.aliases.find((item) => {
        const normalized = normalizeText(item);
        return Array.from(normalized).length >= FEATURE_SHORTCUT_MIN_QUERY_LENGTH && query.includes(normalized);
      });
    if (alias) scored.push({ feature, alias, score: 1, order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ feature, alias }) => ({ feature, alias }));
}

/** 本地时区的 YYYY-MM-DD；不能用 toISOString，北京时间凌晨会差一天。 */
export function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 过滤清单里已删除或当前端不可用的项，保持 Root 设定的顺序。 */
export function resolveFeaturedFeatures(
  items: readonly FeaturedFeatureItem[],
  context: FeatureShortcutContext,
): FeaturedFeatureEntry[] {
  return items.flatMap((item) => {
    const feature = getFeatureShortcut(item.featureId);
    if (!feature || !isFeatureShortcutAvailable(feature, context)) return [];
    return [{ feature, item }];
  });
}
