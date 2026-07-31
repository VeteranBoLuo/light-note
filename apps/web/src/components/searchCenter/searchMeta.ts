import { GLOBAL_SEARCH_TYPES, RESOURCE_SEARCH_TYPES, type GlobalSearchType } from '@/utils/globalSearchTypes';
import type { SearchType } from '@/api/search.ts';

/** 资料四类：@ 选择器、批量操作等只接受资料对象的地方使用 */
export const SEARCH_TYPE_LIST: SearchType[] = [...RESOURCE_SEARCH_TYPES];

/** 完整搜索页的类型集合：包含待办，待办可被搜索但不参与资源批量语义 */
export const SEARCH_CENTER_TYPE_LIST: GlobalSearchType[] = [...GLOBAL_SEARCH_TYPES];

export function getSearchTypeLabel(t: (key: string) => string, type: GlobalSearchType | 'all') {
  if (type === 'all') return t('resourceCenter.types.all');
  return t(`resourceCenter.types.${type}`);
}
