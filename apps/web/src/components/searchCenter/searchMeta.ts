import {
  RESOURCE_SEARCH_TYPES,
  TAGGABLE_RESOURCE_TYPES,
  type GlobalSearchType,
  type SearchCenterType,
} from '@/utils/globalSearchTypes';
import type { SearchType } from '@/api/search.ts';

/** 资料四类：@ 选择器、批量操作等只接受资料对象的地方使用 */
export const SEARCH_TYPE_LIST: SearchType[] = [...RESOURCE_SEARCH_TYPES];

/** 查找可展示资料和待办；标签以筛选条件和导航匹配独立呈现。 */
export const SEARCH_CENTER_TYPE_LIST: SearchCenterType[] = [...TAGGABLE_RESOURCE_TYPES, 'todo'];

export function getSearchTypeLabel(t: (key: string) => string, type: GlobalSearchType | 'all') {
  if (type === 'all') return t('resourceCenter.types.all');
  return t(`resourceCenter.types.${type}`);
}
