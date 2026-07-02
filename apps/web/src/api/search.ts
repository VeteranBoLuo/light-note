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
};

const cache = new Map<string, GlobalSearchResponse>();

export async function fetchGlobalSearch(keyword = '', limitPerType = 12, force = false): Promise<GlobalSearchResponse> {
  const normalizedKeyword = keyword.trim();
  const locale = i18n.global.locale.value;
  const cacheKey = `${locale}::${normalizedKeyword}::${limitPerType}`;

  if (!force && cache.has(cacheKey)) {
    return cache.get(cacheKey) as GlobalSearchResponse;
  }

  const res = await apiBasePost('/api/search/global', {
    keyword: normalizedKeyword,
    limitPerType,
  });

  if (res.status !== 200) return emptySearchResult;

  const data = {
    ...emptySearchResult,
    ...res.data,
    groups: Array.isArray(res.data?.groups) ? res.data.groups : [],
    items: Array.isArray(res.data?.items) ? res.data.items : [],
    total: Number(res.data?.total || 0),
    typeTotals: {
      ...emptySearchResult.typeTotals,
      ...(res.data?.typeTotals || {}),
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
