interface RouteViewKeyInput {
  name?: string | symbol | null;
  params?: Record<string, unknown>;
}

// 新建笔记首次保存只是在同一份编辑内容上补齐真实 ID，不应重建编辑器。
// 其他笔记 ID 之间必须使用不同 key，彻底隔离编辑器、自动保存队列和异步回调。
let promotedDraftId: string | null = null;

export function markNoteDraftPromoted(id: string | null): void {
  promotedDraftId = id;
}

export function getMainRouteViewKey(route: RouteViewKeyInput): string {
  if (String(route.name || '') !== 'noteDetail') return 'main-route-view';
  const rawId = route.params?.id;
  const noteId = Array.isArray(rawId) ? rawId.join('/') : String(rawId || '');
  if (noteId === 'add' || (promotedDraftId !== null && noteId === promotedDraftId)) return 'note-detail:add';
  return `note-detail:${noteId}`;
}
