import type { RouteLocationRaw } from 'vue-router';

const RESOURCE_NAVIGATION_ORIGIN = 'https://light-note.local';

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

export interface ResourceNavigationOptions {
  noteReturnPath?: string;
}

/**
 * 待整理资源的标准入口。
 *
 * 待整理已经归入整理中心；桌面端和移动端统一使用同一个 canonical 地址。
 * 参数暂时保留，避免调用方为这次信息架构调整做无意义的端型分支。
 */
export function resolvePendingResourcesRoute(_isMobile: boolean): RouteLocationRaw {
  return { path: '/organize', query: { issue: 'pending' } };
}

/**
 * 从待办中的参考资料进入笔记时，保留可恢复的待办现场。
 *
 * 只有待办页会补充 todoId/focusRef；工作台等其他来源继续原样返回，避免跨页面篡改其查询语义。
 */
export function resolveTodoResourceReturnPath(
  currentFullPath: string,
  todoId: string,
  resource?: Pick<NavigableResource, 'type' | 'id'>,
): string {
  const source = String(currentFullPath || '').trim();
  const normalizedTodoId = String(todoId || '').trim();
  if (!source || !normalizedTodoId) return source;
  try {
    const parsed = new URL(source, RESOURCE_NAVIGATION_ORIGIN);
    if (parsed.origin !== RESOURCE_NAVIGATION_ORIGIN || parsed.pathname !== '/inbox') return source;
    parsed.searchParams.set('tab', 'todo');
    parsed.searchParams.set('todoId', normalizedTodoId);
    const resourceType = String(resource?.type || '').trim();
    const resourceId = String(resource?.id || '').trim();
    if (resourceType && resourceId) parsed.searchParams.set('focusRef', `${resourceType}:${resourceId}`);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return source;
  }
}

export function resolveResourceRoute(
  resource: NavigableResource,
  options: ResourceNavigationOptions = {},
): RouteLocationRaw | null {
  const id = String(resource?.id || '');
  if (!id) return null;
  if (resource.type === 'note') {
    const from = String(options.noteReturnPath || '').trim();
    return {
      path: `/noteLibrary/${id}`,
      ...(from ? { query: { from } } : {}),
    };
  }
  if (resource.type === 'bookmark') return { path: `/manage/editBookmark/${id}` };
  if (resource.type === 'file') {
    const query: Record<string, string> = { fileId: id };
    if (resource.title) query.fileName = resource.title;
    return { path: '/cloudSpace', query };
  }
  return null;
}
