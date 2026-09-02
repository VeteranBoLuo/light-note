import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getToolboxKnowledgeOverview: vi.fn() }));

vi.mock('../toolbox/knowledgeStructure.js', () => ({
  ORGANIZE_KNOWLEDGE_ISSUE_KINDS: ['invalid_parent', 'empty', 'duplicate_title', 'untitled', 'deep'],
  getToolboxKnowledgeOverview: mocks.getToolboxKnowledgeOverview,
}));

const { getOrganizeKnowledgeStructureSummary, listOrganizeKnowledgeStructureIssues } =
  await import('./knowledgeStructureOrganizeService.js');

function overview(items = []) {
  return {
    scannedAt: '2026-09-02T08:00:00.000Z',
    summary: { healthScore: 95, total: 86, roots: 71, maxDepth: 2, tagged: 55 },
    issueCounts: { empty: 1, invalid_parent: 1, untagged: 31 },
    issues: items,
    selectedIssueTotal: 2,
    selectedAffectedNoteCount: 2,
    selectedSeverityCounts: { high: 2, medium: 0, low: 0 },
  };
}

describe('knowledgeStructureOrganizeService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('摘要只返回整理中心需要的结构问题，不携带整棵知识树', async () => {
    mocks.getToolboxKnowledgeOverview.mockResolvedValue(
      overview([{ kind: 'empty', severity: 'high', noteId: 'n1', title: '空笔记', path: '空笔记', reason: '空' }]),
    );

    const result = await getOrganizeKnowledgeStructureSummary({ userId: 'u1' });

    expect(result).toMatchObject({ healthScore: 99, totalNotes: 86, affectedNoteCount: 2, priorityIssueCount: 2 });
    expect(result.issueCounts).toEqual([
      { kind: 'invalid_parent', count: 1 },
      { kind: 'empty', count: 1 },
      { kind: 'duplicate_title', count: 0 },
      { kind: 'untitled', count: 0 },
      { kind: 'deep', count: 0 },
    ]);
    expect(result).not.toHaveProperty('nodes');
    expect(mocks.getToolboxKnowledgeOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        analysisOptions: expect.objectContaining({ includeNodes: false, issueLimit: 3 }),
      }),
    );
  });

  it('问题列表使用不透明游标分页并允许按结构问题筛选', async () => {
    mocks.getToolboxKnowledgeOverview
      .mockResolvedValueOnce(
        overview([
          { kind: 'empty', noteId: 'n1' },
          { kind: 'empty', noteId: 'n2' },
          { kind: 'empty', noteId: 'n3' },
        ]),
      )
      .mockResolvedValueOnce(overview([{ kind: 'empty', noteId: 'n3' }]));

    const first = await listOrganizeKnowledgeStructureIssues({ userId: 'u1', limit: 2, kind: 'empty' });
    const second = await listOrganizeKnowledgeStructureIssues({
      userId: 'u1',
      limit: 2,
      kind: 'empty',
      cursor: first.nextCursor,
    });

    expect(first.items.map((item) => item.noteId)).toEqual(['n1', 'n2']);
    expect(first.hasMore).toBe(true);
    expect(second.items.map((item) => item.noteId)).toEqual(['n3']);
    expect(mocks.getToolboxKnowledgeOverview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        analysisOptions: expect.objectContaining({ issueKinds: ['empty'], issueOffset: 2, issueLimit: 3 }),
      }),
    );
  });

  it('拒绝未知筛选类型和伪造游标', async () => {
    await expect(listOrganizeKnowledgeStructureIssues({ userId: 'u1', kind: 'untagged' })).rejects.toMatchObject({
      code: 'ORGANIZE_KNOWLEDGE_KIND_INVALID',
      status: 400,
    });
    await expect(listOrganizeKnowledgeStructureIssues({ userId: 'u1', cursor: 'bad' })).rejects.toMatchObject({
      code: 'ORGANIZE_KNOWLEDGE_CURSOR_INVALID',
      status: 400,
    });
  });
});
