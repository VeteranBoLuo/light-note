import {
  TAGGABLE_RESOURCE_TYPES,
  type GlobalSearchType,
  type SearchCenterType,
} from '@/utils/globalSearchTypes';

/** 查找可展示资料和待办；标签以筛选条件和导航匹配独立呈现。 */
export const SEARCH_CENTER_TYPE_LIST: SearchCenterType[] = [...TAGGABLE_RESOURCE_TYPES, 'todo'];

export function getSearchTypeLabel(t: (key: string) => string, type: GlobalSearchType | 'all') {
  if (type === 'all') return t('resourceCenter.types.all');
  return t(`resourceCenter.types.${type}`);
}
