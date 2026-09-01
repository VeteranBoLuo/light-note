import {
  RESOURCE_SEARCH_TYPES,
  TAGGABLE_RESOURCE_TYPES,
  type GlobalSearchType,
  type TaggableResourceType,
} from '@/utils/globalSearchTypes';
import type { SearchType } from '@/api/search.ts';

/** 资料四类：@ 选择器、批量操作等只接受资料对象的地方使用 */
export const SEARCH_TYPE_LIST: SearchType[] = [...RESOURCE_SEARCH_TYPES];

/** 资源中心只承载可整理的内容资源；标签以筛选条件和导航匹配独立呈现。 */
export const SEARCH_CENTER_TYPE_LIST: TaggableResourceType[] = [...TAGGABLE_RESOURCE_TYPES];

export function getSearchTypeLabel(t: (key: string) => string, type: GlobalSearchType | 'all') {
  if (type === 'all') return t('resourceCenter.types.all');
  return t(`resourceCenter.types.${type}`);
}
