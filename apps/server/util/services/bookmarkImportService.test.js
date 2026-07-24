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

const { importBookmarksWithTags } = await import('./bookmarkImportService.js');

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
    expect(stats).toEqual({
      parsedTotal: 3,
      createdTags: 1,
      createdBookmarks: 1,
      boundRelations: 4,
      skippedInvalidUrls: 1,
    });
  });
});
