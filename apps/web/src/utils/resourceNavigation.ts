import type { RouteLocationRaw } from 'vue-router';

/**
 * 资源的中性跳转规则。
 *
 * 待办参考资料、笔记引用等跨模块场景都需要「点一下打开这个资源」,
 * 但不应该依赖 AI 侧的 resolveAiSourceNavigation(那份带有来源卡片的业务语义)。
 * 这里只沉淀路由事实,与项目既有的资源 canonical 路径保持一致。
 */
export type NavigableResourceType = 'bookmark' | 'note' | 'file';

export interface NavigableResource {
  type: NavigableResourceType | string;
  id: string;
  title?: string;
}

/**
 * 待整理资源的标准入口。
 *
 * 移动端的 `/inbox` 一级入口属于待办，必须显式携带 `tab=all` 才会进入
 * 资源中心的「待整理」分区；桌面端继续沿用既有的 `/inbox` 地址。
 */
export function resolvePendingResourcesRoute(isMobile: boolean): RouteLocationRaw {
  return isMobile ? { path: '/inbox', query: { tab: 'all' } } : '/inbox';
}

export function resolveResourceRoute(resource: NavigableResource): RouteLocationRaw | null {
  const id = String(resource?.id || '');
  if (!id) return null;
  if (resource.type === 'note') return { path: `/noteLibrary/${id}` };
  if (resource.type === 'bookmark') return { path: `/manage/editBookmark/${id}` };
  if (resource.type === 'file') {
    const query: Record<string, string> = { fileId: id };
    if (resource.title) query.fileName = resource.title;
    return { path: '/cloudSpace', query };
  }
  return null;
}
