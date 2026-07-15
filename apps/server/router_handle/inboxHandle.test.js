import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const getConnection = vi.fn(() => connection);
const poolQuery = vi.fn();
const enqueueResources = vi.fn();
const completeResources = vi.fn();
const queryPendingCount = vi.fn();
const queryTodoPendingCount = vi.fn();
const ensureNotVisitor = vi.fn(() => true);

vi.mock('../db/index.js', () => ({ default: { getConnection, query: poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/resourceInbox.js', () => ({
  enqueueResources,
  completeResources,
  normalizeInboxItems: vi.fn((items) => items),
  normalizeInboxSource: vi.fn((source, fallback) => source || fallback),
  normalizeResourceType: vi.fn((type) => (['bookmark', 'note', 'file'].includes(type) ? type : null)),
  queryPendingCount,
}));
vi.mock('../util/services/todoService.js', () => ({ queryTodoPendingCount }));

const { completeInbox, countInbox, enqueueInbox, listInbox } = await import('./inboxHandle.js');

function mockRes() {
  return { send: vi.fn() };
}

describe('inboxHandle 写事务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueResources.mockResolvedValue({ added: 1, reopened: 0, ignored: 0 });
    completeResources.mockResolvedValue({ completed: 1 });
    queryPendingCount.mockResolvedValue({
      pendingTotal: 1,
      typeTotals: { bookmark: 0, note: 1, file: 0 },
    });
    queryTodoPendingCount.mockResolvedValue(2);
    ensureNotVisitor.mockReturnValue(true);
    getConnection.mockResolvedValue(connection);
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

  it('连接池获取失败也返回稳定业务错误而不是抛出', async () => {
    getConnection.mockRejectedValueOnce(new Error('connection secret'));
    const res = mockRes();
    await expect(
      enqueueInbox(
        { user: { id: 'u1' }, body: { items: [{ resourceType: 'note', resourceId: 'n1' }] } },
        res,
      ),
    ).resolves.toBeUndefined();
    expect(res.send).toHaveBeenCalledWith({
      data: null,
      status: 500,
      msg: '待整理服务暂时不可用，请稍后重试',
    });
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('普通游客写入在获取连接前就被拦截', async () => {
    ensureNotVisitor.mockReturnValueOnce(false);
    await enqueueInbox(
      { user: { id: 'visitor', role: 'visitor' }, body: { items: [{ resourceType: 'note', resourceId: 'n1' }] } },
      mockRes(),
    );
    expect(getConnection).not.toHaveBeenCalled();
    expect(enqueueResources).not.toHaveBeenCalled();
  });

  it('管理员维护游客工作区时可将所属文件加入待整理', async () => {
    const req = {
      user: { id: 'visitor-subject', role: 'visitor' },
      adminContext: { subjectRole: 'visitor', mode: 'maintain' },
      body: { items: [{ resourceType: 'file', resourceId: '8' }], source: 'manual' },
    };
    const res = mockRes();
    await enqueueInbox(req, res);
    expect(getConnection).toHaveBeenCalledTimes(1);
    expect(enqueueResources).toHaveBeenCalledWith(connection, {
      userId: 'visitor-subject',
      items: req.body.items,
      source: 'manual',
    });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('管理员维护游客工作区时可完成文件整理', async () => {
    await completeInbox(
      {
        user: { id: 'visitor-subject', role: 'visitor' },
        adminContext: { subjectRole: 'visitor', mode: 'maintain' },
        body: { items: [{ resourceType: 'file', resourceId: '8' }] },
      },
      mockRes(),
    );
    expect(getConnection).toHaveBeenCalledTimes(1);
    expect(completeResources).toHaveBeenCalledWith(connection, {
      userId: 'visitor-subject',
      items: [{ resourceType: 'file', resourceId: '8' }],
    });
  });

  it('列表使用固定三类 UNION、当前用户过滤并一次返回全部结果', async () => {
    poolQuery.mockResolvedValueOnce([[
      { resourceType: 'file', resourceId: '8', title: 'demo.txt' },
    ]]);
    const res = mockRes();
    await listInbox({
      user: { id: 'u1' },
      body: { type: 'file', keyword: 'demo', sort: 'oldest' },
    }, res);
    expect(poolQuery).toHaveBeenCalledTimes(1);
    const listSql = poolQuery.mock.calls[0][0];
    expect(listSql).toContain("SELECT CONVERT('bookmark' USING utf8)");
    expect(listSql).toContain("CONVERT('note' USING utf8)");
    expect(listSql).toContain("CONVERT('file' USING utf8)");
    expect(listSql).toContain('CAST(f.id AS CHAR)');
    expect(listSql).toContain('COLLATE utf8mb4_unicode_ci');
    expect(listSql).toContain('COLLATE utf8_general_ci');
    expect(listSql).toContain('i.user_id = ?');
    expect(listSql).toContain('i.create_time ASC');
    expect(listSql).not.toContain('LIMIT');
    expect(poolQuery.mock.calls[0][1]).toEqual(['u1', 'file', '%demo%', '%demo%']);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({
      status: 200,
      data: expect.objectContaining({ total: 1 }),
    }));
  });

  it('非法筛选或排序直接拒绝且不查询数据库', async () => {
    const res = mockRes();
    await listInbox({ user: { id: 'u1' }, body: { sort: 'DROP TABLE' } }, res);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({ data: null, status: 400, msg: '无效的筛选或排序参数' });
  });

  it('角标接口只返回聚合数量', async () => {
    const res = mockRes();
    await countInbox({ user: { id: 'u1' } }, res);
    expect(queryPendingCount).toHaveBeenCalledWith(expect.anything(), 'u1');
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        pendingTotal: 1,
        typeTotals: { bookmark: 0, note: 1, file: 0 },
        todoPendingTotal: 2,
        actionTotal: 3,
      },
    }));
  });
});
