import { apiBasePost } from '@/http/request.ts';
import i18n from '@/i18n';
import {
  GLOBAL_SEARCH_TYPES,
  RESOURCE_SEARCH_TYPES,
  type GlobalSearchType,
  type ResourceSearchType,
} from '@/utils/globalSearchTypes';

/** 历史别名：资料四类。待办请显式使用 GlobalSearchType。 */
export type SearchType = ResourceSearchType;
export type { GlobalSearchType };

export interface SearchCursor {
  type: GlobalSearchType | 'all';
  offset: number;
}

export interface SearchResultItem {
  id: string;
  type: GlobalSearchType;
  title: string;
  description: string;
  extra?: string;
  category?: string;
  url?: string;
  route?: string;
  iconUrl?: string;
  tags?: Array<{ id: string; name: string }>;
  matchReason?: 'title_exact' | 'title_prefix' | 'title' | 'tag' | 'url' | 'description' | 'content' | string;
  snippet?: string;
  /** 以下字段仅待办结果返回 */
  status?: 'pending' | 'completed';
  priority?: 0 | 1 | 2;
  dueAt?: string | null;
  completedAt?: string | null;
  referenceCount?: number;
  raw?: any;
}

export interface SearchGroup {
  type: GlobalSearchType;
  label: string;
  items: SearchResultItem[];
}

export interface GlobalSearchResponse {
  keyword: string;
  items: SearchResultItem[];
  groups: SearchGroup[];
  total: number;
  typeTotals?: Partial<Record<GlobalSearchType, number>>;
  tagOptions?: string[];
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  hasMoreByType?: Partial<Record<GlobalSearchType, boolean>>;
  nextCursor?: SearchCursor | null;
}

export interface GlobalSearchQuery {
  page?: number;
  type?: GlobalSearchType | 'all';
  types?: GlobalSearchType[];
  sort?: 'relevance' | 'updated' | 'name';
  date?: 'all' | '7d' | '30d' | '365d';
  tags?: string[];
  untagged?: boolean;
  paginationMode?: 'perType' | 'ordered';
  cursor?: SearchCursor | null;
  includeMetadata?: boolean;
  /** 以下待办条件只有在 types 显式包含 todo 时才生效 */
  todoStatus?: 'all' | 'pending' | 'completed';
  todoPriority?: Array<0 | 1 | 2>;
  todoDue?: 'all' | 'overdue' | 'today' | '7d' | 'none';
}

export interface BatchResourceItem {
  id: string;
  /** 批量操作只接受资料对象，待办不参与资源批量语义 */
  type: ResourceSearchType;
}

export interface BatchSelectionQuery {
  keyword: string;
  types: ResourceSearchType[];
  sort: 'relevance' | 'updated' | 'name';
  date: 'all' | '7d' | '30d' | '365d';
  tags: string[];
  untagged: boolean;
}

export type BatchSelection =
  | { mode: 'explicit'; items: BatchResourceItem[] }
  | {
      mode: 'allMatching';
      query: BatchSelectionQuery;
      excludedItems: BatchResourceItem[];
    };

export interface BatchSelectionSummary {
  mode: 'explicit' | 'allMatching';
  total: number;
  typeCounts: Record<ResourceSearchType, number>;
  editableCount: number;
  inboxCount: number;
  deleteCount: number;
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
    todo: 0,
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
    todo: false,
  },
  nextCursor: null,
};

const cache = new Map<string, GlobalSearchResponse>();

