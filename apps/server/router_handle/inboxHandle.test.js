import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const getConnection = vi.fn(() => connection);
const enqueueResources = vi.fn();
const completeResources = vi.fn();

vi.mock('../db/index.js', () => ({ default: { getConnection, query: vi.fn() } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: vi.fn(() => true) }));
vi.mock('../util/resourceInbox.js', () => ({
  enqueueResources,
  completeResources,
  normalizeInboxItems: vi.fn((items) => items),
  normalizeInboxSource: vi.fn((source, fallback) => source || fallback),
  normalizeResourceType: vi.fn((type) => (['bookmark', 'note', 'file'].includes(type) ? type : null)),
  queryPendingCount: vi.fn(),
}));

const { completeInbox, enqueueInbox } = await import('./inboxHandle.js');

function mockRes() {
  return { send: vi.fn() };
}

describe('inboxHandle 写事务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueResources.mockResolvedValue({ added: 1, reopened: 0, ignored: 0 });
    completeResources.mockResolvedValue({ completed: 1 });
  });

  it('加入待整理成功后提交并释放连接', async () => {
    const req = {
      user: { id: 'u1' },
      body: { items: [{ resourceType: 'note', resourceId: 'n1' }], source: 'manual' },
    };
    const res = mockRes();
    await enqueueInbox(req, res);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(enqueueResources).toHaveBeenCalledWith(connection, {
      userId: 'u1',
      items: req.body.items,
      source: 'manual',
    });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('加入失败时回滚且不返回数据库原始错误', async () => {
    enqueueResources.mockRejectedValueOnce(new Error('sensitive database detail'));
    const res = mockRes();
    await enqueueInbox(
      { user: { id: 'u1' }, body: { items: [{ resourceType: 'note', resourceId: 'n1' }] } },
      res,
    );
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({
      data: null,
      status: 500,
      msg: '待整理服务暂时不可用，请稍后重试',
    });
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('批量完成同样使用事务', async () => {
    const req = { user: { id: 'u1' }, body: { items: [{ resourceType: 'file', resourceId: '8' }] } };
    await completeInbox(req, mockRes());
    expect(completeResources).toHaveBeenCalledWith(connection, { userId: 'u1', items: req.body.items });
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});
