import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: { query: vi.fn() } }));

const {
  MAX_NOTE_TREE_DEPTH,
  assertValidNoteParentFromSnapshot,
  buildNoteTree,
  getNoteTreeChildren,
  moveOwnedNoteNode,
  prepareOwnedNotePlacement,
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

function createTreeConnection(treeRows) {
  return {
    query: vi.fn(async (sql) => {
      if (String(sql).includes('SELECT id, parent_id')) return [treeRows];
      return [{ affectedRows: 1 }];
    }),
  };
}

describe('noteTreeService 写入落点与移动', () => {
  it('创建页面时在事务连接上锁定 owner 树，并追加到目标普通兄弟组末尾', async () => {
    const connection = createTreeConnection([
      { id: 'parent', parent_id: null, title: '父页面', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'pinned', parent_id: 'parent', title: '置顶', sort: 9, is_top: 1, del_flag: 0 },
      { id: 'child-a', parent_id: 'parent', title: '子 A', sort: 2, is_top: 0, del_flag: 0 },
      { id: 'child-b', parent_id: 'parent', title: '子 B', sort: 5, is_top: 0, del_flag: 0 },
    ]);

    await expect(prepareOwnedNotePlacement(connection, { userId: 'u1', parentId: 'parent' })).resolves.toEqual({
      parentId: 'parent',
      sort: 6,
      depth: 2,
    });
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), ['u1']);
  });

  it('同父页面排序只重排该父层、同置顶分组', async () => {
    const connection = createTreeConnection([
      { id: 'pinned', parent_id: null, title: '置顶', sort: 0, is_top: 1, del_flag: 0 },
      { id: 'a', parent_id: null, title: 'A', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'b', parent_id: null, title: 'B', sort: 1, is_top: 0, del_flag: 0 },
      { id: 'c', parent_id: null, title: 'C', sort: 2, is_top: 0, del_flag: 0 },
      { id: 'nested', parent_id: 'a', title: '嵌套', sort: 0, is_top: 0, del_flag: 0 },
    ]);

    const result = await moveOwnedNoteNode(connection, {
      userId: 'u1',
      id: 'a',
      previousId: 'b',
      nextId: 'c',
    });

    expect(result).toMatchObject({ id: 'a', parentId: null, previousParentId: null, moved: true, updatedCount: 2 });
    const updateCalls = connection.query.mock.calls.slice(1);
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]).toEqual([
      expect.stringContaining('SET parent_id = ?'),
      [null, 1, 'a', 'u1'],
    ]);
    expect(updateCalls[1]).toEqual([
      expect.stringContaining('parent_id <=> ?'),
      [0, 'b', 'u1', null],
    ]);
    expect(updateCalls.some(([, params]) => params?.includes('pinned') || params?.includes('nested'))).toBe(false);
  });

  it('跨父页面移动时收口原兄弟间隙，并按目标锚点插入', async () => {
    const connection = createTreeConnection([
      { id: 'a', parent_id: null, title: 'A', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'moved', parent_id: null, title: '待移动', sort: 1, is_top: 0, del_flag: 0 },
      { id: 'target', parent_id: null, title: '目标', sort: 2, is_top: 0, del_flag: 0 },
      { id: 'x', parent_id: 'target', title: 'X', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'y', parent_id: 'target', title: 'Y', sort: 1, is_top: 0, del_flag: 0 },
    ]);

    const result = await moveOwnedNoteNode(connection, {
      userId: 'u1',
      id: 'moved',
      parentId: 'target',
      previousId: 'x',
      nextId: 'y',
    });

    expect(result).toMatchObject({ parentId: 'target', previousParentId: null, moved: true, updatedCount: 3 });
    expect(connection.query.mock.calls.slice(1)).toEqual([
      [expect.stringContaining('parent_id <=> ?'), [1, 'target', 'u1', null]],
      [expect.stringContaining('SET parent_id = ?'), ['target', 1, 'moved', 'u1']],
      [expect.stringContaining('parent_id <=> ?'), [2, 'y', 'u1', 'target']],
    ]);
  });

  it('拒绝跨父层、跨置顶组或过期锚点', async () => {
    const connection = createTreeConnection([
      { id: 'target', parent_id: null, title: '目标', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'moved', parent_id: null, title: '待移动', sort: 1, is_top: 0, del_flag: 0 },
      { id: 'nested', parent_id: 'target', title: '目标子页面', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'pinned', parent_id: 'target', title: '目标置顶页面', sort: 0, is_top: 1, del_flag: 0 },
    ]);

    await expect(
      moveOwnedNoteNode(connection, {
        userId: 'u1',
        id: 'moved',
        parentId: 'target',
        previousId: 'pinned',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SORT_ANCHOR', status: 409 });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it('移动父页面时拒绝自己的后代作为目标，且不产生更新', async () => {
    const connection = createTreeConnection([
      { id: 'parent', parent_id: null, title: '父页面', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'child', parent_id: 'parent', title: '子页面', sort: 0, is_top: 0, del_flag: 0 },
    ]);

    await expect(
      moveOwnedNoteNode(connection, { userId: 'u1', id: 'parent', parentId: 'child' }),
    ).rejects.toMatchObject({ code: 'NOTE_TREE_CYCLE', status: 409 });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });
});
