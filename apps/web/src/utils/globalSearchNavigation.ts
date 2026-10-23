import type { Router } from 'vue-router';
import type { SearchResultItem } from '@/api/search';
import { openBookmarkUrl } from '@/utils/openBookmark';
import { resolvePublicResourceReturnPath } from './publicResourceNavigation';
import { resolveSearchReturnPath } from './searchReturnNavigation';

interface SearchNavigationOptions {
  noteReturnPath?: string;
  publicReturnPath?: string;
}

/** Scope synchronization updates the URL without leaving the current search overlay. */
export function searchNavigationKey(route: { path: string; hash?: string; query: Record<string, unknown> }) {
  return JSON.stringify([
    route.path,
    route.hash || '',
    Object.keys(route.query)
      .filter((k) => k !== 'public')
      .sort()
      .map((k) => [k, route.query[k]]),
  ]);
}

/**
 * 全局搜索结果的统一打开规则：
 * - 书签 → 按用户「当前页 / 新标签」偏好打开原网页
 * - 文件 → 按稳定 ID 进入云空间预览
 * - 笔记 / 标签 / 待办 → 走服务端给出的站内路由
 *
 * 搜索层的语义是「找到并打开对象」，与资源选择器的「选中并插入」不同，
 * 因此这段导航逻辑不与 ResourcePickerPanel 共享。
 */
export function navigateToSearchResult(
  router: Router,
  item: SearchResultItem,
  options: SearchNavigationOptions = {},
): void {
  if (item.origin === 'public') {
    const from = resolvePublicResourceReturnPath(router, options.publicReturnPath ?? options.noteReturnPath);
    void router.push({
      path: '/public-resources/' + encodeURIComponent(item.publicResource?.publicId || item.id),
      query: from ? { from } : {},
    });
    return;
  }
  if (item.type === 'bookmark' && item.url) {
    openBookmarkUrl(item.url, { resourceId: item.id });
    return;
  }
  if (item.type === 'file') {
    const fileId = String(item.id || '').trim();
    if (fileId) void router.push({ path: '/cloudSpace', query: { fileId } });
    return;
  }
  const source = resolveSearchReturnPath(options.noteReturnPath);
  if (item.type === 'note' && item.route && source) {
    const target = router.resolve(item.route);
    if (/^\/noteLibrary\/[^/]+$/u.test(target.path)) {
      void router.push({ path: target.path, query: { ...target.query, from: source }, hash: target.hash });
      return;
    }
  }
  if (item.route) void router.push(item.route);
}

/** 定位保留模块内浏览入口，与打开具体资料分开。 */
export function locateSearchResult(router: Router, item: SearchResultItem): void {
  if (item.origin === 'public') return;
  if (item.type === 'bookmark') {
    void router.push({ path: '/home', query: { locate: item.id } });
  } else if (item.type === 'file') {
    void router.push({ path: '/cloudSpace', query: { fileName: item.title } });
  }
}