function normalizeSearchCursor(value: unknown): SearchCursor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<SearchCursor>;
  if (raw.type !== 'all' && !GLOBAL_SEARCH_TYPES.includes(raw.type as GlobalSearchType)) return null;
  const offset = Number(raw.offset);
  if (!Number.isFinite(offset) || offset < 0) return null;
  return {
    type: raw.type as GlobalSearchType | 'all',
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
  const normalizedTypes = [...new Set(query.types || [])].filter((type) => GLOBAL_SEARCH_TYPES.includes(type)).sort();
  const includesTodo = normalizedTypes.includes('todo');
  const normalizedQuery = {
    type: query.type || 'all',
    ...(normalizedTypes.length ? { types: normalizedTypes } : {}),
    sort: query.sort || 'relevance',
    date: query.date || 'all',
    tags: [...(query.tags || [])]
      .map((tag) => tag.trim())
      .filter(Boolean)
      .sort(),
    untagged: query.untagged === true,
    // 待办条件只在显式搜索待办时下发，避免污染既有资源调用方的缓存键
    ...(includesTodo
      ? {
          todoStatus: query.todoStatus || 'all',
          todoPriority: [...(query.todoPriority || [])].sort(),
          todoDue: query.todoDue || 'all',
        }
      : {}),
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

  if (res.status !== 200) {
    const error = new Error(String(res.msg || i18n.global.t('common.requestFailedDescription'))) as Error & {
      requestId?: string;
    };
    error.requestId = String(res.requestId || '');
    throw error;
  }

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

export interface GlobalSearchSuggestResponse {
  keyword: string;
  items: SearchResultItem[];
  hasMore: boolean;
}

interface SuggestCacheEntry {
  at: number;
  data: GlobalSearchSuggestResponse;
}

// 快捷搜索按“账号 + 语言 + 关键词 + 类型”短缓存；资源写操作会调用 clearGlobalSearchCache 一并失效
const SUGGEST_CACHE_TTL = 30_000;
const suggestCache = new Map<string, SuggestCacheEntry>();

/**
 * 快捷全局搜索：结果已在服务端做过相关度排序与类型均衡（最多 8 条、单类型最多 3 条）。
 * 不返回 typeTotals / tagOptions / 分页，保证每次输入的请求足够轻。
 */
export async function fetchGlobalSearchSuggestions(
  keyword: string,
  options: { types?: GlobalSearchType[]; sourceType?: GlobalSearchType | ''; signal?: AbortSignal } = {},
): Promise<GlobalSearchSuggestResponse> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return { keyword: '', items: [], hasMore: false };

  const locale = i18n.global.locale.value;
  const types = [...new Set(options.types || GLOBAL_SEARCH_TYPES)]
    .filter((type) => GLOBAL_SEARCH_TYPES.includes(type))
    .sort();
  // 来源页只是弱排序信号，但会改变结果顺序，因此必须进缓存键
  const sourceType = GLOBAL_SEARCH_TYPES.includes(options.sourceType as GlobalSearchType)
    ? (options.sourceType as GlobalSearchType)
    : '';
  const cacheKey = `${locale}::${normalizedKeyword}::${types.join(',')}::${sourceType}`;
  const cached = suggestCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SUGGEST_CACHE_TTL) return cached.data;

  const res = await apiBasePost(
    '/api/search/global',
    {
      keyword: normalizedKeyword,
      types,
      mode: 'suggest',
      includeMetadata: false,
      ...(sourceType ? { sourceType } : {}),
    },
    { signal: options.signal, silent: true },
  );

  if (res.status !== 200) {
    const error = new Error(String(res.msg || i18n.global.t('common.requestFailedDescription'))) as Error & {
      requestId?: string;
    };
    error.requestId = String(res.requestId || '');
    throw error;
  }

  const data: GlobalSearchSuggestResponse = {
    keyword: String(res.data?.keyword || normalizedKeyword),
    items: Array.isArray(res.data?.items) ? res.data.items : [],
    hasMore: Boolean(res.data?.hasMore),
  };
  suggestCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export function clearGlobalSearchCache() {
  cache.clear();
  suggestCache.clear();
}

export function previewSearchBatchSelection(selection: BatchSelection) {
  return apiBasePost('/api/search/batchSelectionPreview', { selection });
}

export function batchAddSearchResourcesToInbox(selection: BatchSelection) {
  return apiBasePost('/api/search/batchAddResourcesToInbox', { selection });
}

export function batchDeleteSearchResources(itemsOrSelection: BatchResourceItem[] | BatchSelection) {
  return apiBasePost(
    '/api/search/batchDeleteResources',
    Array.isArray(itemsOrSelection) ? { items: itemsOrSelection } : { selection: itemsOrSelection },
  );
}
