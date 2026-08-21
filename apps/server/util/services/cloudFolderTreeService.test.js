import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: {} }));
const softDeleteOwnedCloudFiles = vi.hoisted(() => vi.fn());
vi.mock('./cloudFileDeletionService.js', () => ({ softDeleteOwnedCloudFiles }));

const {
  clearOwnedCloudFolderFiles,
  createOwnedCloudFolder,
  decorateCloudFolderRows,
  deleteEmptyOwnedCloudFolder,
  deleteOwnedCloudFolderTree,
  listOwnedCloudFolders,
  moveOwnedCloudFolder,
  reorderOwnedCloudFolders,
  renameOwnedCloudFolder,
} = await import('./cloudFolderTreeService.js');

function database(query) {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query,
  };
  return { connection, getConnection: vi.fn().mockResolvedValue(connection) };
}

function mutationDatabase(rows, tail = []) {
  return database(
    vi
      .fn()
      .mockResolvedValueOnce([[{ id: 'user-1' }]])
      .mockResolvedValueOnce([rows])
      .mockImplementation(() => Promise.resolve(tail.shift() || [{ affectedRows: 1 }])),
  );
}

describe('cloudFolderTreeService', () => {
  it('把扁平目录装饰为稳定层级、路径与子级计数', () => {
    const result = decorateCloudFolderRows([
      { id: 1, name: '工作', parent_id: null, sort: 0 },
      { id: 2, name: '2026', parent_id: 1, sort: 0 },
      { id: 3, name: '周报', parent_id: 2, sort: 0, direct_file_count: 4 },
    ]);

    expect(result).toEqual([
      expect.objectContaining({ id: '1', parent_id: null, depth: 1, full_path: '工作', child_count: 1 }),
      expect.objectContaining({ id: '2', parent_id: '1', depth: 2, full_path: '工作 / 2026', child_count: 1 }),
      expect.objectContaining({
        id: '3',
        parent_id: '2',
        depth: 3,
        full_path: '工作 / 2026 / 周报',
        direct_file_count: 4,
      }),
    ]);
  });

  it('目录出现孤儿或循环时失败关闭，不把损坏关系伪装成一级目录', () => {
    expect(() => decorateCloudFolderRows([{ id: 1, name: '孤儿', parent_id: 99 }])).toThrow(/FOLDER_TREE_CORRUPT/);
    expect(() =>
      decorateCloudFolderRows([
        { id: 1, name: 'A', parent_id: 2 },
        { id: 2, name: 'B', parent_id: 1 },
      ]),
    ).toThrow(/FOLDER_TREE_CORRUPT/);
  });

  it('目录快照同时返回不受当前目录和筛选影响的全部文件总数', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [{ id: 1, name: '工作', parent_id: null, sort: 0, child_count: 0, direct_file_count: 2 }],
      ])
      .mockResolvedValueOnce([[{ all_file_count: 7 }]]);

    await expect(listOwnedCloudFolders({ userId: 'user-1', database: { query } })).resolves.toMatchObject({
      total: 1,
      allFileCount: 7,
      items: [expect.objectContaining({ id: '1', direct_file_count: 2 })],
    });
    expect(query.mock.calls[1][0]).toContain('WHERE create_by = ? AND del_flag = 0');
  });

  it('可以在指定父级创建子文件夹，并用账号行锁串行化同账号写入', async () => {
    const db = mutationDatabase([{ id: 1, name: '工作', parent_id: null, sort: 0 }], [[{ insertId: 8 }]]);

    await expect(
      createOwnedCloudFolder({ userId: 'user-1', name: ' 周报 ', parentId: 1, database: db }),
    ).resolves.toEqual({ id: '8', name: '周报', parentId: '1', depth: 2 });
    expect(db.connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(db.connection.query.mock.calls[2]).toEqual([
      'INSERT INTO folders SET ?',
      [{ name: '周报', create_by: 'user-1', parent_id: 1, del_flag: 0, sort: 0 }],
    ]);
    expect(db.connection.commit).toHaveBeenCalledOnce();
  });

  it('同层名称按用户可见语义查重，不同父级允许同名', async () => {
    const conflictDb = mutationDatabase([
      { id: 1, name: '工作', parent_id: null, sort: 0 },
      { id: 2, name: '周报', parent_id: 1, sort: 0 },
    ]);
    await expect(
      createOwnedCloudFolder({ userId: 'user-1', name: '周报', parentId: 1, database: conflictDb }),
    ).rejects.toThrow(/FOLDER_NAME_CONFLICT/);
    expect(conflictDb.connection.rollback).toHaveBeenCalledOnce();

    const allowedDb = mutationDatabase(
      [
        { id: 1, name: '工作', parent_id: null, sort: 0 },
        { id: 2, name: '生活', parent_id: null, sort: 1 },
        { id: 3, name: '周报', parent_id: 1, sort: 0 },
      ],
      [[{ insertId: 9 }]],
    );
    await expect(
      createOwnedCloudFolder({ userId: 'user-1', name: '周报', parentId: 2, database: allowedDb }),
    ).resolves.toMatchObject({ id: '9', parentId: '2' });
  });

  it('重命名只检查当前层级', async () => {
    const db = mutationDatabase([
      { id: 1, name: '工作', parent_id: null, sort: 0 },
      { id: 2, name: '周报', parent_id: 1, sort: 0 },
    ]);
    await expect(renameOwnedCloudFolder({ userId: 'user-1', id: 2, name: '月报', database: db })).resolves.toEqual({
      id: '2',
      name: '月报',
    });
    expect(db.connection.query.mock.calls[2][0]).toContain('UPDATE folders SET name');
  });

  it('拒绝移动到自身或后代，并校验整棵子树移动后的最大深度', async () => {
    const rows = [
      { id: 1, name: 'A', parent_id: null, sort: 0 },
      { id: 2, name: 'B', parent_id: 1, sort: 0 },
      { id: 3, name: 'C', parent_id: 2, sort: 0 },
    ];
    const cycleDb = mutationDatabase(rows);
    await expect(moveOwnedCloudFolder({ userId: 'user-1', id: 1, parentId: 3, database: cycleDb })).rejects.toThrow(
      /FOLDER_CYCLE/,
    );

    const deepRows = Array.from({ length: 7 }, (_, index) => ({
      id: index + 10,
      name: String(index + 10),
      parent_id: index === 0 ? null : index + 9,
      sort: 0,
    }));
    deepRows.push(
      { id: 1, name: '来源', parent_id: null, sort: 1 },
      { id: 2, name: '来源子级', parent_id: 1, sort: 0 },
    );
    const depthDb = mutationDatabase(deepRows);
    await expect(moveOwnedCloudFolder({ userId: 'user-1', id: 1, parentId: 16, database: depthDb })).rejects.toThrow(
      /FOLDER_DEPTH_EXCEEDED/,
    );
  });

  it('移动到新父级时写入父级并规范化该层末尾排序', async () => {
    const db = mutationDatabase([
      { id: 1, name: 'A', parent_id: null, sort: 0 },
      { id: 2, name: 'B', parent_id: null, sort: 1 },
      { id: 3, name: 'C', parent_id: 2, sort: 4 },
    ]);
    await expect(moveOwnedCloudFolder({ userId: 'user-1', id: 1, parentId: 2, database: db })).resolves.toEqual({
      id: '1',
      parentId: '2',
      moved: true,
    });
    expect(db.connection.query.mock.calls.slice(2).map((call) => call[1])).toEqual([
      [2, 0, 3, 'user-1'],
      [2, 1, 1, 'user-1'],
    ]);
  });

  it('跨父级移动可以按目标兄弟锚点直接插入前后位置', async () => {
    const rows = [
      { id: 1, name: '外部', parent_id: null, sort: 0 },
      { id: 2, name: '项目', parent_id: null, sort: 1 },
      { id: 3, name: '一月', parent_id: 2, sort: 0 },
      { id: 4, name: '二月', parent_id: 2, sort: 1 },
    ];
    const intoChildGroupDb = mutationDatabase(rows);
    await expect(
      moveOwnedCloudFolder({
        userId: 'user-1',
        id: 1,
        parentId: 2,
        anchorId: 4,
        position: 'before',
        database: intoChildGroupDb,
      }),
    ).resolves.toEqual({ id: '1', parentId: '2', moved: true });
    expect(intoChildGroupDb.connection.query.mock.calls.slice(2).map((call) => call[1])).toEqual([
      [2, 0, 3, 'user-1'],
      [2, 1, 1, 'user-1'],
      [2, 2, 4, 'user-1'],
    ]);

    const backToTopLevelDb = mutationDatabase(rows);
    await expect(
      moveOwnedCloudFolder({
        userId: 'user-1',
        id: 3,
        parentId: null,
        anchorId: 2,
        position: 'before',
        database: backToTopLevelDb,
      }),
    ).resolves.toEqual({ id: '3', parentId: null, moved: true });
    expect(backToTopLevelDb.connection.query.mock.calls.slice(2).map((call) => call[1])).toEqual([
      [null, 0, 1, 'user-1'],
      [null, 1, 3, 'user-1'],
      [null, 2, 2, 'user-1'],
    ]);
  });

  it('跨父级排序锚点必须属于声明的目标层级', async () => {
    const db = mutationDatabase([
      { id: 1, name: 'A', parent_id: null, sort: 0 },
      { id: 2, name: 'B', parent_id: null, sort: 1 },
      { id: 3, name: 'C', parent_id: 2, sort: 0 },
    ]);
    await expect(
      moveOwnedCloudFolder({
        userId: 'user-1',
        id: 1,
        parentId: 2,
        anchorId: 2,
        position: 'before',
        database: db,
      }),
    ).rejects.toThrow(/FOLDER_MOVE_POSITION_INVALID/);
  });

  it('同父级也由移动接口按锚点原子重排', async () => {
    const db = mutationDatabase([
      { id: 1, name: 'A', parent_id: null, sort: 0 },
      { id: 2, name: 'B', parent_id: null, sort: 1 },
      { id: 3, name: 'C', parent_id: null, sort: 2 },
    ]);
    await expect(
      moveOwnedCloudFolder({
        userId: 'user-1',
        id: 3,
        parentId: null,
        anchorId: 1,
        position: 'before',
        database: db,
      }),
    ).resolves.toEqual({ id: '3', parentId: null, moved: true });
    expect(db.connection.query.mock.calls.slice(2).map((call) => call[1])).toEqual([
      [null, 0, 3, 'user-1'],
      [null, 1, 1, 'user-1'],
      [null, 2, 2, 'user-1'],
    ]);
  });

  it('只接受同一层级的完整排序', async () => {
    const rows = [
      { id: 1, name: 'A', parent_id: null, sort: 0 },
      { id: 2, name: 'B', parent_id: null, sort: 1 },
      { id: 3, name: 'C', parent_id: 1, sort: 0 },
    ];
    const db = mutationDatabase(rows);
    await expect(
      reorderOwnedCloudFolders({ userId: 'user-1', parentId: null, items: [{ id: 2 }, { id: 1 }], database: db }),
    ).resolves.toEqual({ parentId: null, items: ['2', '1'] });
    expect(db.connection.query.mock.calls.slice(2).map((call) => call[1]?.[1])).toEqual(['2', '1']);

    const invalidDb = mutationDatabase(rows);
    await expect(
      reorderOwnedCloudFolders({
        userId: 'user-1',
        parentId: null,
        items: [{ id: 1 }, { id: 3 }],
        database: invalidDb,
      }),
    ).rejects.toThrow(/FOLDER_SORT_INVALID/);
  });

  it('仅删除没有子文件夹和文件的空目录', async () => {
    const childDb = mutationDatabase([
      { id: 1, name: 'A', parent_id: null, sort: 0 },
      { id: 2, name: 'B', parent_id: 1, sort: 0 },
    ]);
    await expect(deleteEmptyOwnedCloudFolder({ userId: 'user-1', id: 1, database: childDb })).rejects.toThrow(
      /FOLDER_NOT_EMPTY/,
    );

    const fileDb = mutationDatabase([{ id: 1, name: 'A', parent_id: null, sort: 0 }], [[[{ id: 9 }]]]);
    await expect(deleteEmptyOwnedCloudFolder({ userId: 'user-1', id: 1, database: fileDb })).rejects.toThrow(
      /FOLDER_NOT_EMPTY/,
    );

    const emptyDb = mutationDatabase([{ id: 1, name: 'A', parent_id: null, sort: 0 }], [[[]], [{ affectedRows: 1 }]]);
    await expect(deleteEmptyOwnedCloudFolder({ userId: 'user-1', id: 1, database: emptyDb })).resolves.toEqual({
      id: '1',
    });
  });

  it('明确确认后删除整棵子目录，并把其中文件移回未分类', async () => {
    const db = mutationDatabase(
      [
        { id: 1, name: 'A', parent_id: null, sort: 0 },
        { id: 2, name: 'B', parent_id: 1, sort: 0 },
        { id: 3, name: 'C', parent_id: 2, sort: 0 },
        { id: 4, name: 'D', parent_id: null, sort: 1 },
      ],
      [[{ affectedRows: 5 }], [{ affectedRows: 3 }]],
    );

    await expect(deleteOwnedCloudFolderTree({ userId: 'user-1', id: 1, database: db })).resolves.toEqual({
      id: '1',
      deletedFolderIds: ['1', '2', '3'],
      movedFileCount: 5,
    });
    expect(db.connection.query.mock.calls[2]).toEqual([expect.stringContaining('UPDATE files'), ['user-1', 1, 2, 3]]);
    expect(db.connection.query.mock.calls[3]).toEqual([
      expect.stringContaining('DELETE FROM folders'),
      ['user-1', 1, 2, 3],
    ]);
  });

  it('递归删除数量与锁定快照不一致时回滚', async () => {
    const db = mutationDatabase(
      [
        { id: 1, name: 'A', parent_id: null, sort: 0 },
        { id: 2, name: 'B', parent_id: 1, sort: 0 },
      ],
      [[{ affectedRows: 0 }], [{ affectedRows: 1 }]],
    );
    await expect(deleteOwnedCloudFolderTree({ userId: 'user-1', id: 1, database: db })).rejects.toThrow(
      /FOLDER_DELETE_CONFLICT/,
    );
    expect(db.connection.rollback).toHaveBeenCalledOnce();
  });

  it('清空目录时会锁定整棵子树内的文件并复用软删除链路，默认保留文件夹', async () => {
    softDeleteOwnedCloudFiles.mockResolvedValueOnce({ fileIds: [9, 10], deletedFileCount: 2 });
    const db = mutationDatabase(
      [
        { id: 1, name: 'A', parent_id: null, sort: 0 },
        { id: 2, name: 'B', parent_id: 1, sort: 0 },
        { id: 3, name: 'C', parent_id: null, sort: 1 },
      ],
      [[[{ id: 9 }, { id: 10 }]]],
    );

    await expect(clearOwnedCloudFolderFiles({ userId: 'user-1', id: 1, database: db })).resolves.toEqual({
      id: '1',
      deletedFileCount: 2,
      deletedFolderCount: 0,
      deleteFolders: false,
    });
    expect(db.connection.query.mock.calls[2]).toEqual([expect.stringContaining('FOR UPDATE'), ['user-1', 1, 2]]);
    expect(softDeleteOwnedCloudFiles).toHaveBeenCalledWith(db.connection, {
      userId: 'user-1',
      fileIds: [9, 10],
    });
    expect(db.connection.query).toHaveBeenCalledTimes(3);
  });

  it('勾选后清空文件并删除目录树，回收站文件解除目录归属', async () => {
    softDeleteOwnedCloudFiles.mockResolvedValueOnce({ fileIds: [9], deletedFileCount: 1 });
    const db = mutationDatabase(
      [
        { id: 1, name: 'A', parent_id: null, sort: 0 },
        { id: 2, name: 'B', parent_id: 1, sort: 0 },
      ],
      [[[{ id: 9 }]], [{ affectedRows: 4 }], [{ affectedRows: 2 }]],
    );

    await expect(
      clearOwnedCloudFolderFiles({ userId: 'user-1', id: 1, deleteFolders: true, database: db }),
    ).resolves.toEqual({
      id: '1',
      deletedFileCount: 1,
      deletedFolderCount: 2,
      deleteFolders: true,
    });
    expect(db.connection.query.mock.calls[3]).toEqual([
      expect.stringContaining('SET folder_id = NULL'),
      ['user-1', 1, 2],
    ]);
    expect(db.connection.query.mock.calls[4]).toEqual([
      expect.stringContaining('DELETE FROM folders'),
      ['user-1', 1, 2],
    ]);
  });

  it('目录文件快照与软删除数量不一致时回滚，不继续删除文件夹', async () => {
    softDeleteOwnedCloudFiles.mockResolvedValueOnce({ fileIds: [9], deletedFileCount: 0 });
    const db = mutationDatabase([{ id: 1, name: 'A', parent_id: null, sort: 0 }], [[[{ id: 9 }]]]);

    await expect(
      clearOwnedCloudFolderFiles({ userId: 'user-1', id: 1, deleteFolders: true, database: db }),
    ).rejects.toThrow(/FOLDER_CLEAR_CONFLICT/);
    expect(db.connection.rollback).toHaveBeenCalledOnce();
    expect(db.connection.query).toHaveBeenCalledTimes(3);
  });
});
