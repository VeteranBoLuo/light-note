import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), getConnection: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query: mocks.query, getConnection: mocks.getConnection } }));
vi.mock('../util/obsClient.js', () => ({
  default: {},
  bucketBaseUrl: 'https://fixture.invalid',
  buildObjectKey: vi.fn(),
  buildObjectUrl: vi.fn(),
  createDownloadSignedUrl: () => ({ url: 'https://fixture.invalid/file' }),
  createUploadSignedUrl: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  copyObjectInObs: vi.fn(),
  putObjectToObs: vi.fn(),
  getObjectMetadataFromObs: vi.fn(),
}));
await import('../util/common.js');
const { list } = await import('./notificationHandle.js');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const request = () => ({ user: { id: 'owner', role: 'user' }, body: { pageSize: 10 } });
const response = () => ({ send: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('读接口独立回填与完成边界', () => {
  it('普通通知查询并发，但待办状态未完成时不发布列表', async () => {
    const items = deferred(),
      total = deferred(),
      unread = deferred(),
      todo = deferred();
    mocks.query.mockImplementation((sql) =>
      sql.includes('FROM todo_items')
        ? todo.promise
        : sql.includes('AS unreadTotal')
          ? unread.promise
          : sql.includes('AS total')
            ? total.promise
            : items.promise,
    );
    const res = response(),
      done = list(request(), res);
    expect(mocks.query).toHaveBeenCalledTimes(3);
    total.resolve([[{ total: 1 }]]);
    unread.resolve([[{ unreadTotal: 1 }]]);
    items.resolve([[{ id: 'notice', type: 'todo_reminder', meta: { todoId: 'todo' } }]]);
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(4));
    expect(res.send).not.toHaveBeenCalled();
    todo.resolve([[{ id: 'todo', status: 'completed' }]]);
    await done;
    expect(res.send.mock.calls[0][0]).toMatchObject({
      status: 200,
      data: { items: [{ todoState: 'completed' }], total: 1, unreadTotal: 1 },
    });
  });
  it('通知定位的事务仍串行，失败回滚并释放连接，不转用连接池读取', async () => {
    const page = deferred();
    const c = {
      query: vi.fn(),
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
    };
    c.query.mockImplementation((sql) => {
      if (sql.includes('SET TRANSACTION')) return Promise.resolve();
      if (sql.includes('SELECT id, create_time')) return Promise.resolve([[]]);
      return page.promise;
    });
    mocks.getConnection.mockResolvedValue(c);
    const req = request();
    req.body.notificationId = 'missing';
    const res = response(),
      done = list(req, res);
    await vi.waitFor(() => expect(c.query).toHaveBeenCalledTimes(3));
    expect(c.query.mock.calls.some(([sql]) => sql.includes('COUNT(*)'))).toBe(false);
    page.reject(Object.assign(new Error('fixture'), { code: 'FIXTURE_FAILURE' }));
    await done;
    expect(mocks.query).not.toHaveBeenCalled();
    expect(c.commit).not.toHaveBeenCalled();
    expect(c.rollback).toHaveBeenCalledOnce();
    expect(c.release).toHaveBeenCalledOnce();
    expect(res.send.mock.calls[0][0]).toMatchObject({ status: 500, data: null });
  });
});
