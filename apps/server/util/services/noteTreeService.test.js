import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: { query: vi.fn() } }));

const {
  MAX_NOTE_TREE_DEPTH,
  assertValidNoteParentFromSnapshot,
  buildNoteTree,
  deleteOwnedNoteSubtrees,
  getNoteTreeChildren,
  moveOwnedNoteNode,
  moveOwnedNoteNodes,
  prepareOwnedNotePhysicalDelete,
  prepareOwnedNotePlacement,
  queryOwnedNoteTree,
  resolveOwnedNoteBreadcrumb,
  resolveOwnedNoteCreateTarget,
  resolveNoteBreadcrumbFromSnapshot,
  resolveNoteDepthFromSnapshot,
  resolveNoteDescendantIdsFromSnapshot,
  searchNoteTreeFromSnapshot,
  restoreOwnedNoteTrash,
} = await import('./noteTreeService.js');

const rows = [
  { id: 'root-b', parent_id: null, title: '根 B', sort: 1, is_top: 0, del_flag: 0 },
  { id: 'root-a', parent_id: null, title: '根 A', sort: 0, is_top: 0, del_flag: 0 },
  { id: 'child-a', parent_id: 'root-a', title: '子 A', type: 'markdown', sort: 0, is_top: 0, del_flag: 0 },
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

  it('单篇面包屑只沿目标父链做主键联结，不再扫描账号整棵笔记树', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([
        [
          {
            breadcrumb_0_id: 'grandchild',
            breadcrumb_0_title: '孙页面',
            breadcrumb_1_id: 'child-a',
            breadcrumb_1_title: '子 A',
            breadcrumb_2_id: 'root-a',
            breadcrumb_2_title: '根 A',
          },
        ],
      ]),
    };

    await expect(resolveOwnedNoteBreadcrumb({ userId: 'user-1', noteId: 'grandchild', db })).resolves.toEqual({
      items: [
        { id: 'root-a', title: '根 A' },
        { id: 'child-a', title: '子 A' },
        { id: 'grandchild', title: '孙页面' },
      ],
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('LEFT JOIN note breadcrumb_node_1');
    expect(sql).toContain('WHERE breadcrumb_node_0.id = ?');
    expect(sql).not.toContain('ORDER BY');
    expect(params).toEqual(['grandchild', 'user-1']);
  });

  it('定向父链读取历史循环时按根层孤儿语义降级', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([
        [
          {
            breadcrumb_0_id: 'descendant',
            breadcrumb_0_title: '环下页面',
            breadcrumb_1_id: 'cycle-a',
            breadcrumb_1_title: '环 A',
            breadcrumb_2_id: 'cycle-b',
            breadcrumb_2_title: '环 B',
            breadcrumb_3_id: 'cycle-a',
            breadcrumb_3_title: '环 A',
          },
        ],
      ]),
    };

    await expect(resolveOwnedNoteBreadcrumb({ userId: 'user-1', noteId: 'descendant', db })).resolves.toEqual({
      items: [
        { id: 'cycle-a', title: '环 A' },
        { id: 'descendant', title: '环下页面' },
      ],
    });
  });

  it('定向父链拒绝历史超深结构，避免返回被静默截断的面包屑', async () => {
    const joinedRow = {};
    for (let index = 0; index <= MAX_NOTE_TREE_DEPTH; index += 1) {
      joinedRow[`breadcrumb_${index}_id`] = `depth-${index + 1}`;
      joinedRow[`breadcrumb_${index}_title`] = `第 ${index + 1} 层`;
    }
    const db = { query: vi.fn().mockResolvedValue([[joinedRow]]) };

    await expect(resolveOwnedNoteBreadcrumb({ userId: 'user-1', noteId: 'depth-1', db })).rejects.toMatchObject({
      code: 'NOTE_TREE_DEPTH_EXCEEDED',
      status: 409,
    });
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
    expect(result.maxDepth).toBe(MAX_NOTE_TREE_DEPTH);
    expect(result.items[0]).toMatchObject({ id: 'child-top', childCount: 0, hasChildren: false });
    expect(result.items[1]).toMatchObject({ id: 'child-a', type: 'markdown', childCount: 1, hasChildren: true });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('title, type'), ['user-1']);
    expect(result.items[1].children).toEqual([expect.objectContaining({ id: 'grandchild', parentId: 'child-a' })]);

    const complete = await queryOwnedNoteTree({ userId: 'user-1', parentId: null, depth: 'all', db });
    expect(complete.maxDepth).toBe(MAX_NOTE_TREE_DEPTH);
    expect(complete.items[0].children).toBeDefined();
  });

  it('目录搜索只返回当前子树命中节点与完整祖先路径，不携带正文或范围外兄弟', async () => {
    const searchRows = [
      ...rows,
      { id: 'other-root', parent_id: null, title: '其他项目', sort: 2, is_top: 0, del_flag: 0 },
      { id: 'other-match', parent_id: 'other-root', title: '移动端设计', sort: 0, is_top: 0, del_flag: 0 },
    ];
    const snapshot = buildNoteTree(searchRows);
    expect(searchNoteTreeFromSnapshot(snapshot, '孙页面', { parentId: 'root-a' })).toEqual({
      keyword: '孙页面',
      matchCount: 1,
      items: [
        expect.objectContaining({
          id: 'root-a',
          matched: false,
          children: [
            expect.objectContaining({
              id: 'child-a',
              matched: false,
              children: [expect.objectContaining({ id: 'grandchild', matched: true })],
            }),
          ],
        }),
      ],
    });

    const db = { query: vi.fn().mockResolvedValue([searchRows]) };
    const result = await queryOwnedNoteTree({
      userId: 'user-1',
      parentId: 'root-a',
      depth: 1,
      keyword: '孙页面',
      db,
    });
    expect(result).toMatchObject({ parentId: 'root-a', keyword: '孙页面', matchCount: 1 });
    expect(result.items.map((item) => item.id)).toEqual(['root-a']);
    expect(db.query).toHaveBeenCalledWith(expect.not.stringContaining('content'), ['user-1']);
    expect(JSON.stringify(result)).not.toContain('other-match');
  });

  it('目录搜索大小写不敏感，并拒绝超长关键词', () => {
    const snapshot = buildNoteTree([{ id: 'root', parent_id: null, title: 'TypeScript Notes', del_flag: 0 }]);
    expect(searchNoteTreeFromSnapshot(snapshot, 'typescript')).toMatchObject({
      matchCount: 1,
      items: [expect.objectContaining({ id: 'root', matched: true })],
    });
    expect(() => searchNoteTreeFromSnapshot(snapshot, 'x'.repeat(121))).toThrowError(
      expect.objectContaining({ code: 'NOTE_TREE_SEARCH_TOO_LONG', status: 400 }),
    );
  });

  it('3000 个页面元数据构建召回完整且基准低于 100ms', () => {
    const largeTreeRows = Array.from({ length: 3000 }, (_, index) => ({
      id: `page-${index}`,
      parent_id: index === 0 ? null : `page-${Math.floor((index - 1) / 4)}`,
      title: `页面 ${index}`,
      sort: index % 4,
      is_top: 0,
      del_flag: 0,
      update_time: '2026-08-06T00:00:00.000Z',
    }));

    // 预热后取三次中的最佳值，隔离共享 CI 调度停顿；阈值衡量纯树构建能力，
    // 数据库 P95 由部署环境监控负责，不混进这条微基准。
    buildNoteTree(largeTreeRows);
    let bestDurationMs = Number.POSITIVE_INFINITY;
    let snapshot;
    for (let index = 0; index < 3; index += 1) {
      const startedAt = performance.now();
      snapshot = buildNoteTree(largeTreeRows);
      bestDurationMs = Math.min(bestDurationMs, performance.now() - startedAt);
    }

    expect(snapshot.nodesById.size).toBe(3000);
    expect(resolveNoteDescendantIdsFromSnapshot(snapshot, 'page-0')).toHaveLength(2999);
    expect(bestDurationMs).toBeLessThan(100);
  });

  it('新建目标预览复用 owner、面包屑和 8 层深度校验', async () => {
    const db = { query: vi.fn().mockResolvedValue([rows]) };
    await expect(resolveOwnedNoteCreateTarget({ userId: 'user-1', parentId: 'child-a', db })).resolves.toEqual({
      parentId: 'child-a',
      depth: 3,
      items: [
        { id: 'root-a', title: '根 A' },
        { id: 'child-a', title: '子 A' },
      ],
    });

    const deepRows = Array.from({ length: MAX_NOTE_TREE_DEPTH }, (_, index) => ({
      id: `depth-${index + 1}`,
      parent_id: index === 0 ? null : `depth-${index}`,
      title: `第 ${index + 1} 层`,
      del_flag: 0,
    }));
    const deepDb = { query: vi.fn().mockResolvedValue([deepRows]) };
    await expect(
      resolveOwnedNoteCreateTarget({
        userId: 'user-1',
        parentId: `depth-${MAX_NOTE_TREE_DEPTH}`,
        db: deepDb,
      }),
    ).rejects.toMatchObject({ code: 'NOTE_TREE_DEPTH_EXCEEDED', status: 409 });
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
    expect(updateCalls[0]).toEqual([expect.stringContaining('SET parent_id = ?'), [null, 0, 1, 'a', 'u1']]);
    expect(updateCalls[1]).toEqual([expect.stringContaining('parent_id <=> ?'), [0, 'b', 'u1', null]]);
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
      [expect.stringContaining('SET parent_id = ?'), ['target', 0, 1, 'moved', 'u1']],
      [expect.stringContaining('parent_id <=> ?'), [2, 'y', 'u1', 'target']],
    ]);
  });

  it('拖到置顶节点前时同步置顶，并分别收口两个分组的 sort', async () => {
    const connection = createTreeConnection([
      { id: 'pinned', parent_id: null, title: '置顶页面', sort: 0, is_top: 1, del_flag: 0 },
      { id: 'moved', parent_id: null, title: '待移动', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'normal', parent_id: null, title: '普通页面', sort: 1, is_top: 0, del_flag: 0 },
    ]);

    const result = await moveOwnedNoteNode(connection, {
      userId: 'u1',
      id: 'moved',
      nextId: 'pinned',
    });

    expect(result).toMatchObject({
      id: 'moved',
      parentId: null,
      previousParentId: null,
      isTop: true,
      moved: true,
      updatedCount: 3,
    });
    expect(connection.query.mock.calls.slice(1)).toEqual([
      [expect.stringContaining('parent_id <=> ?'), [0, 'normal', 'u1', null]],
      [expect.stringContaining('SET parent_id = ?'), [null, 1, 0, 'moved', 'u1']],
      [expect.stringContaining('parent_id <=> ?'), [1, 'pinned', 'u1', null]],
    ]);
  });

  it('置顶页面移入另一目录时自动取消旧父层的置顶状态', async () => {
    const connection = createTreeConnection([
      { id: 'target', parent_id: null, title: '目标目录', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'moved', parent_id: null, title: '待移动置顶页面', sort: 0, is_top: 1, del_flag: 0 },
      { id: 'child', parent_id: 'target', title: '已有子页面', sort: 0, is_top: 0, del_flag: 0 },
    ]);

    const result = await moveOwnedNoteNode(connection, {
      userId: 'u1',
      id: 'moved',
      parentId: 'target',
    });

    expect(result).toMatchObject({ parentId: 'target', previousParentId: null, isTop: false, moved: true });
    expect(connection.query.mock.calls.slice(1)).toEqual([
      [expect.stringContaining('SET parent_id = ?'), ['target', 0, 1, 'moved', 'u1']],
    ]);
  });

  it('拒绝跨父层、混用置顶分组或过期锚点', async () => {
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
        nextId: 'nested',
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

  it('批量移动会折叠父子重复选择，并在一个加锁快照中按选择顺序追加到目标目录', async () => {
    const connection = createTreeConnection([
      { id: 'source', parent_id: null, title: '来源', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'target', parent_id: null, title: '目标', sort: 1, is_top: 0, del_flag: 0 },
      { id: 'parent', parent_id: 'source', title: '父页面', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'child', parent_id: 'parent', title: '子页面', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'sibling', parent_id: 'source', title: '同级页面', sort: 1, is_top: 0, del_flag: 0 },
    ]);

    const result = await moveOwnedNoteNodes(connection, {
      userId: 'u1',
      ids: ['parent', 'child', 'sibling'],
      parentId: 'target',
    });

    expect(result).toMatchObject({
      requestedCount: 3,
      rootCount: 2,
      movedCount: 2,
      affectedCount: 3,
      parentId: 'target',
      items: [
        { id: 'parent', previousParentId: 'source', parentId: 'target', isTop: false, sort: 0, moved: true },
        { id: 'sibling', previousParentId: 'source', parentId: 'target', isTop: false, sort: 1, moved: true },
      ],
    });
    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.query.mock.calls.slice(1)).toEqual([
      [expect.stringContaining('SET parent_id = ?'), ['target', 0, 0, 'parent', 'u1']],
      [expect.stringContaining('SET parent_id = ?'), ['target', 0, 1, 'sibling', 'u1']],
    ]);
  });

  it('批量关联到新父页面时与单页移动一致，自动取消来源层的置顶状态', async () => {
    const connection = createTreeConnection([
      { id: 'target', parent_id: null, title: '目标目录', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'pinned', parent_id: null, title: '原置顶页面', sort: 0, is_top: 1, del_flag: 0 },
    ]);

    const result = await moveOwnedNoteNodes(connection, {
      userId: 'u1',
      ids: ['pinned'],
      parentId: 'target',
    });

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'pinned', parentId: 'target', previousParentId: null, isTop: false, moved: true }),
    ]);
    expect(connection.query.mock.calls.slice(1)).toEqual([
      [expect.stringContaining('SET parent_id = ?'), ['target', 0, 0, 'pinned', 'u1']],
    ]);
  });

  it('批量移动任一根节点到自己的后代时整体拒绝且不产生更新', async () => {
    const connection = createTreeConnection([
      { id: 'parent', parent_id: null, title: '父页面', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'child', parent_id: 'parent', title: '子页面', sort: 0, is_top: 0, del_flag: 0 },
      { id: 'other', parent_id: null, title: '其他页面', sort: 1, is_top: 0, del_flag: 0 },
    ]);

    await expect(
      moveOwnedNoteNodes(connection, { userId: 'u1', ids: ['parent', 'other'], parentId: 'child' }),
    ).rejects.toMatchObject({ code: 'NOTE_TREE_CYCLE', status: 409 });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });
});

