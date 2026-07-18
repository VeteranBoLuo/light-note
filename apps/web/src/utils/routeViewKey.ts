interface RouteViewKeyInput {
  name?: string | symbol | null;
  params?: Record<string, unknown>;
}

/**
 * 笔记详情包含编辑器、目录和自动保存等有状态子树。
 * Vue Router 在同一路由只变更参数时会复用组件，因此笔记 ID 变化必须更换 key，
 * 让整棵详情子树按新笔记重新初始化；其他页面保持稳定 key，避免查询参数变化误重建。
 */
export function getMainRouteViewKey(route: RouteViewKeyInput): string {
  if (String(route.name || '') !== 'noteDetail') return 'main-route-view';
  const rawId = route.params?.id;
  const noteId = Array.isArray(rawId) ? rawId.join('/') : String(rawId || '');
  return `note-detail:${noteId}`;
}
