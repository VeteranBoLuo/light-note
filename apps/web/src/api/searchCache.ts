import { ref } from 'vue';
import type { GlobalSearchResponse, GlobalSearchSuggestResponse } from './search';

const MAX_SEARCH_CACHE_ENTRIES = 64;
const identity = ref(0);
let revision = 0;

export const fullSearchCache = new Map<string, GlobalSearchResponse>();
export const searchSuggestionCache = new Map<string, { at: number; data: GlobalSearchSuggestResponse }>();

export const searchIdentityVersion = () => identity.value;
export const searchCacheRevision = () => revision;

export function clearGlobalSearchCache() {
  revision += 1;
  fullSearchCache.clear();
  searchSuggestionCache.clear();
}

export function resetSearchIdentity() {
  clearGlobalSearchCache();
  identity.value += 1;
}

export function assertSearchIdentity(version: number, signal?: { aborted: boolean }) {
  if (version !== identity.value || signal?.aborted) {
    throw new DOMException('Search request cancelled', 'AbortError');
  }
}

export function cacheSearchResponse<T>(cache: Map<string, T>, key: string, value: T, startedAt: number) {
  if (startedAt !== revision) return;
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_SEARCH_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
}
