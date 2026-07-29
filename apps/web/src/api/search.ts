import { apiBasePost } from '@/http/request.ts';
import i18n from '@/i18n';

export type SearchType = 'bookmark' | 'note' | 'file' | 'tag';

export interface SearchCursor {
  type: SearchType;
  offset: number;
}

export interface SearchResultItem {
  id: string;
  type: SearchType;
  title: string;
  description: string;
  extra?: string;
  category?: string;
  url?: string;
  route?: string;
  iconUrl?: string;
  tags?: Array<{ id: string; name: string }>;
  raw?: any;
}

export interface SearchGroup {
  type: SearchType;
  label: string;
  items: SearchResultItem[];
}

export interface GlobalSearchResponse {
  keyword: string;
  items: SearchResultItem[];
  groups: SearchGroup[];
  total: number;
  typeTotals?: Partial<Record<SearchType, number>>;
  tagOptions?: string[];
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  hasMoreByType?: Partial<Record<SearchType, boolean>>;
  nextCursor?: SearchCursor | null;
}

export interface GlobalSearchQuery {
  page?: number;
  type?: SearchType | 'all';
  sort?: 'relevance' | 'updated' | 'name';
  date?: 'all' | '7d' | '30d' | '365d';
  tags?: string[];
  untagged?: boolean;
  paginationMode?: 'perType' | 'ordered';
  cursor?: SearchCursor | null;
  includeMetadata?: boolean;
}

export interface BatchResourceItem {
  id: string;
  type: SearchType;
}

const emptySearchResult: GlobalSearchResponse = {
  keyword: '',
  items: [],
  groups: [],
  total: 0,
  typeTotals: {
    bookmark: 0,
    note: 0,
    file: 0,
    tag: 0,
  },
  tagOptions: [],
  page: 1,
  pageSize: 12,
  hasMore: false,
  hasMoreByType: {
    bookmark: false,
    note: false,
    file: false,
    tag: false,
  },
  nextCursor: null,
};

const cache = new Map<string, GlobalSearchResponse>();
const SEARCH_TYPES: SearchType[] = ['bookmark', 'note', 'file', 'tag'];

function normalizeSearchCursor(value: unknown): SearchCursor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<SearchCursor>;
  if (!SEARCH_TYPES.includes(raw.type as SearchType)) return null;
  const offset = Number(raw.offset);
  if (!Number.isFinite(offset) || offset < 0) return null;
  return {
    type: raw.type as SearchType,
    offset: Math.floor(offset),
  };
}

export async function fetchGlobalSearch(
  keyword = '',
  pageSize = 12,
  force = false,
  query: GlobalSearchQuery = {},
): Promise<GlobalSearchResponse> {
  const normalizedKeyword = keyword.trim();
  const locale = i18n.global.locale.value;
  const paginationMode = query.paginationMode === 'ordered' ? 'ordered' : 'perType';
  const normalizedCursor = normalizeSearchCursor(query.cursor);
  const normalizedQuery = {
    type: query.type || 'all',
    sort: query.sort || 'relevance',
    date: query.date || 'all',
    tags: [...(query.tags || [])]
      .map((tag) => tag.trim())
      .filter(Boolean)
      .sort(),
    untagged: query.untagged === true,
    ...(paginationMode === 'ordered'
      ? {
          paginationMode: 'ordered' as const,
          cursor: normalizedCursor,
          includeMetadata: query.includeMetadata !== false,
        }
      : {
          page: Math.max(1, Number(query.page || 1)),
        }),
  };
  const cacheKey = `${locale}::${normalizedKeyword}::${pageSize}::${JSON.stringify(normalizedQuery)}`;

  if (!force && cache.has(cacheKey)) {
    return cache.get(cacheKey) as GlobalSearchResponse;
  }

  const res = await apiBasePost('/api/search/global', {
    keyword: normalizedKeyword,
    ...(paginationMode === 'ordered' ? { pageSize } : { limitPerType: pageSize }),
    ...normalizedQuery,
  });

  if (res.status !== 200) return emptySearchResult;

  const typeTotals =
    res.data?.typeTotals && typeof res.data.typeTotals === 'object'
      ? {
          ...emptySearchResult.typeTotals,
          ...res.data.typeTotals,
        }
      : paginationMode === 'perType'
        ? { ...emptySearchResult.typeTotals }
        : undefined;
  const hasMoreByType =
    res.data?.hasMoreByType && typeof res.data.hasMoreByType === 'object'
      ? {
          ...emptySearchResult.hasMoreByType,
          ...res.data.hasMoreByType,
        }
      : paginationMode === 'perType'
        ? { ...emptySearchResult.hasMoreByType }
        : undefined;
  const data: GlobalSearchResponse = {
    keyword: String(res.data?.keyword || normalizedKeyword),
    groups: Array.isArray(res.data?.groups) ? res.data.groups : [],
    items: Array.isArray(res.data?.items) ? res.data.items : [],
    total: Number(res.data?.total || 0),
    page: Number(res.data?.page || query.page || 1),
    pageSize: Number(res.data?.pageSize || pageSize || 12),
    hasMore: Boolean(res.data?.hasMore),
    nextCursor: normalizeSearchCursor(res.data?.nextCursor),
    ...(Array.isArray(res.data?.tagOptions)
      ? { tagOptions: res.data.tagOptions }
      : paginationMode === 'perType'
        ? { tagOptions: [] }
        : {}),
    ...(typeTotals ? { typeTotals } : {}),
    ...(hasMoreByType ? { hasMoreByType } : {}),
  };

  cache.set(cacheKey, data);
  return data;
}

export function clearGlobalSearchCache() {
  cache.clear();
}

export function batchDeleteSearchResources(items: BatchResourceItem[]) {
  return apiBasePost('/api/search/batchDeleteResources', { items });
}
