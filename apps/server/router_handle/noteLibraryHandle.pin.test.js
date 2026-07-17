import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const getConnection = vi.fn(async () => connection);
const ensureNotVisitor = vi.fn(() => true);
const attachPendingStatus = vi.fn();

vi.mock('../db/index.js', () => ({ default: { getConnection, query: poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  snakeCaseKeys: vi.fn((obj) => obj),
  mergeExistingProperties: vi.fn((obj) => obj),
  insertData: vi.fn((obj) => ({ ...obj, id: 'generated-id' })),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/resourceTags.js', () => ({
  RESOURCE_TYPE: { NOTE: 'note' },
  replaceResourceTagRelations: vi.fn(),
  validateUserTags: vi.fn(),
}));
vi.mock('../util/resourceInbox.js', () => ({
  attachPendingStatus,
  removeInboxRelations: vi.fn(),
}));
vi.mock('../util/services/noteService.js', () => ({ createNote: vi.fn() }));
vi.mock('../util/services/tagService.js', () => ({ createTag: vi.fn() }));
vi.mock('../util/noteImages.js', () => ({
  cleanupOrphanNoteImages: vi.fn(),
  extractNoteImageUrls: vi.fn(() => []),
  filterOwnedImageUrls: vi.fn(),
}));

const { queryNoteList, toggleNoteTop } = await import('./noteLibraryHandle.js');

function mockRes() {
  return { send: vi.fn() };
}

const lastSent = (res) => res.send.mock.calls.at(-1)?.[0];

describe('笔记置顶 handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureNotVisitor.mockReturnValue(true);
  });

  it('笔记列表按置顶、自定义顺序和更新时间排序', async () => {
    poolQuery.mockResolvedValueOnce([[{ id: 'n1', is_top: 1, tags: null }]]);
    const res = mockRes();

    queryNoteList({ user: { id: 'u1' }, body: {} }, res);
    await vi.waitFor(() => expect(res.send).toHaveBeenCalled());

    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain('ORDER BY n.is_top DESC, n.sort, n.update_time DESC');
    expect(params).toEqual(['u1']);
    expect(attachPendingStatus).toHaveBeenCalled();
    expect(lastSent(res).status).toBe(200);
  });

  it('游客请求被拒绝且不获取数据库连接', async () => {
    ensureNotVisitor.mockImplementation((req, res) => {
      res.send({ data: null, status: 403, msg: '游客无权限' });
      return false;
    });
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'visitor' }, body: { id: 'n1' } }, res);

    expect(getConnection).not.toHaveBeenCalled();
    expect(lastSent(res).status).toBe(403);
  });

  it('缺少笔记 id 返回 400', async () => {
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'u1' }, body: {} }, res);

    expect(getConnection).not.toHaveBeenCalled();
    expect(lastSent(res).status).toBe(400);
  });

  it('非本人或已删除笔记返回 404', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'u1' }, body: { id: 'other-note' } }, res);

    expect(connection.query.mock.calls[0][0]).toContain('create_by = ? AND del_flag = 0 FOR UPDATE');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(lastSent(res).status).toBe(404);
  });

  it('成功置顶并保持笔记更新时间不变', async () => {
    connection.query.mockResolvedValueOnce([[{ is_top: 0 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'u1' }, body: { id: 'n1' } }, res);

    const [updateSql, updateParams] = connection.query.mock.calls[1];
    expect(updateSql).toContain('is_top = ?');
    expect(updateSql).toContain('update_time = update_time');
    expect(updateParams).toEqual([1, 'n1', 'u1']);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(lastSent(res)).toEqual({ data: { id: 'n1', isTop: 1 }, status: 200, msg: '' });
  });

  it('数据库失败时回滚且不泄漏底层错误', async () => {
    connection.query.mockRejectedValueOnce(new Error('SQL_SECRET'));
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'u1' }, body: { id: 'n1' } }, res);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(lastSent(res).status).toBe(500);
    expect(lastSent(res).msg).not.toContain('SQL_SECRET');
  });

  it('获取数据库连接失败时返回收口后的 500', async () => {
    getConnection.mockRejectedValueOnce(new Error('CONNECT_SECRET'));
    const res = mockRes();

    await toggleNoteTop({ user: { id: 'u1' }, body: { id: 'n1' } }, res);

    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).not.toHaveBeenCalled();
    expect(lastSent(res).status).toBe(500);
    expect(lastSent(res).msg).not.toContain('CONNECT_SECRET');
  });
});
