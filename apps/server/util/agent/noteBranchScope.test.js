import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../resourceInbox.js', () => ({ removeInboxRelations: vi.fn() }));

const {
  MAX_AI_SCOPE_REFS,
  NoteBranchScopeError,
  buildNoteBranchRetrievalCoverage,
  resolveNoteBranchScopes,
} = await import('./noteBranchScope.js');

function treeDb(rows) {
  return { query: vi.fn().mockResolvedValue([rows]) };
}

describe('noteBranchScope', () => {
  it('只按当前 owner 的权威树解析根页面与全部后代', async () => {
    const db = treeDb([
      { id: 'root', parent_id: null, title: '轻笺项目', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'child-a', parent_id: 'root', title: '移动端', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'child-b', parent_id: 'root', title: 'AI', sort: 1, is_top: 0, del_flag: 0 },
      { id: 'leaf', parent_id: 'child-a', title: '全局搜索', sort: 0, is_top: 0, del_flag: 0 },
    ]);

    const result = await resolveNoteBranchScopes({
      userId: 'owner-1',
      scopeRefs: [{ type: 'note_branch', id: 'root', title: '客户端伪造标题' }],
      db,
    });

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE create_by = ? AND del_flag = 0'), ['owner-1']);
    expect(result.refs).toEqual([
      {
        type: 'note_branch',
        id: 'root',
        title: '轻笺项目',
        estimatedResourceCount: 4,
      },
    ]);
    expect(new Set(result.noteIds)).toEqual(new Set(['root', 'child-a', 'child-b', 'leaf']));
    expect(result.resourceIds).toEqual(result.noteIds.map((id) => ({ type: 'note', id })));
  });

  it('目录移动后仍按稳定根 ID 和当前父子关系解析', async () => {
    const db = treeDb([
      { id: 'new-parent', parent_id: null, title: '新位置', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'root', parent_id: 'new-parent', title: '项目', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'child', parent_id: 'root', title: '子页', sort: 0, is_top: 0, del_flag: 0 },
    ]);
    const result = await resolveNoteBranchScopes({
      userId: 'owner-1',
      scopeRefs: [{ type: 'note_branch', id: 'root' }],
      db,
    });
    expect(result.noteIds).toEqual(['root', 'child']);
  });

  it('删除、跨账号或不存在的根 ID 失败关闭，不退化成全库检索', async () => {
    const db = treeDb([{ id: 'owned', parent_id: null, title: '我的页面', sort: 0, is_top: 0, del_flag: 0 }]);
    await expect(
      resolveNoteBranchScopes({
        userId: 'owner-1',
        scopeRefs: [{ type: 'note_branch', id: 'foreign-or-deleted' }],
        db,
      }),
    ).rejects.toMatchObject({ code: 'AI_NOTE_BRANCH_NOT_FOUND', status: 404 });
  });

  it('拒绝未知 scope 类型与超量范围', async () => {
    await expect(
      resolveNoteBranchScopes({ userId: 'owner-1', scopeRefs: [{ type: 'tag_scope', id: 'tag-1' }], db: treeDb([]) }),
    ).rejects.toBeInstanceOf(NoteBranchScopeError);
    await expect(
      resolveNoteBranchScopes({
        userId: 'owner-1',
        scopeRefs: Array.from({ length: MAX_AI_SCOPE_REFS + 1 }, (_, index) => ({
          type: 'note_branch',
          id: `root-${index}`,
        })),
        db: treeDb([]),
      }),
    ).rejects.toMatchObject({ code: 'AI_SCOPE_REFS_LIMIT_EXCEEDED' });
  });

  it('检索覆盖只统计真实引用到的范围内笔记，不冒充完整分析', () => {
    const coverage = buildNoteBranchRetrievalCoverage(
      {
        branches: [
          { id: 'root', title: '项目', totalPages: 3, noteIds: ['root', 'a', 'b'] },
        ],
      },
      [
        { type: 'note', id: 'a' },
        { resourceType: 'note', resourceId: 'outside' },
      ],
    );
    expect(coverage).toEqual([
      {
        mode: 'retrieval',
        rootId: 'root',
        title: '项目',
        totalPages: 3,
        matchedPages: 1,
        completeAnalysis: false,
      },
    ]);
  });
});
