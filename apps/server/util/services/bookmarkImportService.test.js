import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertData: vi.fn(),
  insertResourceTagRelations: vi.fn(),
  inspectBookmarkUrl: vi.fn(),
}));

vi.mock('../agent/data.js', () => ({ insertData: mocks.insertData }));
vi.mock('../resourceTags.js', () => ({
  RESOURCE_TYPE: { BOOKMARK: 'bookmark' },
  insertResourceTagRelations: mocks.insertResourceTagRelations,
}));
vi.mock('../bookmarkUrl.js', () => ({ inspectBookmarkUrl: mocks.inspectBookmarkUrl }));

const { importBookmarksWithTags, runBookmarkImportTransaction } = await import('./bookmarkImportService.js');

function createConnection() {
  return { query: vi.fn() };
}

describe('importBookmarksWithTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspectBookmarkUrl.mockImplementation((value) => {
      const url = String(value || '').trim();
      return { canonicalUrl: url === 'invalid-url' ? '' : url };
    });
    mocks.insertData.mockImplementation((item) => ({
      ...item,
      id: item.url ? 'bookmark-new' : 'tag-new',
      user_id: item.userId,
    }));
    mocks.insertResourceTagRelations.mockResolvedValue(2);
  });

  it('复用已有及同批新增标签、按网址复用书签，并只补缺失关联', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[{ id: 'tag-ai', name: 'AI' }]])
      .mockResolvedValueOnce([[{ id: 'bookmark-existing', name: '已有书签', url: 'https://old.example' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const stats = await importBookmarksWithTags(connection, {
      userId: 'user-1',
      items: [
        {
          name: '同网址的新标题',
          url: 'https://old.example',
          tagNames: ['AI', '工具', 'AI'],
        },
        {
          name: '新的书签',
          url: 'https://new.example',
          description: '新描述',
          tagNames: ['AI', '工具'],
        },
        { name: '无效书签', url: 'invalid-url', tagNames: ['忽略'] },
      ],
    });

    expect(connection.query).toHaveBeenCalledTimes(4);
    expect(connection.query.mock.calls[2][0]).toBe('INSERT INTO tag SET ?');
    expect(connection.query.mock.calls[3][0]).toBe('INSERT INTO bookmark SET ?');
    expect(connection.query.mock.calls[3][1][0].url_exact_hash).toBeInstanceOf(Buffer);
    expect(connection.query.mock.calls[3][1][0].url_exact_hash).toHaveLength(32);
    expect(mocks.insertData).toHaveBeenCalledTimes(2);
    expect(mocks.insertResourceTagRelations).toHaveBeenNthCalledWith(1, connection, {
      tagIds: ['tag-ai', 'tag-new'],
      resourceType: 'bookmark',
      resourceId: 'bookmark-existing',
      userId: 'user-1',
      source: 'import',
    });
    expect(mocks.insertResourceTagRelations).toHaveBeenNthCalledWith(2, connection, {
      tagIds: ['tag-ai', 'tag-new'],
      resourceType: 'bookmark',
      resourceId: 'bookmark-new',
      userId: 'user-1',
      source: 'import',
    });
    expect(stats).toMatchObject({
      parsedTotal: 3,
      createdTags: 1,
      createdBookmarks: 1,
      boundRelations: 4,
      skippedInvalidUrls: 1,
    });
    expect(Array.isArray(stats.createdBookmarkIds)).toBe(true);
    expect(Array.isArray(stats.affectedBookmarkIds)).toBe(true);
  });

  it('重复导入同一书签只写首次关联，仍保留逐条 affected IDs 和新增标签关联', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([
        [
          { id: 'tag-a', name: 'A' },
          { id: 'tag-b', name: 'B' },
        ],
      ])
      .mockResolvedValueOnce([[{ id: 'bookmark-existing', name: 'Existing', url: 'https://same.example' }]]);
    mocks.insertResourceTagRelations.mockImplementation(async (_connection, { tagIds }) => tagIds.length);
    const stats = await importBookmarksWithTags(connection, {
      userId: 'user-1',
      items: [
        { url: 'https://same.example', tagNames: ['A'] },
        { url: 'https://same.example', tagNames: ['A', 'B'] },
        { url: 'https://same.example', tagNames: ['B', 'A'] },
      ],
    });
    expect(stats.boundRelations).toBe(2);
    expect(stats.affectedBookmarkIds).toEqual(Array(3).fill('bookmark-existing'));
    expect(mocks.insertResourceTagRelations.mock.calls.map(([, options]) => options.tagIds)).toEqual([
      ['tag-a'],
      ['tag-b'],
      [],
    ]);
    expect(connection.query).toHaveBeenCalledTimes(2);
  });

  it('首次关联失败立即抛出，由导入事务回滚，后续重复项不能吞掉错误', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[{ id: 'tag-a', name: 'A' }]])
      .mockResolvedValueOnce([[{ id: 'bookmark-existing', name: 'Existing', url: 'https://same.example' }]]);
    mocks.insertResourceTagRelations.mockRejectedValueOnce(new Error('relation failed'));
    await expect(
      importBookmarksWithTags(connection, {
        userId: 'user-1',
        items: Array(2).fill({ url: 'https://same.example', tagNames: ['A'] }),
      }),
    ).rejects.toThrow('relation failed');
    expect(mocks.insertResourceTagRelations).toHaveBeenCalledTimes(1);
  });

  it('事务提交后把 stats 返回给 Excel/HTML 导入后续批次创建逻辑', async () => {
    const stats = {
      parsedTotal: 1,
      createdTags: 0,
      createdBookmarks: 1,
      boundRelations: 0,
      skippedInvalidUrls: 0,
      createdBookmarkIds: ['bookmark-new'],
      affectedBookmarkIds: ['bookmark-new'],
    };
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    const dbPool = {
      getConnection: vi.fn().mockResolvedValue(connection),
    };
    const importFn = vi.fn().mockResolvedValue(stats);

    await expect(
      runBookmarkImportTransaction(dbPool, {
        userId: 'user-1',
        items: [{ name: '站点', url: 'https://example.com' }],
        importFn,
      }),
    ).resolves.toBe(stats);

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(importFn).toHaveBeenCalledWith(connection, {
      userId: 'user-1',
      items: [{ name: '站点', url: 'https://example.com' }],
      overwriteDescriptions: false,
    });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('Excel 同网址的重复行只更新最后一条非空描述，并按已有书签去重计数', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 'existing', name: '原名称', url: 'https://same.example' }]])
      .mockResolvedValue([{ affectedRows: 1 }]);
    const stats = await importBookmarksWithTags(connection, {
      userId: 'user-1',
      overwriteDescriptions: true,
      items: [
        { url: 'https://same.example', description: '第一条' },
        { url: 'https://same.example', description: ' 最后一条 ' },
        { url: 'https://same.example', description: '  ' },
      ],
    });
    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.query.mock.calls[2][1]).toEqual([
      '最后一条',
      'existing',
      'user-1',
      'https://same.example',
      '最后一条',
    ]);
    expect(stats.updatedBookmarks).toBe(1);
    expect(stats.createdBookmarks).toBe(0);
  });

  it.each([false, true])('HTML 模式或空白描述均不写入已有描述（覆盖开关 %s）', async (overwriteDescriptions) => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 'existing', name: '原名称', url: 'https://same.example' }]]);
    const stats = await importBookmarksWithTags(connection, {
      userId: 'user-1',
      overwriteDescriptions,
      items: [{ url: 'https://same.example', description: overwriteDescriptions ? ' \n ' : '文件描述' }],
    });
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(stats.updatedBookmarks).toBe(0);
  });

  it('同名不同网址不会写入描述，也不能把新网址登记为已有书签的网址别名', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 'existing', name: '同名', url: 'https://old.example' }]])
      .mockResolvedValue([{ affectedRows: 1 }]);
    const stats = await importBookmarksWithTags(connection, {
      userId: 'user-1',
      overwriteDescriptions: true,
      items: [
        { name: '同名', url: 'https://different.example', description: '不应覆盖' },
        { name: '新名称', url: 'https://different.example', description: '应新建' },
      ],
    });
    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.query.mock.calls[2][0]).toBe('INSERT INTO bookmark SET ?');
    expect(stats).toMatchObject({ createdBookmarks: 1, updatedBookmarks: 0 });
  });
});
