type BookmarkReference = string | number | { id?: string | number | null };

type BookmarkCoverageTag = {
  bookmarkList?: BookmarkReference[] | null;
};

export type BookmarkCoverageSummary = {
  total: number;
  activeTagCount: number;
  taggedBookmarkCount: number;
  untaggedBookmarkCount: number;
};

/**
 * 标签目录接口会返回带书签对象的 bookmarkList，早期类型和部分测试数据则只保留 ID。
 * 这里统一两种形态，并用 ID 去重，避免一个书签关联多个标签时重复计数。
 */
export function summarizeBookmarkCoverage(tags: BookmarkCoverageTag[], libraryTotal: number): BookmarkCoverageSummary {
  const taggedBookmarkIds = new Set<string>();
  let activeTagCount = 0;

  tags.forEach((tag) => {
    const references = Array.isArray(tag.bookmarkList) ? tag.bookmarkList : [];
    if (references.length > 0) activeTagCount += 1;
    references.forEach((reference) => {
      const rawId = typeof reference === 'object' && reference !== null ? reference.id : reference;
      const id = String(rawId ?? '').trim();
      if (id) taggedBookmarkIds.add(id);
    });
  });

  const total = Math.max(0, Math.floor(Number(libraryTotal) || 0));
  const taggedBookmarkCount = Math.min(total, taggedBookmarkIds.size);
  return {
    total,
    activeTagCount,
    taggedBookmarkCount,
    untaggedBookmarkCount: Math.max(0, total - taggedBookmarkCount),
  };
}