describe('noteTreeService 子树删除、批次恢复与物理清理', () => {
  it('以权威后代数删除完整子树，并让父子页面共用一个恢复批次', async () => {
    const connection = {
      query: vi.fn(async (sql, params) => {
        const statement = String(sql);
        if (statement.includes('SELECT id, parent_id, title')) {
          return [
            [
              { id: 'parent', parent_id: null, title: '父页面', del_flag: 0 },
              { id: 'child', parent_id: 'parent', title: '子页面', del_flag: 0 },
              { id: 'grandchild', parent_id: 'child', title: '孙页面', del_flag: 0 },
            ],
          ];
        }
        if (statement.includes('SET del_flag = 1')) return [{ affectedRows: params.length - 2 }];
        if (statement.includes('DELETE FROM resource_inbox')) return [{ affectedRows: 0 }];
        return [{ affectedRows: 0 }];
      }),
    };

    const result = await deleteOwnedNoteSubtrees(connection, {
      userId: 'u1',
      items: [
        { id: 'parent', expectedDescendantCount: 2 },
        { id: 'child', expectedDescendantCount: 1 },
      ],
    });

    expect(result).toMatchObject({ requestedCount: 2, rootCount: 1, deletedCount: 3 });
    expect(result.items[0]).toMatchObject({ id: 'parent', descendantCount: 2, totalCount: 3 });
    const deleteCall = connection.query.mock.calls.find(([sql]) => String(sql).includes('SET del_flag = 1'));
    expect(deleteCall[1].slice(2)).toEqual(['parent', 'child', 'grandchild']);
    expect(deleteCall[1][0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('前端后代数量过期时返回 409，且不产生任何软删除', async () => {
    const connection = createTreeConnection([
      { id: 'parent', parent_id: null, title: '父页面', del_flag: 0 },
      { id: 'child', parent_id: 'parent', title: '子页面', del_flag: 0 },
    ]);

    await expect(
      deleteOwnedNoteSubtrees(connection, {
        userId: 'u1',
        items: [{ id: 'parent', expectedDescendantCount: 0 }],
      }),
    ).rejects.toMatchObject({
      code: 'NOTE_TREE_DELETE_CONFLICT',
      status: 409,
      details: { actualDescendantCount: 1, totalCount: 2 },
    });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it('恢复父页面时只恢复同一删除批次，不误恢复更早单删的子页面', async () => {
    const deletedRows = [
      { id: 'parent', parent_id: null, tree_delete_batch_id: 'batch-parent' },
      { id: 'current-child', parent_id: 'parent', tree_delete_batch_id: 'batch-parent' },
      { id: 'older-child', parent_id: 'parent', tree_delete_batch_id: 'batch-older' },
    ];
    const connection = {
      query: vi.fn(async (sql, params) => {
        const statement = String(sql);
        if (statement.includes('SELECT id, parent_id, title')) return [[]];
        if (statement.includes('tree_delete_batch_id IN')) {
          return [deletedRows.filter((row) => params.slice(1).includes(row.tree_delete_batch_id))];
        }
        if (statement.includes('SELECT id, parent_id, tree_delete_batch_id')) {
          return [deletedRows.filter((row) => params.slice(1).includes(row.id))];
        }
        if (statement.includes('SET del_flag = 0')) return [{ affectedRows: params.length - 1 }];
        return [{ affectedRows: 0 }];
      }),
    };

    const result = await restoreOwnedNoteTrash(connection, { userId: 'u1', ids: ['parent'] });

    expect(result).toMatchObject({ count: 2, batchCount: 1, rerootedCount: 0 });
    expect(result.ids).toEqual(['parent', 'current-child']);
    const restoreCall = connection.query.mock.calls.find(([sql]) => String(sql).includes('SET del_flag = 0'));
    expect(restoreCall[1]).toEqual(['u1', 'parent', 'current-child']);
    expect(restoreCall[1]).not.toContain('older-child');
  });

  it('物理删除父批次前只扩展同批次，并提升其他批次残留子页面', async () => {
    const deletedRows = [
      { id: 'parent', parent_id: null, tree_delete_batch_id: 'batch-parent' },
      { id: 'current-child', parent_id: 'parent', tree_delete_batch_id: 'batch-parent' },
      { id: 'older-child', parent_id: 'parent', tree_delete_batch_id: 'batch-older' },
    ];
    const connection = {
      query: vi.fn(async (sql, params) => {
        const statement = String(sql);
        if (statement.includes('SELECT id, parent_id, title')) return [[]];
        if (statement.includes('tree_delete_batch_id IN')) {
          return [deletedRows.filter((row) => params.slice(1).includes(row.tree_delete_batch_id))];
        }
        if (statement.includes('SELECT id, parent_id, tree_delete_batch_id')) {
          return [deletedRows.filter((row) => params.slice(1).includes(row.id))];
        }
        if (statement.includes('SET parent_id = NULL')) return [{ affectedRows: 1 }];
        return [{ affectedRows: 0 }];
      }),
    };

    const result = await prepareOwnedNotePhysicalDelete(connection, { userId: 'u1', ids: ['parent'] });

    expect(result).toEqual({ ids: ['parent', 'current-child'], expandedCount: 1, rerootedCount: 1 });
    expect(result.ids).not.toContain('older-child');
    const reparentCall = connection.query.mock.calls.find(([sql]) => String(sql).includes('SET parent_id = NULL'));
    expect(reparentCall[0]).toContain('id NOT IN');
    expect(reparentCall[1]).toEqual(['u1', 'parent', 'current-child', 'parent', 'current-child']);
  });
});
