import { RESOURCE_SEARCH_TYPES, type GlobalSearchType } from '@/utils/globalSearchTypes';
import type { SearchType } from '@/api/search.ts';

/** 资料四类：@ 选择器、批量操作等只接受资料对象的地方使用 */
export const SEARCH_TYPE_LIST: SearchType[] = [...RESOURCE_SEARCH_TYPES];

/** 资源中心只承载四类知识资源；待办仅保留在顶部全局搜索与待办工作区。 */
export const SEARCH_CENTER_TYPE_LIST: GlobalSearchType[] = [...RESOURCE_SEARCH_TYPES];

export function getSearchTypeLabel(t: (key: string) => string, type: GlobalSearchType | 'all') {
  if (type === 'all') return t('resourceCenter.types.all');
  return t(`resourceCenter.types.${type}`);
}
