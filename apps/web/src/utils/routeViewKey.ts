interface RouteViewKeyInput {
  name?: string | symbol | null;
  params?: Record<string, unknown>;
}

/**
 * 笔记详情包含编辑器、目录和自动保存等有状态子树。
 * Vue Router 在同一路由只变更参数时会复用组件，因此笔记 ID 变化必须更换 key，
 * 让整棵详情子树按新笔记重新初始化；其他页面保持稳定 key，避免查询参数变化误重建。
 *
 * 例外:新建笔记草稿首次保存(路由参数从 `add` 变成真实 id)属于「同一篇草稿被提升为已存」,
 * 不应重挂载整棵编辑器子树(否则会闪一下、丢失光标/滚动等编辑状态)。此时由 NoteDetail 登记该 id,
 * 让它与 `add` 沿用同一个 key;离开该笔记(组件卸载)时清除登记,恢复正常按 id 重建。
 */
let promotedDraftId: string | null = null;
export function markNoteDraftPromoted(id: string | null): void {
  promotedDraftId = id;
}

export function getMainRouteViewKey(route: RouteViewKeyInput): string {
  if (String(route.name || '') !== 'noteDetail') return 'main-route-view';
  const rawId = route.params?.id;
  const noteId = Array.isArray(rawId) ? rawId.join('/') : String(rawId || '');
  // `add` 与「刚从 add 提升的那个真实 id」共用同一 key,使草稿保存不触发整棵子树重挂载。
  if (noteId === 'add' || (promotedDraftId !== null && noteId === promotedDraftId)) return 'note-detail:add';
  return `note-detail:${noteId}`;
}
