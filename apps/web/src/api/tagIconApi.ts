import { apiBasePost } from '@/http/request.ts';

export interface TagIconSearchResult {
  icons: string[];
  keywords: string[];
  translatedQuery: string;
  page: number;
  hasMore: boolean;
  cached: boolean;
}

export async function searchTagIcons(query: string, page = 0) {
  return apiBasePost('/api/tagIcon/search', { query, page }, { silent: true });
}

export async function resolveTagIcon(icon: string) {
  return apiBasePost('/api/tagIcon/resolve', { icon }, { silent: true });
}
