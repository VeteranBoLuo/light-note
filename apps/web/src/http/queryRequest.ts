export interface QueryData {
  pageSize?: number;
  currentPage?: number;
  level?: number;
  order?: { [key: string]: 'DESC' | 'ASC' };
  filters?: unknown;
  cursor?: string | null;
  limit?: number;
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

export function buildQueryRequestData(data: QueryData = {}) {
  const payload: Record<string, unknown> = {
    pageSize: data.pageSize ?? 10,
    currentPage: data.currentPage ?? 1,
    level: data.level ?? 0,
    filters: data.filters ?? {},
    order: data.order ?? {},
  };

  // 游标首屏必须显式保留 cursor: null，后端据此区分游标模式与旧分页模式。
  if (Object.prototype.hasOwnProperty.call(data, 'cursor')) payload.cursor = data.cursor ?? null;
  if (Object.prototype.hasOwnProperty.call(data, 'limit')) payload.limit = data.limit;
  if (Object.prototype.hasOwnProperty.call(data, 'sort')) payload.sort = data.sort;

  return payload;
}
