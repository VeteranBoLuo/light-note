import { apiBasePost } from '@/http/request.ts';

export interface TagIconSearchResult {
  icons: string[];
  keywords: string[];
  translatedQuery: string;
  page: number;
  hasMore: boolean;
  cached: boolean;
  aiExpanded: boolean;
}

export async function searchTagIcons(query: string, page = 0, useAi = false, mode: 'browse' | 'recommend' = 'browse') {
  return apiBasePost('/api/tagIcon/search', { query, page, useAi, mode }, { silent: true });
}

export async function resolveTagIcon(icon: string) {
  return apiBasePost('/api/tagIcon/resolve', { icon }, { silent: true });
}
