import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const connection = {
  beginTransaction: vi.fn(),
  query,
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const getConnection = vi.fn(() => connection);

vi.mock('../db/index.js', () => ({
  default: { getConnection, query: vi.fn(), escape: (value) => `'${String(value)}'` },
}));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/obsClient.js', () => ({
  deleteObjectFromObs: vi.fn(),
  buildObjectKey: vi.fn(),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: vi.fn(() => true) }));

const { permanentDelete, restoreTrash } = await import('./trashHandle.js');

const mockRes = () => ({ send: vi.fn() });

describe('回收站与待整理关系', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConnection.mockResolvedValue(connection);
    query.mockResolvedValue([{ affectedRows: 1 }]);
  });

  it('永久删除时在同一事务内兜底清理待整理关系', async () => {
    const res = mockRes();
    await permanentDelete({
      user: { id: 'u1' },
      body: { resourceType: 'bookmark', ids: ['b1'] },
    }, res);

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM resource_inbox'))).toBe(true);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('恢复资源不自动恢复待整理状态', async () => {
    await restoreTrash({
      user: { id: 'u1' },
      body: { resourceType: 'note', ids: ['n1'] },
    }, mockRes());

    expect(query.mock.calls.some(([sql]) => String(sql).includes('resource_inbox'))).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});
