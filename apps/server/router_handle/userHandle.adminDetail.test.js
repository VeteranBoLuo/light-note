import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query, getConnection: vi.fn() } }));

await import('../util/common.js');
const { getUserAdminDetail, getUserList } = await import('./userHandle.js');

function mockRes() {
  const res = {};
  res.send = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
}

function normalized(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

describe('后台用户管理增强', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('非 Root 无法读取用户 360° 详情', async () => {
    const res = mockRes();
    await getUserAdminDetail({ user: { id: 'user-1', role: 'user' }, body: { userId: 'target-1' } }, res);

    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('非法角色筛选会被拒绝，不会静默扩大为全部用户', async () => {
    const res = mockRes();
    await getUserList(
      {
        user: { id: 'root-1', role: 'root' },
        body: {
          cursor: null,
          limit: 30,
          filters: { role: 'unexpected-role' },
        },
      },
      res,
    );

    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(query).not.toHaveBeenCalled();
  });

  it('详情只返回设备短句柄和脱敏 IP，不暴露 sid/device_key', async () => {
    query.mockImplementation(async (sql) => {
      const statement = normalized(sql);
      if (statement.includes('FROM user u') && statement.includes('WHERE u.id = ?')) {
        return [
          [
            {
              id: 'target-1',
              alias: '目标用户',
              email: 'target@example.com',
              role: 'user',
              ip: '203.0.113.42',
              del_flag: '0',
              create_time: '2026-08-01 10:00:00',
              last_active_time: '2026-08-09 10:00:00',
            },
          ],
        ];
      }
      if (statement.includes('FROM community_chat_user_identities')) {
        return [[{ userPublicId: '22222222-2222-4222-8222-222222222222', communityId: 'ln_TEST22' }]];
      }
      if (statement.includes('FROM bookmark WHERE user_id')) {
        return [
          [
            {
              bookmark_total: 2,
              tag_total: 1,
              note_total: 3,
              file_total: 4,
              storage_used: 12.5,
              active_storage_used: 10,
              trash_storage_used: 2.5,
            },
          ],
        ];
      }
      if (statement.includes('FROM todo_items WHERE user_id')) {
        return [[{ total: 5, pending_total: 2, completed_total: 3, overdue_total: 1 }]];
      }
      if (statement.includes('FROM opinion WHERE user_id')) {
        return [[{ total: 2, pending_total: 1, replied_total: 1 }]];
      }
      if (statement.includes('FROM user_growth WHERE user_id')) {
        return [[{ exp: 120, level: 3, equipped_frame: 'frame_celestial' }]];
      }
      if (statement.includes('FROM ai_executions e') && statement.includes('e.actor_user_id = ?')) {
        return [[{ request_total: 9, token_total: 1000, failed_total: 1, last_used_at: '2026-08-09 08:00:00' }]];
      }
      if (statement.includes('FROM security_events WHERE user_id')) return [[{ event_total: 1, unhandled_total: 0 }]];
      if (statement.includes('FROM api_logs')) return [[{ request_total: 20, server_error_total: 0 }]];
      if (statement.includes('FROM operation_logs'))
        return [[{ module: '笔记', operation: '保存', create_time: '2026-08-09 09:00:00' }]];
      if (statement.includes('FROM admin_context_audit')) return [[]];
      if (statement.includes('FROM account_deletion_requests')) return [[]];
      if (statement.includes('FROM user_sessions')) {
        return [
          [
            {
              sid: 'secret-session-id',
              device_key: 'secret-device-digest',
              ip: '203.0.113.42',
              user_agent: 'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0 Safari/537.36',
              create_time: '2026-08-01 10:00:00',
              last_active_time: '2026-08-09 10:00:00',
              expires_at: '2026-08-16 10:00:00',
            },
          ],
        ];
      }
      return [[]];
    });
    const res = mockRes();

    await getUserAdminDetail({ user: { id: 'root-1', role: 'root' }, body: { userId: 'target-1' } }, res);

    const payload = res.send.mock.calls[0][0];
    expect(payload.status).toBe(200);
    expect(payload.data.resources).toMatchObject({
      bookmarkTotal: 2,
      noteTotal: 3,
      storageUsed: 12.5,
      activeStorageUsed: 10,
      trashStorageUsed: 2.5,
    });
    expect(payload.data.growth).toMatchObject({ equippedFrame: 'frame_celestial' });
    expect(payload.data.aiUsage).toMatchObject({ requestTotal: 9, tokenTotal: 1000, failedTotal: 1 });
    expect(payload.data.profile).toMatchObject({ communityId: 'ln_TEST22' });
    expect(payload.data.profile).not.toHaveProperty('userPublicId');
    expect(payload.data).not.toHaveProperty('aiWorkspace');
    const aiUsageCall = query.mock.calls.find(([sql]) => normalized(sql).includes('FROM ai_executions e'));
    expect(normalized(aiUsageCall[0])).toContain('cost_execution.actor_user_id = ?');
    expect(normalized(aiUsageCall[0])).not.toContain('agent_logs');
    expect(payload.data.sessions).toHaveLength(1);
    expect(payload.data.sessions[0]).toMatchObject({ ip: '203.0.113.*', sessionCount: 1 });
    expect(payload.data.sessions[0].id).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify(payload.data.sessions[0])).not.toContain('secret-session-id');
    expect(JSON.stringify(payload.data.sessions[0])).not.toContain('secret-device-digest');
    const deletionCall = query.mock.calls.find(([sql]) => normalized(sql).includes('FROM account_deletion_requests'));
    expect(normalized(deletionCall[0])).toContain('SELECT id AS request_id');
    expect(normalized(deletionCall[0])).toContain('requested_at AS create_time');
    expect(normalized(deletionCall[0])).toContain('ORDER BY requested_at DESC');
  });

  it('用户列表将角色、停用状态和活跃范围纳入服务端查询与游标域', async () => {
    query.mockImplementation(async (sql) => {
      const statement = normalized(sql);
      if (statement.includes('SELECT u.id, u.alias, u.email')) {
        return [
          [
            {
              id: 'target-1',
              alias: '目标用户',
              email: 'target@example.com',
              level: 6,
              equipped_frame: 'frame_celestial',
              last_active_time: '2026-08-09 10:00:00',
            },
          ],
        ];
      }
      if (statement.includes('FROM user_sessions current_session')) {
        return [[{ userId: 'target-1', userAgent: 'Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36' }]];
      }
      if (statement.startsWith('SELECT COUNT(*) AS total FROM user u')) return [[{ total: 1 }]];
      return [[]];
    });
    const res = mockRes();

    await getUserList(
      {
        user: { id: 'root-1', role: 'root' },
        body: {
          cursor: null,
          limit: 30,
          filters: { key: 'tester-key', role: 'test', status: 'banned', activityWindow: 'inactive30' },
          sort: { field: 'lastActiveTime', order: 'asc' },
        },
      },
      res,
    );

    const listCall = query.mock.calls.find(([sql]) => normalized(sql).includes('SELECT u.id, u.alias, u.email'));
    expect(normalized(listCall[0])).toContain('u.del_flag = 1');
    expect(normalized(listCall[0])).toContain('u.role = ?');
    expect(normalized(listCall[0])).toContain('ua.last_active_at IS NULL');
    expect(normalized(listCall[0])).toContain('ug.equipped_frame');
    expect(normalized(listCall[0])).toContain('LEFT JOIN user_growth ug ON ug.user_id = u.id');
    expect(listCall[1]).toEqual(expect.arrayContaining(['root-1', 'tester-key', 'test']));
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({
          items: [
            expect.objectContaining({
              level: 6,
              equippedFrame: 'frame_celestial',
              userAgent: 'Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36',
            }),
          ],
        }),
      }),
    );
    expect(normalized(listCall[0])).toContain('COALESCE(ug.level, 1) AS level');
    const sessionCall = query.mock.calls.find(([sql]) =>
      normalized(sql).includes('FROM user_sessions current_session'),
    );
    expect(normalized(sessionCall[0])).toContain('newer_session.sid IS NULL');
    const countCall = query.mock.calls.find(([sql]) =>
      normalized(sql).startsWith('SELECT COUNT(*) AS total FROM user u'),
    );
    expect(normalized(countCall[0])).toContain('u.role = ?');
    expect(countCall[1]).toEqual(expect.arrayContaining(['root-1', 'tester-key', 'test']));
  });
});

