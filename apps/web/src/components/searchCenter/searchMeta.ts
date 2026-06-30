import type { SearchType } from '@/api/search.ts';

export const SEARCH_TYPE_LIST: SearchType[] = ['bookmark', 'note', 'file', 'tag'];

export function getSearchTypeLabel(t: (key: string) => string, type: SearchType | 'all') {
  if (type === 'all') return t('resourceCenter.types.all');
  return t(`resourceCenter.types.${type}`);
}
