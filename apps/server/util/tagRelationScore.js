/**
 * 标签相关度评分:统一「标签详情」「单标签图谱」「全局知识地图」的口径。
 *
 * 相关度来自共同资源(共现),不再依赖用户手工维护的 tag_relations。
 * 用余弦式归一化而非共现绝对数,避免「工作」「收藏」这类大而泛的标签长期霸榜:
 *   similarity = shared / sqrt(sourceCount * targetCount)
 */

/** 共现 1 次也可入选的最低相似度:两个小标签唯一的共同资源足以说明紧密。 */
export const SINGLE_SHARED_MIN_SIMILARITY = 0.5;

export function computeTagSimilarity({ sharedCount, sourceResourceCount, targetResourceCount }) {
  const shared = Number(sharedCount || 0);
  const source = Number(sourceResourceCount || 0);
  const target = Number(targetResourceCount || 0);
  if (shared <= 0 || source <= 0 || target <= 0) return 0;
  const similarity = shared / Math.sqrt(source * target);
  // 浮点误差可能让完全重合的两个标签算出 1.0000000000000002。
  return Math.min(1, Number(similarity.toFixed(6)));
}

/** 共现 1 次的弱关系需要更高相似度才入选,否则稀疏知识库会被噪音淹没。 */
export function isRelatedTagQualified(candidate, { minSimilarity = 0 } = {}) {
  const shared = Number(candidate?.sharedCount || 0);
  const similarity = Number(candidate?.similarity || 0);
  if (shared <= 0) return false;
  if (similarity < minSimilarity) return false;
  return shared >= 2 || similarity >= SINGLE_SHARED_MIN_SIMILARITY;
}

/** 相似度优先,其次共现数,最后用目标标签体量兜底,保证排序稳定可复现。 */
export function compareRelatedTags(left, right) {
  const bySimilarity = Number(right?.similarity || 0) - Number(left?.similarity || 0);
  if (bySimilarity !== 0) return bySimilarity;
  const byShared = Number(right?.sharedCount || 0) - Number(left?.sharedCount || 0);
  if (byShared !== 0) return byShared;
  const byTarget = Number(right?.targetResourceCount || 0) - Number(left?.targetResourceCount || 0);
  if (byTarget !== 0) return byTarget;
  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

/**
 * 把「候选标签 + 共现数」原始行整理为对外的相关标签列表。
 * 入参已由 SQL 聚合完成,这里只做评分、过滤、排序和截断,便于单测覆盖边界。
 */
export function rankRelatedTags(rows, { sourceResourceCount, limit = 8, minSimilarity = 0 } = {}) {
  const source = Number(sourceResourceCount || 0);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const sharedCount = Number(row?.sharedCount || 0);
      const targetResourceCount = Number(row?.targetResourceCount || 0);
      return {
        id: String(row?.id ?? ''),
        name: row?.name || '',
        iconUrl: row?.iconUrl ?? null,
        sharedCount,
        sourceResourceCount: source,
        targetResourceCount,
        similarity: computeTagSimilarity({
          sharedCount,
          sourceResourceCount: source,
          targetResourceCount,
        }),
        reason: 'co_occurrence',
      };
    })
    .filter((candidate) => candidate.id && isRelatedTagQualified(candidate, { minSimilarity }))
    .sort(compareRelatedTags)
    .slice(0, Math.max(0, Number(limit) || 0));
}