describe('用户管理真实交互口径', () => {
  beforeEach(() => query.mockReset());
  const request = (body = {}) => ({
    user: { id: 'root-1', role: 'root' },
    body: { cursor: null, limit: 1, sort: { field: 'lastActiveTime', order: 'desc' }, ...body },
  });
  function rowsForPage(rows) {
    query.mockImplementation(async (sql) => {
      const statement = normalized(sql);
      if (statement.startsWith('SELECT u.id, u.alias, u.email')) return [rows];
      if (statement.startsWith('SELECT COUNT(*)')) return [[{ total: 3 }]];
      return [[]];
    });
  }
  it.each(['asc', 'desc'])('真实活跃 %s 分页能从时间进入空值，再继续空值用户', async (order) => {
    const body = { sort: { field: 'lastActiveTime', order } };
    const known = { id: 'known', last_active_time: new Date('2026-09-09T04:30:06Z') };
    const unknownA = { id: order === 'asc' ? 'a' : 'z', last_active_time: null };
    const unknownB = { id: order === 'asc' ? 'b' : 'y', last_active_time: null };
    rowsForPage([known, unknownA]);
    const first = mockRes();
    await getUserList(request(body), first);
    const firstPage = first.send.mock.calls[0][0].data;
    expect(firstPage.hasMore).toBe(true);
    const sql = normalized(query.mock.calls[0][0]);
    expect(sql).toContain('ua.last_active_at AS last_active_time');
    expect(sql).not.toContain('u.last_active_time');
    expect(sql).toContain('ORDER BY latest_activity.activity_date DESC LIMIT 1');
    expect(sql).toContain(`ORDER BY ua.last_active_at IS NULL ASC, ua.last_active_at ${order.toUpperCase()}`);
    rowsForPage([unknownA, unknownB]);
    const second = mockRes();
    await getUserList(request({ ...body, cursor: firstPage.nextCursor }), second);
    const secondPage = second.send.mock.calls[0][0].data;
    expect(secondPage.items[0].lastActiveTime).toBeNull();
    expect(JSON.parse(Buffer.from(secondPage.nextCursor, 'base64url').toString()).value).toBe('');
    const secondSql = normalized(
      query.mock.calls.filter(([sql]) => normalized(sql).startsWith('SELECT u.id, u.alias, u.email')).at(-1)[0],
    );
    expect(secondSql).toContain('OR ua.last_active_at IS NULL');
    query.mockClear();
    rowsForPage([unknownB]);
    const third = mockRes();
    await getUserList(request({ ...body, cursor: secondPage.nextCursor }), third);
    expect(third.send.mock.calls[0][0]).toMatchObject({ status: 200, data: { hasMore: false, nextCursor: null } });
    expect(normalized(query.mock.calls[0][0])).toContain(
      `ua.last_active_at IS NULL AND u.id ${order === 'asc' ? '>' : '<'} ?`,
    );
    expect(query.mock.calls[0][1].at(-2)).toBe(unknownA.id);
  });
  it.each([
    ['day1', 1],
    ['day7', 7],
    ['day30', 30],
  ])('%s 筛选与总数使用北京时间真实交互', async (activityWindow, days) => {
    rowsForPage([]);
    const res = mockRes();
    await getUserList(request({ filters: { activityWindow } }), res);
    expect(res.send.mock.calls[0][0].status).toBe(200);
    for (const [sql] of query.mock.calls) {
      expect(normalized(sql)).toContain('LEFT JOIN user_activity_daily ua');
      expect(normalized(sql)).toContain(
        `ua.last_active_at >= DATE_SUB(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 8 HOUR), INTERVAL ${days} DAY)`,
      );
      expect(normalized(sql)).not.toContain('u.last_active_time');
    }
  });
  it('详情没有交互记录时保留空值，不从会话时间回填', async () => {
    query.mockImplementation(async (sql) => {
      if (normalized(sql).includes('WHERE u.id = ?')) return [[{ id: 'target-1', last_active_time: null }]];
      return [[]];
    });
    const res = mockRes();
    await getUserAdminDetail({ user: { id: 'root-1', role: 'root' }, body: { userId: 'target-1' } }, res);
    expect(res.send.mock.calls[0][0]).toMatchObject({ status: 200, data: { profile: { lastActiveTime: null } } });
    expect(normalized(query.mock.calls[0][0])).toContain('ua.last_active_at AS last_active_time');
    expect(normalized(query.mock.calls[0][0])).not.toContain('u.last_active_time');
  });
});
