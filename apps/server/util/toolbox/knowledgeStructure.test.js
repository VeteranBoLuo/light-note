import { describe, expect, it, vi } from 'vitest';
import { analyzeKnowledgeStructure, getToolboxKnowledgeOverview } from './knowledgeStructure.js';

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
