import type { SearchResultItem } from '@/api/search';

export const SUGGEST_TOTAL_LIMIT = 8;
export const SUGGEST_PER_TYPE_LIMIT = 3;

/** 同一资源在多轮补齐或服务端多批结果中只保留一次 */
export function dedupeSearchItems(items: readonly SearchResultItem[]): SearchResultItem[] {
  const seen = new Set<string>();
  const result: SearchResultItem[] = [];
  items.forEach((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
}

/**
 * 快捷层类型均衡的前端兜底：与服务端同规则。
 *
 * 输入必须已按相关度排序；单类型超过上限的结果先让位给其他类型，
 * 其他类型不足时再用它们补足总数，同类型内部保持原有相关度顺序。
 */
export function diversifySearchItems(
  items: readonly SearchResultItem[],
  totalLimit = SUGGEST_TOTAL_LIMIT,
  perTypeLimit = SUGGEST_PER_TYPE_LIMIT,
): SearchResultItem[] {
  const picked: SearchResultItem[] = [];
  const overflow: SearchResultItem[] = [];
  const countByType = new Map<string, number>();

  items.forEach((item) => {
    const used = countByType.get(item.type) || 0;
    if (picked.length < totalLimit && used < perTypeLimit) {
      countByType.set(item.type, used + 1);
      picked.push(item);
      return;
    }
    overflow.push(item);
  });

  for (const item of overflow) {
    if (picked.length >= totalLimit) break;
    picked.push(item);
  }
  return picked;
}
