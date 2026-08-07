interface RouteViewKeyInput {
  name?: string | symbol | null;
  params?: Record<string, unknown>;
}

export function getMainRouteViewKey(route: RouteViewKeyInput): string {
  // 笔记详情共用一个稳定工作区实例：同一路由切换 ID 时保留标题栏、页面树和 AI 面板，
  // 由 NoteDetail 自己保存旧笔记并只刷新编辑内容区，避免整页卸载产生白屏。
  if (String(route.name || '') === 'noteDetail') return 'note-detail-workspace';
  return 'main-route-view';
}
