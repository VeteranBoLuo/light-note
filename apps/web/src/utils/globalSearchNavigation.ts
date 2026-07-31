import type { Router } from 'vue-router';
import type { SearchResultItem } from '@/api/search';
import { openBookmarkUrl } from '@/utils/openBookmark';

/**
 * 全局搜索结果的统一打开规则：
 * - 书签 → 按用户「当前页 / 新标签」偏好打开原网页
 * - 文件 → 进入云空间并定位到该文件
 * - 笔记 / 标签 / 待办 → 走服务端给出的站内路由
 *
 * 搜索层的语义是「找到并打开对象」，与资源选择器的「选中并插入」不同，
 * 因此这段导航逻辑不与 ResourcePickerPanel 共享。
 */
export function navigateToSearchResult(router: Router, item: SearchResultItem): void {
  if (item.type === 'bookmark' && item.url) {
    openBookmarkUrl(item.url);
    return;
  }
  if (item.type === 'file') {
    void router.push({ path: '/cloudSpace', query: { fileName: item.title } });
    return;
  }
  if (item.route) void router.push(item.route);
}
