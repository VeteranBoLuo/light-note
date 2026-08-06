import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: { query: vi.fn() } }));

const {
  MAX_NOTE_TREE_DEPTH,
  assertValidNoteParentFromSnapshot,
  buildNoteTree,
  getNoteTreeChildren,
  queryOwnedNoteTree,
  resolveNoteBreadcrumbFromSnapshot,
  resolveNoteDepthFromSnapshot,
  resolveNoteDescendantIdsFromSnapshot,
} = await import('./noteTreeService.js');

const rows = [
  { id: 'root-b', parent_id: null, title: '根 B', sort: 1, is_top: 0, del_flag: 0 },
  { id: 'root-a', parent_id: null, title: '根 A', sort: 0, is_top: 0, del_flag: 0 },
  { id: 'child-a', parent_id: 'root-a', title: '子 A', sort: 0, is_top: 0, del_flag: 0 },
  { id: 'grandchild', parent_id: 'child-a', title: '孙页面', sort: 0, is_top: 0, del_flag: 0 },
  { id: 'child-top', parent_id: 'root-a', title: '置顶子页面', sort: 9, is_top: 1, del_flag: 0 },
];

describe('noteTreeService 只读树模型', () => {
  it('按父节点分组，并只在兄弟层级内应用置顶与 sort', () => {
    const snapshot = buildNoteTree(rows);
    expect(getNoteTreeChildren(snapshot, null).map((item) => item.id)).toEqual(['root-a', 'root-b']);
    expect(getNoteTreeChildren(snapshot, 'root-a').map((item) => item.id)).toEqual(['child-top', 'child-a']);
  });

  it('解析面包屑、深度和后代，不依赖 MySQL 8 递归 CTE', () => {
    const snapshot = buildNoteTree(rows);
    expect(resolveNoteBreadcrumbFromSnapshot(snapshot, 'grandchild')).toEqual([
      { id: 'root-a', title: '根 A' },
      { id: 'child-a', title: '子 A' },
      { id: 'grandchild', title: '孙页面' },
    ]);
    expect(resolveNoteDepthFromSnapshot(snapshot, 'grandchild')).toBe(3);
    expect(resolveNoteDescendantIdsFromSnapshot(snapshot, 'root-a')).toEqual(['child-top', 'child-a', 'grandchild']);
  });

  it('读取历史孤儿、自指和多节点循环时降级到根层并明确标记', () => {
    const snapshot = buildNoteTree([
      { id: 'orphan', parent_id: 'missing', title: '孤儿' },
      { id: 'self', parent_id: 'self', title: '自指' },
      { id: 'cycle-a', parent_id: 'cycle-b', title: '环 A' },
      { id: 'cycle-b', parent_id: 'cycle-a', title: '环 B' },
    ]);
    expect(snapshot.invalidParentIds).toEqual(new Set(['orphan', 'self', 'cycle-a', 'cycle-b']));
    expect(
      getNoteTreeChildren(snapshot, null)
        .map((item) => item.id)
        .sort(),
    ).toEqual(['cycle-a', 'cycle-b', 'orphan', 'self']);
  });

  it('拒绝移动到自己或后代', () => {
    const snapshot = buildNoteTree(rows);
    expect(() => assertValidNoteParentFromSnapshot(snapshot, { noteId: 'root-a', parentId: 'root-a' })).toThrowError(
      expect.objectContaining({ code: 'NOTE_TREE_CYCLE' }),
    );
    expect(() =>
      assertValidNoteParentFromSnapshot(snapshot, { noteId: 'root-a', parentId: 'grandchild' }),
    ).toThrowError(expect.objectContaining({ code: 'NOTE_TREE_CYCLE' }));
  });

  it('深度校验包含被移动子树的最大相对深度', () => {
    const deepRows = [];
    for (let index = 1; index <= MAX_NOTE_TREE_DEPTH - 2; index += 1) {
      deepRows.push({
        id: `n${index}`,
        parent_id: index === 1 ? null : `n${index - 1}`,
        title: `第 ${index} 层`,
      });
    }
    deepRows.push(
      { id: 'branch', parent_id: null, title: '待移动分支' },
      { id: 'branch-child', parent_id: 'branch', title: '分支子页面' },
      { id: 'branch-grandchild', parent_id: 'branch-child', title: '分支孙页面' },
    );
    const snapshot = buildNoteTree(deepRows);
    expect(() =>
      assertValidNoteParentFromSnapshot(snapshot, {
        noteId: 'branch',
        parentId: `n${MAX_NOTE_TREE_DEPTH - 2}`,
      }),
    ).toThrowError(expect.objectContaining({ code: 'NOTE_TREE_DEPTH_EXCEEDED' }));
    expect(assertValidNoteParentFromSnapshot(snapshot, { noteId: 'branch', parentId: null })).toMatchObject({
      resultingMaxDepth: 3,
    });
  });

  it('查询接口只读取轻量字段，并按 depth 返回有限层 children', async () => {
    const db = { query: vi.fn().mockResolvedValue([rows]) };
    const result = await queryOwnedNoteTree({ userId: 'user-1', parentId: 'root-a', depth: 2, db });
    expect(db.query).toHaveBeenCalledWith(expect.not.stringContaining('content'), ['user-1']);
    expect(result.items[0]).toMatchObject({ id: 'child-top', childCount: 0, hasChildren: false });
    expect(result.items[1]).toMatchObject({ id: 'child-a', childCount: 1, hasChildren: true });
    expect(result.items[1].children).toEqual([expect.objectContaining({ id: 'grandchild', parentId: 'child-a' })]);
  });
});
