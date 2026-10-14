import { describe, expect, it, vi } from 'vitest';
import {
  analyzeKnowledgeStructure,
  getToolboxKnowledgeOverview,
  parseKnowledgeOverviewQuery,
} from './knowledgeStructure.js';

const DAY = 24 * 60 * 60 * 1000;

describe('toolbox knowledge structure', () => {
  it('从笔记唯一事实源生成层级、问题和健康摘要', () => {
    const now = Date.UTC(2026, 7, 29);
    const result = analyzeKnowledgeStructure(
      [
        {
          id: 'root',
          parent_id: null,
          title: '开发文档',
          content_sample: '# 开发',
          content_length: 4,
          tag_count: 1,
          outgoing_reference_count: 1,
          update_time: new Date(now),
        },
        {
          id: 'a',
          parent_id: 'root',
          title: '部署',
          content_sample: '<p><br></p>',
          content_length: 11,
          tag_count: 0,
          update_time: new Date(now - 200 * DAY),
        },
        {
          id: 'b',
          parent_id: 'root',
          title: '部署',
          content_sample: '命令',
          content_length: 2,
          tag_count: 0,
          update_time: new Date(now),
        },
        {
          id: 'orphan',
          parent_id: 'missing',
          title: '孤立页',
          content_sample: '正文',
          content_length: 2,
          tag_count: 1,
          update_time: new Date(now),
        },
      ],
      { now },
    );
    expect(result.summary).toMatchObject({
      total: 4,
      roots: 2,
      empty: 1,
      stale: 1,
      invalidParents: 1,
      duplicateGroups: 1,
      duplicateNotes: 2,
    });
    expect(result.nodes.find((node) => node.id === 'a')).toMatchObject({ depth: 2, path: '开发文档 / 部署' });
    expect(result.issues.some((item) => item.kind === 'invalid_parent' && item.noteId === 'orphan')).toBe(true);
    expect(result.issues.some((item) => item.kind === 'unlinked')).toBe(false);
    expect(result.recommendations.some((item) => item.code === 'build_links')).toBe(false);
    expect(result.recommendations.map((item) => item.code)).toContain('resolve_duplicates');
  });

  it('查询只返回衍生结构，不把正文样本暴露给客户端', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 'n1',
            parent_id: null,
            title: '笔记',
            type: 'markdown',
            content_length: 4,
            content_empty: 0,
          },
        ],
      ]),
    };
    const result = await getToolboxKnowledgeOverview({ userId: 'u1', db });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE n.create_by = ?'), ['u1', 'u1', 'u1', 'u1']);
    const [query] = db.query.mock.calls[0];
    expect(query).toContain('AS content_empty');
    expect(query).not.toContain('AS content_sample');
    expect(query).not.toMatch(/^\s*n\.content(?:\s+AS\s+\w+)?\s*,?\s*$/gmu);
    expect(result.summary.empty).toBe(0);
    expect(result.nodes[0]).not.toHaveProperty('contentSample');
  });

  it('可为整理中心生成轻量、按问题类型分页的读模型', () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      id: `note-${index}`,
      parent_id: null,
      title: `笔记 ${index}`,
      content_empty: index < 3 ? 1 : 0,
      tag_count: 1,
    }));
    const result = analyzeKnowledgeStructure(rows, {
      issueKinds: ['empty'],
      issueOffset: 1,
      issueLimit: 1,
      includeNodes: false,
    });

    expect(result.nodes).toEqual([]);
    expect(result.selectedIssueTotal).toBe(3);
    expect(result.selectedAffectedNoteCount).toBe(3);
    expect(result.selectedSeverityCounts.high).toBe(3);
    expect(result.issues).toEqual([expect.objectContaining({ kind: 'empty', noteId: 'note-1' })]);
  });
});

it('目录范围使用真实子树，保留完整路径且不把容器当空笔记', () => {
  const rows = [
    { id: 'root', title: '根', content_empty: 1 },
    { id: 'dir', parent_id: 'root', title: '目录', content_empty: 1 },
    { id: 'leaf', parent_id: 'dir', title: '重复', content_empty: 1 },
    { id: 'other', title: '重复', content_empty: 0 },
  ];
  const result = analyzeKnowledgeStructure(rows, {
    rootId: 'dir',
    includeNodes: false,
    includeScopeOptions: true,
    issueKinds: ['empty', 'duplicate_title'],
  });
  expect(result.summary).toMatchObject({ total: 2, roots: 1, empty: 1, duplicateNotes: 0 });
  expect(result.issues).toEqual([expect.objectContaining({ noteId: 'leaf', path: '根 / 目录 / 重复' })]);
  expect(result.scopeOptions).toEqual(
    expect.arrayContaining([
      { id: 'root', path: '根' },
      { id: 'dir', path: '根 / 目录' },
    ]),
  );
  expect(() => analyzeKnowledgeStructure(rows, { rootId: 'someone-elses-note' })).toThrow();
});
it('分页参数限制在授权结构读取预算内，不接受数组或非整数', () => {
  expect(parseKnowledgeOverviewQuery({ issueKind: 'empty', rootId: 'dir', offset: '500', limit: '50' })).toMatchObject({
    rootId: 'dir',
    issueKinds: ['empty'],
    issueOffset: 500,
    issueLimit: 50,
  });
  for (const query of [
    { offset: '-1' },
    { limit: '501' },
    { limit: '0' },
    { rootId: ['a'] },
    { issueKind: 'unlinked' },
    { includeOptional: 'yes' },
  ])
    expect(() => parseKnowledgeOverviewQuery(query)).toThrow();
});
it('refuses to combine pages from different note snapshots', async () => {
  const rows = [{ id: 'n1', title: 'before', revision: 1, content_empty: 1 }];
  const db = { query: vi.fn().mockResolvedValue([rows]) };
  const first = await getToolboxKnowledgeOverview({ userId: 'u1', db, query: { limit: '1' } });
  rows[0].title = 'after';
  rows[0].revision = 2;
  await expect(
    getToolboxKnowledgeOverview({ userId: 'u1', db, query: { limit: '1', snapshot: first.snapshotVersion } }),
  ).rejects.toMatchObject({ code: 'TOOLBOX_KNOWLEDGE_CHANGED' });
});
