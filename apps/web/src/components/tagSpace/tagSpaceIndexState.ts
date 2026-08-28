import type { LocationQuery, LocationQueryRaw } from 'vue-router';
import type { TagSpaceFilter, TagSpaceSort } from '@/api/tagSpace';

const FILTERS = new Set<TagSpaceFilter>(['all', 'bookmark', 'note', 'file']);
const SORTS = new Set<TagSpaceSort>(['default', 'recent', 'resourceDesc', 'nameAsc']);

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

export function readTagSpaceQuery(query: LocationQuery | Record<string, unknown>) {
  const keyword = String(firstQueryValue(query.q) || '')
    .trim()
    .slice(0, 100);
  const rawFilter = String(firstQueryValue(query.filter) || 'all') as TagSpaceFilter;
  const rawSort = String(firstQueryValue(query.sort) || 'recent') as TagSpaceSort;
  return {
    keyword,
    filter: FILTERS.has(rawFilter) ? rawFilter : ('all' as TagSpaceFilter),
    sort: SORTS.has(rawSort) ? rawSort : ('recent' as TagSpaceSort),
  };
}

export function writeTagSpaceQuery(
  currentQuery: LocationQuery | Record<string, unknown>,
  state: { keyword: string; filter: TagSpaceFilter; sort: TagSpaceSort },
): LocationQueryRaw {
  const next: LocationQueryRaw = { ...currentQuery } as LocationQueryRaw;
  const keyword = state.keyword.trim();
  if (keyword) next.q = keyword;
  else delete next.q;
  if (state.filter !== 'all') next.filter = state.filter;
  else delete next.filter;
  if (state.sort !== 'recent') next.sort = state.sort;
  else delete next.sort;
  delete next.mode;
  return next;
}

export function readTagSpaceHistoryState(state: unknown) {
  const value = state && typeof state === 'object' ? (state as Record<string, unknown>).tagSpaceIndex : null;
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const page = Number(record.page);
  const scrollTop = Number(record.scrollTop);
  return {
    page: Number.isFinite(page) && page > 0 ? Math.min(20, Math.floor(page)) : 1,
    scrollTop: Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : 0,
  };
}
