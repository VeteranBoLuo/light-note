import { searchPersonalKnowledge } from '../../personalKnowledgeSearch.js';

function coverageWarning(coverage) {
  if (!coverage || typeof coverage !== 'object') return '';
  if (coverage.truncated || coverage.complete === false || Number(coverage.coverageRatio) < 1) {
    const ratio = Number(coverage.coverageRatio);
    return Number.isFinite(ratio) ? `覆盖约 ${Math.round(ratio * 100)}%，内容不完整` : '来源覆盖不完整';
  }
  return '';
}

export default {
  name: 'search_content',
  sourceType: 'mixed',
  description:
    '在用户明确选择的范围或个人知识中检索真实正文片段，覆盖笔记、书签快照、已解析文件/OCR 和待办。' +
    '适合回答“我保存的资料里怎么说”、跨资料查找和比较；返回精确 evidenceRef、定位和覆盖度。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      keyword: { type: 'string', minLength: 1, maxLength: 500, description: '从用户问题中提炼的检索主题' },
      limit: { type: 'integer', minimum: 1, maximum: 20, description: '返回证据片段数，默认 8' },
      resourceTypes: {
        type: 'array',
        maxItems: 4,
        items: { type: 'string', enum: ['note', 'bookmark', 'file', 'todo'] },
        description: '可选的材料类型范围',
      },
      resourceIds: {
        type: 'array',
        maxItems: 500,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { type: { type: 'string', enum: ['note', 'bookmark', 'file', 'todo'] }, id: { type: 'string' } },
          required: ['type', 'id'],
        },
        description: '用户已选择的具体材料范围；存在时不得检索范围外资源',
      },
    },
    required: ['keyword'],
  },
  requireRoot: false,
  allowedRoles: ['visitor', 'user', 'test', 'root'],
  riskLevel: 'low',
  confirmationPolicy: 'none',
  timeoutMs: 12_000,
  resultBudget: 10_000,
  toSources(raw) {
    return (raw?.hits || []).map((hit) => ({
      id: hit.sourceId,
      sourceId: hit.sourceId,
      evidenceRef: hit.evidenceRef,
      citationKey: hit.citationKey,
      type: hit.type,
      resourceType: hit.type,
      resourceId: hit.id,
      title: hit.title,
      excerpt: hit.excerpt,
      locator: hit.locator,
      target: hit.target,
      resourceVersion: hit.resourceVersion,
      coverage: hit.coverage,
    }));
  },
  async execute(args, ctx) {
    // selected 模式仅在确有已选材料时收窄到材料;未选材料则不收窄(null),按全库检索,避免空 allowlist 变成零结果。
    const enforcedScope =
      ctx.agentContentScope?.mode === 'selected' && ctx.agentContentScope.resourceIds?.length
        ? ctx.agentContentScope.resourceIds
        : null;
    return searchPersonalKnowledge({
      userId: ctx.userId,
      query: args.keyword,
      limit: args.limit,
      scope: {
        types: args.resourceTypes,
        resourceIds: enforcedScope === null ? args.resourceIds : enforcedScope,
      },
    });
  },
  transform(raw) {
    const hits = raw?.hits || [];
    if (!hits.length) return `没有在当前材料范围中找到与“${raw?.query || ''}”相关的可靠片段。`;
    const lines = hits.map((hit) => {
      const location = hit.locator?.value ? ` · ${hit.locator.value}` : '';
      const warning = coverageWarning(hit.coverage);
      return `[${hit.citationKey}] [evidence:${hit.evidenceRef}]《${hit.title}》${location}${warning ? ` · ⚠ ${warning}` : ''}\n${hit.excerpt}`;
    });
    return (
      `已从 ${new Set(hits.map((hit) => hit.sourceId)).size} 个实际来源检索到 ${hits.length} 条证据。` +
      '回答中的可验证事实只能引用下列 evidenceRef；若证据不足，必须明确说明。\n\n' +
      lines.join('\n\n')
    );
  },
  summarize(raw) {
    const hits = raw?.hits || [];
    const incomplete = hits.filter((hit) => coverageWarning(hit.coverage)).length;
    return `个人知识检索：${hits.length} 条证据${incomplete ? `，${incomplete} 条覆盖不完整` : ''}`;
  },
};
