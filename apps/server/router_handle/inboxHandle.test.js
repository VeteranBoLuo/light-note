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
const listInboxResources = vi.fn();
const queryPendingCount = vi.fn();
const queryTodoPendingCount = vi.fn();
const queryTodoAttentionCounts = vi.fn();
const ensureNotVisitor = vi.fn(() => true);

vi.mock('../db/index.js', () => ({ default: { getConnection, query: poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/resourceInbox.js', () => ({
  enqueueResources,
  completeResources,
  listInboxResources,
  normalizeInboxItems: vi.fn((items) => items),
  normalizeInboxSource: vi.fn((source, fallback) => source || fallback),
  queryPendingCount,
}));
vi.mock('../util/services/todoService.js', () => ({ queryTodoPendingCount, queryTodoAttentionCounts }));

const { completeInbox, countInbox, enqueueInbox, listInbox } = await import('./inboxHandle.js');

function mockRes() {
  const res = { status: vi.fn(), send: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
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
    queryTodoAttentionCounts.mockResolvedValue({
      todoOverdueTotal: 1,
      todoDueTodayTotal: 1,
      todoAttentionTotal: 2,
    });
    listInboxResources.mockResolvedValue({
      items: [{ resourceType: 'file', resourceId: '8', title: 'demo.txt' }],
      total: 1,
      nextCursor: null,
      pendingTotal: 1,
      typeTotals: { bookmark: 0, note: 0, file: 1 },
    });
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
    await enqueueInbox({ user: { id: 'u1' }, body: { items: [{ resourceType: 'note', resourceId: 'n1' }] } }, res);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({
      data: null,
      status: 500,
      msg: '待整理服务暂时不可用，请稍后重试',
    });
    expect(res.status).toHaveBeenCalledWith(500);
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
      enqueueInbox({ user: { id: 'u1' }, body: { items: [{ resourceType: 'note', resourceId: 'n1' }] } }, res),
    ).resolves.toBeUndefined();
    expect(res.send).toHaveBeenCalledWith({
      data: null,
      status: 500,
      msg: '待整理服务暂时不可用，请稍后重试',
    });
    expect(res.status).toHaveBeenCalledWith(500);
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
      suppressUserRewards: true,
    });
  });

  it('列表复用共享查询 Service，并把筛选条件与当前用户传入', async () => {
    const res = mockRes();
    await listInbox(
      {
        user: { id: 'u1' },
        body: { type: 'file', keyword: 'demo', sort: 'oldest' },
      },
      res,
    );
    expect(listInboxResources).toHaveBeenCalledWith(expect.anything(), {
      userId: 'u1',
      type: 'file',
      keyword: 'demo',
      sort: 'oldest',
      includeTotal: false,
    });
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({ total: 1 }),
      }),
    );
  });

  it('非法筛选或排序由共享 Service 拒绝', async () => {
    const error = new Error('无效的筛选或排序参数');
    error.code = 'INBOX_LIST_PARAMS_INVALID';
    listInboxResources.mockRejectedValueOnce(error);
    const res = mockRes();
    await listInbox({ user: { id: 'u1' }, body: { sort: 'DROP TABLE' } }, res);
    expect(listInboxResources).toHaveBeenCalledTimes(1);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith({ data: null, status: 400, msg: '无效的筛选或排序参数' });
  });

  it('角标接口只返回聚合数量', async () => {
    const res = mockRes();
    await countInbox({ user: { id: 'u1' } }, res);
    expect(queryPendingCount).toHaveBeenCalledWith(expect.anything(), 'u1');
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          pendingTotal: 1,
          typeTotals: { bookmark: 0, note: 1, file: 0 },
          todoPendingTotal: 2,
          actionTotal: 3,
          todoOverdueTotal: 1,
          todoDueTodayTotal: 1,
          todoAttentionTotal: 2,
        },
      }),
    );
  });

  /**
   * 「库存」口径（全部未完成，供工作台）与「注意力」口径（逾期 + 今天，供导航角标）
   * 必须同时存在：角标要能清零，仪表盘要看全量。旧字段一并保留以兼容未更新的客户端。
   */
  it('同时返回库存口径与注意力口径，旧字段保持兼容', async () => {
    queryTodoPendingCount.mockResolvedValueOnce(9);
    queryTodoAttentionCounts.mockResolvedValueOnce({
      todoOverdueTotal: 2,
      todoDueTodayTotal: 1,
      todoAttentionTotal: 3,
    });
    const res = mockRes();

    await countInbox({ user: { id: 'u1' } }, res);

    const { data } = res.send.mock.calls[0][0];
    // 库存口径：待整理 1 + 全部未完成待办 9
    expect(data.todoPendingTotal).toBe(9);
    expect(data.actionTotal).toBe(10);
    // 注意力口径独立于库存口径，且恒等于两个分项之和
    expect(data.todoAttentionTotal).toBe(3);
    expect(data.todoAttentionTotal).toBe(data.todoOverdueTotal + data.todoDueTodayTotal);
    // 注意力口径不得覆盖或污染库存口径
    expect(data.todoAttentionTotal).not.toBe(data.todoPendingTotal);
  });

  it('列表接口与角标接口共用同一计数汇聚点，口径不分叉', async () => {
    const res = mockRes();
    await listInbox({ user: { id: 'u1' }, body: {} }, res);

    const { data } = res.send.mock.calls[0][0];
    expect(data).toMatchObject({
      todoPendingTotal: 2,
      actionTotal: 3,
      todoOverdueTotal: 1,
      todoDueTodayTotal: 1,
      todoAttentionTotal: 2,
    });
    expect(queryTodoAttentionCounts).toHaveBeenCalledWith(expect.anything(), 'u1');
  });
});
