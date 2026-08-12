import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const getConnection = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query, getConnection } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: vi.fn(() => true) }));
vi.mock('../util/notification.js', () => ({ createNotification: vi.fn() }));
vi.mock('../util/emailDelivery.js', () => ({
  EMAIL_EFFECTIVE_STATUS_SQL:
    "CASE WHEN e.status = 'sending' AND e.update_time < DATE_SUB(NOW(), INTERVAL 10 MINUTE) THEN 'unknown' ELSE e.status END",
  maskEmail: (value) => String(value).replace(/^(.{2}).*(@.*)$/u, '$1***$2'),
}));

const { adminDelete, adminEmailStats, adminEmailList, adminEmailDetail, list, unreadCount, markAllRead } =
  await import('./notificationHandle.js');

const mockRes = () => ({ send: vi.fn() });

describe('待办提醒通知状态', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('列表标记待处理、已完成和已删除待办，供前端收起失效操作', async () => {
    query
      .mockResolvedValueOnce([
        [
          { id: 'n1', type: 'todo_reminder', meta: { todoId: 'todo-pending' } },
          { id: 'n2', type: 'todo_reminder', meta: JSON.stringify({ todoId: 'todo-completed' }) },
          { id: 'n3', type: 'todo_reminder', meta: { todoId: 'todo-deleted' } },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { id: 'todo-pending', status: 'pending' },
          { id: 'todo-completed', status: 'completed' },
        ],
      ])
      .mockResolvedValueOnce([[{ total: 3 }]])
      .mockResolvedValueOnce([[{ unreadTotal: 1 }]]);
    const res = mockRes();

    await list({ user: { id: 'user-1', role: 'user' }, body: { currentPage: 1, pageSize: 20 } }, res);

    const payload = res.send.mock.calls[0][0];
    expect(payload.status).toBe(200);
    expect(payload.data.items.map((item) => item.todoState)).toEqual(['pending', 'completed', 'unavailable']);
    expect(query.mock.calls[1][0]).toContain('WHERE user_id = ? AND del_flag = 0 AND id IN (?,?,?)');
    expect(query.mock.calls[1][1]).toEqual(['user-1', 'todo-pending', 'todo-completed', 'todo-deleted']);
    for (const callIndex of [0, 2, 3]) {
      expect(query.mock.calls[callIndex][0]).toContain("JSON_EXTRACT(meta, '$.kind')");
      expect(query.mock.calls[callIndex][0]).toContain("IN ('reply', 'mention')");
    }
  });
});

describe('聊天室通知中心可见性与旧客户端兼容', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('旧客户端要求完全排除聊天室时，列表、分页总数和未读总数使用同一个排除条件', async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([[{ unreadTotal: 1 }]]);
    const res = mockRes();

    await list(
      {
        user: { id: 'user-1', role: 'user' },
        body: { currentPage: 1, pageSize: 20, excludeCommunityChat: true },
      },
      res,
    );

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0]).toContain("type <> 'community_chat'");
    expect(query.mock.calls[1][0]).toContain("type <> 'community_chat'");
    expect(query.mock.calls[2][0]).toContain("type <> 'community_chat'");
    expect(res.send.mock.calls[0][0].data).toMatchObject({ total: 2, unreadTotal: 1 });
  });

  it('旧客户端的铃铛计数和全部已读仍可完全排除聊天室通知', async () => {
    query.mockResolvedValueOnce([[{ type: 'system', c: 2 }]]).mockResolvedValueOnce([{ affectedRows: 2 }]);
    const unreadRes = mockRes();
    const markAllRes = mockRes();

    await unreadCount({ user: { id: 'user-1', role: 'user' }, body: { excludeCommunityChat: true } }, unreadRes);
    await markAllRead({ user: { id: 'user-1', role: 'user' }, body: { excludeCommunityChat: true } }, markAllRes);

    expect(query.mock.calls[0][0]).toContain("type <> 'community_chat'");
    expect(query.mock.calls[1][0]).toContain("type <> 'community_chat'");
    expect(unreadRes.send.mock.calls[0][0].data).toEqual({ unreadTotal: 2, byType: { system: 2 } });
    expect(markAllRes.send.mock.calls[0][0].data).toEqual({ updated: 2 });
  });
});

