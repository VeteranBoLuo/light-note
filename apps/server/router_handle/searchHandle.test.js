import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: { getConnection: vi.fn() },
  ensureNotVisitor: vi.fn(() => true),
  removeInboxRelations: vi.fn(),
  invalidatePersonalKnowledgeCache: vi.fn(() => Promise.resolve()),
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

const { batchDeleteResources } = await import('./searchHandle.js');

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
  });

  it('上百个书签合并为一笔集合更新和一次待整理清理', async () => {
    const ids = Array.from({ length: 120 }, (_, index) => `bookmark-${index + 1}`);
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([ids.map((id) => ({ id }))])
      .mockResolvedValueOnce([{ affectedRows: ids.length }]);
    mocks.pool.getConnection.mockResolvedValue(connection);
    const res = createResponse();

    await batchDeleteResources(
      { user: { id: 'user-1' }, body: { items: ids.map((id) => ({ id, type: 'bookmark' })) } },
      res,
    );

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.query.mock.calls[0][0]).toContain('SELECT id FROM bookmark');
    expect(connection.query.mock.calls[1][0]).toContain('UPDATE bookmark SET del_flag = 1');
    expect(mocks.removeInboxRelations).toHaveBeenCalledWith(connection, {
      userId: 'user-1',
      items: ids.map((id) => ({ resourceType: 'bookmark', resourceId: id })),
    });
    expect(connection.commit).toHaveBeenCalledOnce();
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
