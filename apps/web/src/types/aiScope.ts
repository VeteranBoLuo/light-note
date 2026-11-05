
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