describe('通知中心管理员删除', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockReset();
    getConnection.mockReset();
    query.mockResolvedValue([{ affectedRows: 3 }]);
  });

  it('仅 root 可以删除通知批次', async () => {
    const res = mockRes();
    await adminDelete({ user: { role: 'user' }, body: { batchId: 'batch-1' } }, res);

    expect(query).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('缺少批次标识时拒绝执行', async () => {
    const res = mockRes();
    await adminDelete({ user: { role: 'root' }, body: {} }, res);

    expect(query).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('归档整批管理员通知并保留事实行，同时限制为 system/other 类型', async () => {
    query.mockReset().mockResolvedValue([{ affectedRows: 1 }]);
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async () => [{ affectedRows: 3 }]),
    };
    getConnection.mockResolvedValue(connection);
    const res = mockRes();
    await adminDelete(
      {
        user: { id: 'root-1', role: 'root' },
        requestId: 'request-archive',
        body: {
          batchId: 'batch-1',
          reason: '历史通知完成归档',
          confirmed: true,
          confirmText: '确认归档通知',
        },
      },
      res,
    );

    const [sql, params] = connection.query.mock.calls.find(([statement]) =>
      String(statement).includes('UPDATE notification'),
    );
    expect(sql).toContain('admin_archived = 1');
    expect(sql).toContain('batch_id = ? OR id = ?');
    expect(sql).toContain('type IN (?,?)');
    expect(params).toEqual(['batch-1', 'batch-1', 'system', 'other']);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(res.send.mock.calls[0][0].data).toMatchObject({ archived: 3, deleted: 3, requestId: 'request-archive' });
  });
});

describe('通知中心邮件发送记录', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockReset();
  });

  it('拒绝普通用户和管理员预览上下文读取邮件记录', async () => {
    const userRes = mockRes();
    const previewRes = mockRes();

    await adminEmailStats({ user: { role: 'user' } }, userRes);
    await adminEmailStats({ user: { role: 'root' }, adminContext: { id: 'ctx-1' } }, previewRes);

    expect(query).not.toHaveBeenCalled();
    expect(userRes.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(previewRes.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('会话角色为 root 时仍复核数据库中的实时角色和删除状态', async () => {
    query.mockResolvedValueOnce([[{ role: 'user', del_flag: 0 }]]);
    const res = mockRes();

    await adminEmailStats({ user: { id: 'root-1', role: 'root' } }, res);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('SELECT role, del_flag FROM user');
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('返回今日 SMTP 状态统计', async () => {
    query
      .mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]])
      .mockResolvedValueOnce([[{ total: 8, accepted: 6, failed: 1, unknownCount: 1 }]]);
    const res = mockRes();

    await adminEmailStats({ user: { id: 'root-1', role: 'root' } }, res);

    expect(res.send).toHaveBeenCalledWith({
      data: { total: 8, accepted: 6, failed: 1, unknown: 1 },
      status: 200,
      msg: '',
    });
  });

  it('邮件列表使用参数化筛选并对收件邮箱脱敏', async () => {
    query
      .mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]])
      .mockResolvedValueOnce([
        [
          {
            id: 'mail-1',
            emailType: 'todo_reminder',
            recipientEmail: 'person@example.com',
            subject: '待办提醒',
            status: 'accepted',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const res = mockRes();

    await adminEmailList(
      {
        user: { id: 'root-1', role: 'root' },
        body: {
          emailType: 'todo_reminder',
          status: 'accepted',
          keyword: 'person',
          startDate: '2026-07-26',
          currentPage: 1,
          pageSize: 20,
        },
      },
      res,
    );

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain('e.email_type = ?');
    expect(query.mock.calls[1][0]).toContain('e.recipient_email LIKE ?');
    expect(query.mock.calls[1][1]).toEqual([
      'todo_reminder',
      'accepted',
      '%person%',
      '%person%',
      '%person%',
      '2026-07-26 00:00:00',
      20,
      0,
    ]);
    expect(res.send.mock.calls[0][0].data.items[0].recipientEmail).toBe('pe***@example.com');
  });

  it('详情只按记录 ID 参数化查询', async () => {
    query
      .mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]])
      .mockResolvedValueOnce([[{ id: 'mail-1', recipientEmail: 'person@example.com' }]]);
    const res = mockRes();

    await adminEmailDetail({ user: { id: 'root-1', role: 'root' }, body: { id: 'mail-1' } }, res);

    expect(query.mock.calls[1][0]).toContain('WHERE e.id = ?');
    expect(query.mock.calls[1][1]).toEqual(['mail-1']);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, data: expect.objectContaining({ id: 'mail-1' }) }),
    );
  });
});
