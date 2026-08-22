export interface AiToolStatusItem {
  name: string;
  status: 'running' | 'success' | 'error' | 'confirmation_required' | 'interaction_required';
  round?: number;
}

/**
 * 同一工具可在恢复轮再次执行。用户可见终态只取该工具最新一轮；否则一次已经被
 * 后续成功恢复的旧 error 会永久显示成“未完成”，与最终真实结果自相矛盾。
 */
export function latestAiToolStatusItems(items: AiToolStatusItem[] = []) {
  const latestByName = new Map<string, AiToolStatusItem>();
  for (const item of items) {
    const current = latestByName.get(item.name);
    if (!current || Number(item.round || 1) >= Number(current.round || 1)) latestByName.set(item.name, item);
  }
  return [...latestByName.values()];
}
