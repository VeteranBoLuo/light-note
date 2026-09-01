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
    expect(normalized(listCall[0])).toContain('u.last_active_time IS NULL');
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
