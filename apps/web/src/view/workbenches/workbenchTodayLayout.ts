/**
 * 工作台「今日待处理」卡片的收起状态，按账号记在内存里。
 *
 * 全站没有 keep-alive，路由切回工作台会重新挂载；首屏骨架期间沿用上次的判断，
 * 避免卡片先以三列出现、数据回来后又收起，造成第一屏来回跳动。
 */
const collapsedByOwner = new Map<string, boolean>();

export function readTodayCollapsed(owner: string): boolean {
  return collapsedByOwner.get(owner) ?? false;
}

export function rememberTodayCollapsed(owner: string, collapsed: boolean): void {
  collapsedByOwner.set(owner, collapsed);
}

/**
 * 有待处理时立即展开；清空后只在允许收起的时机（完整加载、回到前台）收起，
 * 处理完最后一条时先保留已清空的卡片，不在用户操作的区域里突然抽走。
 */
export function nextTodayCollapsed(current: boolean, hasActions: boolean, allowCollapse: boolean): boolean {
  if (hasActions) return false;
  return allowCollapse ? true : current;
}
