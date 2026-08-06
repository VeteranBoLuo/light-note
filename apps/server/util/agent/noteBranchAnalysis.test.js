import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: {} }));

const {
  NOTE_BRANCH_ANALYSIS_MAX_CHARS,
  NOTE_BRANCH_ANALYSIS_MAX_PAGES,
  analyzeNoteBranches,
  classifyNoteBranchAnalysisIntent,
  shouldClassifyNoteBranchAnalysis,
} = await import('./noteBranchAnalysis.js');

function toolResponse(name, args) {
  return {
    content: '',
    toolCalls: [
      {
        id: `${name}-call`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    usageStatus: 'reported',
    finishReason: 'tool_calls',
  };
}

function scope(ids, title = '轻笺项目') {
  return {
    noteIds: ids,
    branches: [
      {
        id: ids[0],
        title,
        totalPages: ids.length,
        noteIds: ids,
      },
    ],
  };
}

function dbRows(rows) {
  return { query: vi.fn().mockResolvedValue([rows]) };
}

function successfulAnalysisRequest() {
  return vi.fn(async (messages, options) => {
    const toolName = options.tools[0].function.name;
    if (toolName === 'submit_note_branch_page_summaries') {
      const payload = JSON.parse(messages[1].content);
      return toolResponse(toolName, {
        pages: payload.pageUnits.map((unit) => ({
          unitId: unit.unitId,
          pageId: unit.pageId,
          summary: `${unit.title} 的忠实摘要`,
          themes: ['移动端'],
          decisions: ['保留底部抽屉'],
          todos: [],
          risks: [],
        })),
      });
    }
    if (toolName === 'submit_note_branch_analysis') {
      return toolResponse(toolName, {
        answer: '## 主要主题\n移动端导航。\n\n## 重复、冲突与待办\n未发现没有依据的冲突。',
      });
    }
    throw new Error(`unexpected tool ${toolName}`);
  });
}

describe('noteBranchAnalysis', () => {
  it('只在明确要求覆盖整个目录时进入受约束语义分类', async () => {
    expect(shouldClassifyNoteBranchAnalysis('之前关于移动端搜索的结论是什么？')).toBe(false);
    expect(shouldClassifyNoteBranchAnalysis('总结这里所有模块、重复决策和未完成事项')).toBe(true);

    const request = vi.fn().mockResolvedValue(
      toolResponse('classify_note_branch_analysis', { decision: 'full_branch_analysis' }),
    );
    await expect(
      classifyNoteBranchAnalysisIntent({
        message: '总结这里所有模块、重复决策和未完成事项',
        branches: [{ title: '项目', totalPages: 18 }],
        request,
      }),
    ).resolves.toEqual({ decision: 'full_branch_analysis', classified: true });
    expect(request.mock.calls[0][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'classify_note_branch_analysis' } },
      temperature: 0,
    });

    const skippedRequest = vi.fn();
    await expect(
      classifyNoteBranchAnalysisIntent({
        message: '之前的结论是什么？',
        branches: [{ title: '项目', totalPages: 18 }],
        request: skippedRequest,
      }),
    ).resolves.toEqual({ decision: 'scoped_retrieval', classified: false });
    expect(skippedRequest).not.toHaveBeenCalled();
  });

  it('超过 30 页时不读正文、不调用 Provider，并明确要求缩小范围', async () => {
    const ids = Array.from({ length: NOTE_BRANCH_ANALYSIS_MAX_PAGES + 1 }, (_, index) => `note-${index}`);
    const db = dbRows([]);
    const request = vi.fn();
    const result = await analyzeNoteBranches({
      userId: 'owner-1',
      resolvedScopes: scope(ids),
      instruction: '完整分析',
      db,
      request,
    });

    expect(result.status).toBe('limited');
    expect(result.answer).toContain('页面总数：31 · 已完整覆盖：0 · 未读取：31');
    expect(result.answer).toContain('超过同步完整分析的 30 页上限');
    expect(result.coverage[0]).toMatchObject({
      mode: 'analysis',
      totalPages: 31,
      analyzedPages: 0,
      unreadPages: 31,
      completeAnalysis: false,
      limitationCode: 'PAGE_LIMIT',
    });
    expect(db.query).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('正文超过 12 万字符时只做权威计数，不把截断内容送给 Provider', async () => {
    const db = dbRows([
      {
        id: 'root',
        title: '超长页面',
        content: 'x'.repeat(NOTE_BRANCH_ANALYSIS_MAX_CHARS + 1),
        type: 'markdown',
      },
    ]);
    const request = vi.fn();
    const result = await analyzeNoteBranches({
      userId: 'owner-1',
      resolvedScopes: scope(['root']),
      instruction: '完整分析',
      db,
      request,
    });

    expect(result.status).toBe('limited');
    expect(result.answer).toContain('120,000 字符上限');
    expect(result.coverage[0].limitationCode).toBe('CHAR_LIMIT');
    expect(request).not.toHaveBeenCalled();
  });

  it('分批 Map/Reduce 后按实际页面形成来源与完整覆盖，额外数据库行不能越界', async () => {
    const ids = ['root', 'child-a', 'child-b'];
    const db = dbRows([
      { id: 'child-b', title: 'AI', content: '# AI\n可靠性', type: 'markdown', update_time: 'v3' },
      { id: 'outside', title: '范围外', content: '绝不能进入', type: 'markdown', update_time: 'v4' },
      { id: 'root', title: '项目', content: '# 项目\n总览', type: 'markdown', update_time: 'v1' },
      { id: 'child-a', title: '移动端', content: '# 移动端\n底部抽屉', type: 'markdown', update_time: 'v2' },
    ]);
    const request = successfulAnalysisRequest();
    const responses = [];
    const result = await analyzeNoteBranches({
      userId: 'owner-1',
      resolvedScopes: scope(ids),
      instruction: '总结所有模块、重复决策和未完成事项',
      db,
      request,
      onResponse: (response) => responses.push(response),
    });

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('create_by = ? AND del_flag = 0'), [
      'owner-1',
      ...ids,
    ]);
    expect(result.status).toBe('complete');
    expect(result.answer).toContain('页面总数：3 · 已完整覆盖：3 · 未读取：0');
    expect(result.answer).toContain('## 主要主题');
    expect(result.sources.map((item) => item.id)).toEqual(ids);
    expect(result.sources.map((item) => item.id)).not.toContain('outside');
    expect(result.coverage[0]).toMatchObject({
      totalPages: 3,
      analyzedPages: 3,
      unreadPages: 0,
      completeAnalysis: true,
      limited: false,
    });
    expect(responses.length).toBeGreaterThanOrEqual(2);
  });

  it('部分 Map 批次失败时保留成功页面，但覆盖必须诚实标记未读页面', async () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const rows = ids.map((id) => ({
      id,
      title: id,
      content: `${id}\n${'内容'.repeat(3000)}`,
      type: 'markdown',
    }));
    const baseRequest = successfulAnalysisRequest();
    const request = vi.fn(async (messages, options) => {
      const toolName = options.tools[0].function.name;
      if (toolName === 'submit_note_branch_page_summaries') {
        const payload = JSON.parse(messages[1].content);
        if (payload.pageUnits.some((unit) => unit.pageId === 'p5')) {
          const error = new Error('provider unavailable');
          error.code = 'AI_PROVIDER_ERROR';
          throw error;
        }
      }
      return baseRequest(messages, options);
    });
    const result = await analyzeNoteBranches({
      userId: 'owner-1',
      resolvedScopes: scope(ids),
      instruction: '完整分析所有页面',
      db: dbRows(rows),
      request,
    });

    expect(result.status).toBe('partial');
    expect(result.answer).toContain('页面总数：5 · 已完整覆盖：4 · 未读取：1');
    expect(result.sources).toHaveLength(4);
    expect(result.coverage[0]).toMatchObject({
      analyzedPages: 4,
      unreadPages: 1,
      completeAnalysis: false,
      limited: true,
      limitationCode: 'PROVIDER_PARTIAL',
    });
  });
});
