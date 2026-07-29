import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: { getConnection: vi.fn(), query: vi.fn() },
  ensureNotVisitor: vi.fn(() => true),
  removeInboxRelations: vi.fn(),
  invalidatePersonalKnowledgeCache: vi.fn(() => Promise.resolve()),
  cleanupBookmarkIconFiles: vi.fn(() => Promise.resolve()),
}));

vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  formatDateTime: vi.fn(),
}));
vi.mock('../util/fileCategory.js', () => ({ resolveFileCategory: vi.fn() }));
vi.mock('../util/resourceTags.js', () => ({
  normalizeTagIds: vi.fn(),
  validateUserTags: vi.fn(),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: mocks.ensureNotVisitor }));
vi.mock('../util/resourceInbox.js', () => ({ removeInboxRelations: mocks.removeInboxRelations }));
vi.mock('../util/personalKnowledgeSearch.js', () => ({
  invalidatePersonalKnowledgeCache: mocks.invalidatePersonalKnowledgeCache,
}));
vi.mock('../util/bookmarkIconService.js', () => ({
  cleanupBookmarkIconFiles: mocks.cleanupBookmarkIconFiles,
}));

const { batchDeleteResources, globalSearch } = await import('./searchHandle.js');

function createResponse() {
  return { send: vi.fn() };
}

function createConnection() {
  return {
    beginTransaction: vi.fn(),
    query: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
}

describe('batchDeleteResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureNotVisitor.mockReturnValue(true);
    mocks.removeInboxRelations.mockResolvedValue(0);
    mocks.invalidatePersonalKnowledgeCache.mockResolvedValue({ skipped: true });
    mocks.cleanupBookmarkIconFiles.mockResolvedValue({ deleted: 0 });
  });

  it('上百个书签合并为一笔集合更新和一次待整理清理', async () => {
    const ids = Array.from({ length: 120 }, (_, index) => `bookmark-${index + 1}`);
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([ids.map((id) => ({ id }))])
      .mockResolvedValueOnce([ids.map((id) => ({ id, iconUrl: `/uploads/${id}.png` }))])
      .mockResolvedValueOnce([{ affectedRows: ids.length }]);
    mocks.pool.getConnection.mockResolvedValue(connection);
    const res = createResponse();

    await batchDeleteResources(
      { user: { id: 'user-1' }, body: { items: ids.map((id) => ({ id, type: 'bookmark' })) } },
      res,
    );

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.query.mock.calls[0][0]).toContain('SELECT id FROM bookmark');
    expect(connection.query.mock.calls[1][0]).toContain('SELECT id, icon_url AS iconUrl');
    expect(connection.query.mock.calls[2][0]).toContain('UPDATE bookmark SET del_flag = 1');
    expect(mocks.removeInboxRelations).toHaveBeenCalledWith(connection, {
      userId: 'user-1',
      items: ids.map((id) => ({ resourceType: 'bookmark', resourceId: id })),
    });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(mocks.cleanupBookmarkIconFiles).toHaveBeenCalledWith(
      ids.map((id) => ({ id, iconUrl: `/uploads/${id}.png` })),
      { db: connection },
    );
    expect(mocks.invalidatePersonalKnowledgeCache).toHaveBeenCalledOnce();
    expect(res.send).toHaveBeenCalledWith({
      data: {
        requestedItemCount: ids.length,
        validItemCount: ids.length,
        invalidItemCount: 0,
        affectedItemCount: ids.length,
        typeStats: [
          {
            type: 'bookmark',
            requestedCount: ids.length,
            validCount: ids.length,
            affectedItemCount: ids.length,
          },
        ],
      },
      status: 200,
      msg: '',
    });
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('拒绝超过单次上限的请求，避免占用数据库连接', async () => {
    const res = createResponse();
    const items = Array.from({ length: 1001 }, (_, index) => ({ id: `bookmark-${index}`, type: 'bookmark' }));

    await batchDeleteResources({ user: { id: 'user-1' }, body: { items } }, res);

    expect(mocks.pool.getConnection).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({ data: null, status: 400, msg: '单次最多删除 1000 项资源' });
  });
});

describe('globalSearch pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('SELECT name') && normalizedSql.includes('FROM tag')) {
        return [[{ name: '工作' }, { name: '稍后读' }]];
      }
      if (normalizedSql.includes('COUNT(*) AS total FROM bookmark')) return [[{ total: 30 }]];
      if (normalizedSql.includes('COUNT(*) AS total FROM note')) return [[{ total: 7 }]];
      if (normalizedSql.includes('COUNT(*) AS total FROM files')) return [[{ total: 5 }]];
      if (normalizedSql.includes('COUNT(*) AS total FROM tag')) return [[{ total: 2 }]];
      if (normalizedSql.includes('FROM bookmark b')) {
        return [
          [
            {
              id: 'bookmark-13',
              name: '项目资料',
              description: '项目描述',
              url: 'https://example.com',
              tag_list: [{ id: 'tag-1', name: '工作' }],
            },
          ],
        ];
      }
      return [[]];
    });
  });

  it('按类型和筛选条件统计总数，只返回请求页并暴露后续页状态', async () => {
    const res = createResponse();

    await globalSearch(
      {
        user: { id: 'user-1' },
        body: {
          keyword: '项目',
          page: 2,
          limitPerType: 12,
          type: 'bookmark',
          sort: 'name',
          date: '7d',
          tags: ['工作'],
        },
        headers: { 'x-lang': 'zh-CN' },
      },
      res,
    );

    const bookmarkListCall = mocks.pool.query.mock.calls.find(
      ([sql]) => String(sql).includes('FROM bookmark b') && String(sql).includes('LIMIT ? OFFSET ?'),
    );
    expect(bookmarkListCall).toBeTruthy();
    expect(bookmarkListCall[0]).toContain('b.create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
    expect(bookmarkListCall[0]).toContain('selected_tag.name IN (?)');
    expect(bookmarkListCall[1].slice(-2)).toEqual([12, 12]);

    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload.status).toBe(200);
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]).toMatchObject({ id: 'bookmark-13', type: 'bookmark' });
    expect(payload.data.typeTotals).toEqual({ bookmark: 30, note: 7, file: 5, tag: 2 });
    expect(payload.data.total).toBe(44);
    expect(payload.data.page).toBe(2);
    expect(payload.data.pageSize).toBe(12);
    expect(payload.data.hasMoreByType).toEqual({
      bookmark: true,
      note: false,
      file: false,
      tag: false,
    });
    expect(payload.data.hasMore).toBe(true);
    expect(payload.data.tagOptions).toEqual(['工作', '稍后读']);
  });
});
