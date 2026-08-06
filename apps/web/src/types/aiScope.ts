import type { GlobalSearchType } from '@/api/search';

/** 单个可直接引用的 AI 材料。 */
export interface AiResourceContext {
  type: GlobalSearchType;
  id: string;
  title: string;
}

/**
 * AI 检索范围与单个材料保持独立协议。
 * tag_scope 为后续兼容位，当前客户端只创建 note_branch。
 */
export interface AiScopeRef {
  type: 'note_branch' | 'tag_scope';
  id: string;
  title: string;
  estimatedResourceCount?: number;
}

export const MAX_AI_SCOPE_REFS = 3;

export function aiScopeRefKey(value: Pick<AiScopeRef, 'type' | 'id'>) {
  return `${value.type}:${value.id}`;
}
