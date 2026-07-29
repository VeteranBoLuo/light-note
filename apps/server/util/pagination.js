const DEFAULT_PAGE_SIZE = 48;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 1_000_000;

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/**
 * 解析资源列表分页参数。
 *
 * 兼容约定：
 * - 只有显式传入 pageSize 时才启用分页，旧调用方可以继续获取原有数组结构；
 * - pageSize = -1 明确表示不分页；
 * - 同时兼容项目既有的 currentPage 和更直观的 page 字段。
 */
export function normalizeOptionalPagination(
  input = {},
  { defaultPageSize = DEFAULT_PAGE_SIZE, maxPageSize = MAX_PAGE_SIZE } = {},
) {
  const rawPageSize = input?.pageSize;
  if (rawPageSize === undefined || rawPageSize === null || Number(rawPageSize) === -1) {
    return {
      enabled: false,
      page: 1,
      pageSize: null,
      offset: 0,
    };
  }

  const safeDefault = Math.min(toPositiveInteger(defaultPageSize, DEFAULT_PAGE_SIZE), maxPageSize);
  const pageSize = Math.min(toPositiveInteger(rawPageSize, safeDefault), maxPageSize);
  const page = Math.min(toPositiveInteger(input?.currentPage ?? input?.page, 1), MAX_PAGE);

  return {
    enabled: true,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function buildPagedResult(items, total, pagination) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const normalizedTotal = Math.max(0, Number(total) || 0);
  const page = pagination?.page || 1;
  const pageSize = pagination?.pageSize || normalizedItems.length || 1;

  return {
    items: normalizedItems,
    total: normalizedTotal,
    page,
    pageSize,
    hasMore: page * pageSize < normalizedTotal,
  };
}
