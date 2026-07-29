import { apiBasePost } from '@/http/request.ts';
import i18n from '@/i18n';

export type SearchType = 'bookmark' | 'note' | 'file' | 'tag';

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
}

export interface GlobalSearchQuery {
  page?: number;
  type?: SearchType | 'all';
  sort?: 'relevance' | 'updated' | 'name';
  date?: 'all' | '7d' | '30d' | '365d';
  tags?: string[];
  untagged?: boolean;
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
};

const cache = new Map<string, GlobalSearchResponse>();

export async function fetchGlobalSearch(
  keyword = '',
  limitPerType = 12,
  force = false,
  query: GlobalSearchQuery = {},
): Promise<GlobalSearchResponse> {
  const normalizedKeyword = keyword.trim();
  const locale = i18n.global.locale.value;
  const normalizedQuery = {
    page: Math.max(1, Number(query.page || 1)),
    type: query.type || 'all',
    sort: query.sort || 'relevance',
    date: query.date || 'all',
    tags: [...(query.tags || [])]
      .map((tag) => tag.trim())
      .filter(Boolean)
      .sort(),
    untagged: query.untagged === true,
  };
  const cacheKey = `${locale}::${normalizedKeyword}::${limitPerType}::${JSON.stringify(normalizedQuery)}`;

  if (!force && cache.has(cacheKey)) {
    return cache.get(cacheKey) as GlobalSearchResponse;
  }

  const res = await apiBasePost('/api/search/global', {
    keyword: normalizedKeyword,
    limitPerType,
    ...normalizedQuery,
  });

  if (res.status !== 200) return emptySearchResult;

  const data = {
    ...emptySearchResult,
    ...res.data,
    groups: Array.isArray(res.data?.groups) ? res.data.groups : [],
    items: Array.isArray(res.data?.items) ? res.data.items : [],
    total: Number(res.data?.total || 0),
    tagOptions: Array.isArray(res.data?.tagOptions) ? res.data.tagOptions : [],
    page: Number(res.data?.page || normalizedQuery.page),
    pageSize: Number(res.data?.pageSize || limitPerType || 12),
    hasMore: Boolean(res.data?.hasMore),
    typeTotals: {
      ...emptySearchResult.typeTotals,
      ...(res.data?.typeTotals || {}),
    },
    hasMoreByType: {
      ...emptySearchResult.hasMoreByType,
      ...(res.data?.hasMoreByType || {}),
    },
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
