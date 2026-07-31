import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: { query: vi.fn() },
  listTodoPage: vi.fn(),
  queryTodoPendingCount: vi.fn(),
  listInboxResources: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/obsClient.js', () => ({
  buildObjectUrl: vi.fn(),
  createDownloadSignedUrl: vi.fn(() => ({ url: '' })),
}));
vi.mock('../util/fileCategory.js', () => ({
  getFileExtension: vi.fn(() => ''),
  resolveFileCategory: vi.fn(() => 'other'),
}));
vi.mock('../util/services/todoService.js', () => ({
  listTodoPage: mocks.listTodoPage,
  queryTodoPendingCount: mocks.queryTodoPendingCount,
}));
vi.mock('../util/resourceInbox.js', () => ({ listInboxResources: mocks.listInboxResources }));

const { getWorkbenchToday } = await import('./workbenchHandle.js');

function createResponse() {
  return { send: vi.fn() };
}

describe('getWorkbenchToday', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalized = String(sql);
      if (normalized.includes('FROM note')) {
        return [[{ id: 'note-1', title: '产品方案', activeAt: '2026-07-31 09:00:00' }]];
      }
      if (normalized.includes('FROM files')) {
        return [[{ id: 12, fileName: 'privacy.pdf', activeAt: '2026-07-30 09:00:00' }]];
      }
      return [[{ unreadNotificationTotal: 2, inboxPendingTotal: 9 }]];
    });
    mocks.queryTodoPendingCount.mockResolvedValue(11);
    mocks.listTodoPage.mockImplementation(async (_db, _userId, options) =>
      options.due === 'overdue'
        ? { items: [{ id: 'overdue-1' }, { id: 'overdue-2' }, { id: 'overdue-3' }], total: 7 }
        : { items: [{ id: 'today-1' }], total: 4 },
    );
    mocks.listInboxResources.mockResolvedValue({ items: [{ resourceId: 'r1' }] });
  });

  it('只跑今日相关查询，不触发趋势、饼图、排行和最近列表', async () => {
    const res = createResponse();
    await getWorkbenchToday({ user: { id: 'user-1' } }, res);

    const sqls = mocks.pool.query.mock.calls.map(([sql]) => String(sql));
    // 计数 1 次 + 继续处理的笔记/文件各 1 次
    expect(sqls).toHaveLength(3);
    expect(sqls.some((sql) => sql.includes('FROM notification') && sql.includes('FROM resource_inbox'))).toBe(true);
    // 桌面工作台的重查询一个都不能出现在今日接口里
    ['DATE_FORMAT', 'operation_logs', 'resource_tag_relations', 'LEFT JOIN folders'].forEach((fragment) => {
      expect(sqls.join(' ')).not.toContain(fragment);
    });
  });

  it('继续处理按活跃时间合并笔记与文件，并给出可跳转路由', async () => {
    const res = createResponse();
    await getWorkbenchToday({ user: { id: 'user-1' } }, res);

    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload.data.continueItems).toEqual([
      expect.objectContaining({ type: 'note', id: 'note-1', route: '/noteLibrary/note-1' }),
      expect.objectContaining({ type: 'file', id: '12', route: '/cloudSpace?fileId=12' }),
    ]);
  });

  it('继续处理查询失败时降级为空数组，不拖垮今日页', async () => {
    mocks.pool.query.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM note')) throw new Error('note query failed');
      if (String(sql).includes('FROM files')) throw new Error('file query failed');
      return [[{ unreadNotificationTotal: 0, inboxPendingTotal: 0 }]];
    });
    const res = createResponse();
    await getWorkbenchToday({ user: { id: 'user-1' } }, res);

    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload.status).toBe(200);
    expect(payload.data.continueItems).toEqual([]);
  });

  it('摘要用真实总数而不是被截断的条数', async () => {
    const res = createResponse();
    await getWorkbenchToday({ user: { id: 'user-1' } }, res);

    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload.status).toBe(200);
    // 逾期只返回 3 条明细，但计数必须是权威的 7
    expect(payload.data.overdueTodos).toHaveLength(3);
    expect(payload.data.counts).toMatchObject({
      overdue: 7,
      dueToday: 4,
      todoPending: 11,
      inbox: 9,
      unreadNotification: 2,
    });
  });

  it('按今日页展示上限取明细', async () => {
    const res = createResponse();
    await getWorkbenchToday({ user: { id: 'user-1' } }, res);

    const limits = mocks.listTodoPage.mock.calls.map(([, , options]) => [options.due, options.limit]);
    expect(limits).toEqual(expect.arrayContaining([['overdue', 3], ['today', 4]]));
    expect(mocks.listInboxResources.mock.calls[0][1]).toMatchObject({ limit: 3 });
  });

  it('缺少用户信息时返回 400', async () => {
    const res = createResponse();
    await getWorkbenchToday({ user: {} }, res);
    expect(res.send).toHaveBeenCalledWith({ data: null, status: 400, msg: '缺少用户信息' });
  });

  it('查询异常时返回稳定错误，不抛给上层', async () => {
    mocks.pool.query.mockRejectedValue(new Error('db down'));
    const res = createResponse();
    await getWorkbenchToday({ user: { id: 'user-1' } }, res);
    expect(res.send.mock.calls.at(-1)?.[0]).toMatchObject({ status: 500 });
  });
});
