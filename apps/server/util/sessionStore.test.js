import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const getConnection = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query, getConnection } }));

const { createSession, getSession, getSessionDeviceKey, groupUserSessions, touchUserLastActive, removeUserSessions } =
  await import('./sessionStore.js');

function createConnection() {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('登录设备会话归并', () => {
  it.each(['', 'device-1234567890'])('账号复核与创建会话在同一事务，设备标识=%s', async (deviceId) => {
    const connection = createConnection();
    const account = { id: 'user-1', password: 'current' };
    connection.query.mockImplementation(async (sql) => (sql.includes('FROM user WHERE') ? [[account]] : [[]]));
    getConnection.mockResolvedValue(connection);
    const validateAccount = vi.fn((current) => expect(current).toEqual(account));
    await createSession({ userId: 'user-1', role: 'user', maxAgeMs: 1000, deviceId, validateAccount });
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(validateAccount).toHaveBeenCalledOnce();
    expect(connection.query.mock.calls.at(-1)[0]).toContain('INSERT INTO user_sessions');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalled();
  });
  it('账号复核失败时回滚，不插入会话或回退兼容路径', async () => {
    const connection = createConnection();
    connection.query.mockResolvedValue([[{ id: 'user-1', password: 'changed' }]]);
    getConnection.mockResolvedValue(connection);
    await expect(
      createSession({
        userId: 'user-1',
        maxAgeMs: 1000,
        validateAccount: () => {
          throw Object.assign(new Error(), { code: 'GITHUB_OAUTH_ACCOUNT_CHANGED' });
        },
      }),
    ).rejects.toHaveProperty('code', 'GITHUB_OAUTH_ACCOUNT_CHANGED');
    expect(connection.query).toHaveBeenCalledOnce();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  it('缺少 device_key 字段的兼容路径也必须锁定并复核账号', async () => {
    const first = createConnection(),
      fallback = createConnection();
    first.query
      .mockResolvedValueOnce([[{ id: 'user-1' }]])
      .mockRejectedValueOnce(Object.assign(new Error(), { code: 'ER_BAD_FIELD_ERROR' }));
    fallback.query.mockResolvedValueOnce([[{ id: 'user-1' }]]).mockResolvedValueOnce([{}]);
    getConnection.mockResolvedValueOnce(first).mockResolvedValueOnce(fallback);
    const validateAccount = vi.fn();
    await createSession({ userId: 'user-1', maxAgeMs: 1000, deviceId: 'device-1234567890', validateAccount });
    expect(validateAccount).toHaveBeenCalledTimes(2);
    expect(fallback.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(fallback.query.mock.calls[1][0]).not.toContain('device_key');
    expect(query).not.toHaveBeenCalled();
  });
  it('同一稳定设备再次登录时原子替换旧 session', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[{ sid: 'old-sid-a' }, { sid: 'old-sid-b' }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);
    getConnection.mockResolvedValue(connection);

    const result = await createSession({
      userId: 'user-1',
      role: 'user',
      maxAgeMs: 86_400_000,
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0 Chrome/120',
      deviceId: '3f3cf0c1-8b0f-45c5-b52a-b6d5ed5da8ef',
    });

    expect(result.sid).toMatch(/^[a-f0-9]{64}$/);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('device_key = ?');
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.query.mock.calls[0][1]).toEqual([
      'user-1',
      getSessionDeviceKey('3f3cf0c1-8b0f-45c5-b52a-b6d5ed5da8ef'),
    ]);
    expect(connection.query.mock.calls[1][0]).toContain('DELETE FROM user_sessions');
    expect(connection.query.mock.calls[2][0]).toContain('device_key');
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('无稳定设备标识的兼容客户端维持普通会话创建', async () => {
    query.mockResolvedValueOnce([{}]);

    const result = await createSession({ userId: 'user-1', role: 'user', maxAgeMs: 1_000 });

    expect(result.sid).toMatch(/^[a-f0-9]{64}$/);
    expect(getConnection).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(expect.not.stringContaining('device_key'), expect.any(Array));
  });

  it('只按 stable key 聚合，历史 session 即使 IP/UA 相同也独立保留', () => {
    const groups = groupUserSessions(
      [
        {
          sid: 'current',
          device_key: 'device-key-a',
          ip: '14.153.218.136',
          user_agent: 'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0 Safari/537.36',
          last_active_time: '2026-07-22T11:53:00Z',
        },
        {
          sid: 'legacy-a',
          device_key: null,
          ip: '14.153.218.136',
          user_agent: 'Mozilla/5.0 (Macintosh) Chrome/119.0.0.0 Safari/537.36',
          last_active_time: '2026-07-21T14:04:00Z',
        },
        {
          sid: 'legacy-b',
          device_key: null,
          ip: '14.153.218.136',
          user_agent: 'Mozilla/5.0 (Macintosh) Chrome/118.0.0.0 Safari/537.36',
          last_active_time: '2026-07-21T14:03:00Z',
        },
        {
          sid: 'android',
          device_key: null,
          ip: '14.153.218.136',
          user_agent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile Safari/537.36',
          last_active_time: '2026-07-21T09:28:00Z',
        },
      ],
      'current',
    );

    expect(groups).toHaveLength(4);
    expect(groups.find((group) => group.sid === 'current')).toMatchObject({ current: true, sessionCount: 1 });
    expect(groups.find((group) => group.sid === 'current')?.sids).toEqual(['current']);
    expect(groups.find((group) => group.sid === 'legacy-a')).toMatchObject({ current: false, sessionCount: 1 });
    expect(groups.find((group) => group.sid === 'legacy-b')).toMatchObject({ current: false, sessionCount: 1 });
    expect(groups.find((group) => group.sid === 'android')).toMatchObject({ current: false, sessionCount: 1 });
  });

  it('同一 stable key 的多个 session 仍作为一个设备组撤销', () => {
    const groups = groupUserSessions(
      [
        { sid: 'current', device_key: 'device-key-a', last_active_time: '2026-07-22T11:53:00Z' },
        { sid: 'old', device_key: 'device-key-a', last_active_time: '2026-07-21T11:53:00Z' },
        { sid: 'remote', device_key: 'device-key-b', last_active_time: '2026-07-20T11:53:00Z' },
      ],
      'current',
    );

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.current)).toMatchObject({ sessionCount: 2, sids: ['current', 'old'] });
    expect(groups.find((group) => !group.current)).toMatchObject({ sessionCount: 1, sids: ['remote'] });
  });

  it('不会把缺少 IP 或 UA 的历史 session 猜测成同一设备', () => {
    const groups = groupUserSessions([
      { sid: 'unknown-a', ip: '', user_agent: '', last_active_time: '2026-07-22T11:53:00Z' },
      { sid: 'unknown-b', ip: '', user_agent: '', last_active_time: '2026-07-22T11:52:00Z' },
    ]);

    expect(groups).toHaveLength(2);
  });
});

describe('用户最近活跃时间', () => {
  it('同一进程内按五分钟窗口节流写入', async () => {
    query.mockResolvedValue([{}]);

    expect(await touchUserLastActive('activity-user-1', 1_000_000)).toBe(true);
    expect(await touchUserLastActive('activity-user-1', 1_001_000)).toBe(false);
    expect(await touchUserLastActive('activity-user-1', 1_301_000)).toBe(true);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('UPDATE user SET last_active_time = NOW()');
  });
});

describe('密码变更后的整账号会话撤销', () => {
  it('删除该账号在数据库中的全部会话', async () => {
    query.mockReset().mockResolvedValueOnce([{ affectedRows: 2 }]);
    await removeUserSessions('password-user');
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith('DELETE FROM user_sessions WHERE user_id = ?', ['password-user']);
  });
});

describe('会话有效性以数据库为准，续期写入按分钟节流', () => {
  const sessionRow = (overrides = {}) => ({
    sid: 'active',
    user_id: 'session-owner',
    role: 'user',
    expires_at: new Date(Date.now() + 3_600_000),
    create_time: new Date(Date.now() - 3_600_000),
    expires_in_seconds: 3_600,
    touch_due: 0,
    ...overrides,
  });
  const updates = () => query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE user_sessions'));
  beforeEach(() => {
    query.mockReset();
  });

  it('每次都用共享锁读确认会话，等待未提交的撤销', async () => {
    query.mockResolvedValueOnce([[sessionRow()]]);
    await getSession('active');
    expect(query.mock.calls[0][0]).toContain('LOCK IN SHARE MODE');
    expect(query.mock.calls[0][0]).toContain('WHERE sid = ? AND expires_at > NOW()');
    expect(query.mock.calls[0][1]).toEqual([60, 'active']);
  });

  it('一分钟内已写过活跃时间时只读不写', async () => {
    query.mockResolvedValueOnce([[sessionRow()]]);
    const session = await getSession('active');
    expect(session).toMatchObject({ user_id: 'session-owner', expires_in_seconds: 3_600 });
    expect(session).not.toHaveProperty('touch_due');
    expect(query).toHaveBeenCalledOnce();
  });

  it('到期写入时普通会话续一天，写入条件不复活已删除或过期的会话', async () => {
    query.mockResolvedValueOnce([[sessionRow({ user_id: 'renew-owner', touch_due: 1 })]]).mockResolvedValue([{}]);
    expect(await getSession('active')).toMatchObject({ user_id: 'renew-owner', expires_in_seconds: 86_400 });
    expect(updates()).toEqual([[expect.stringContaining('WHERE sid = ? AND expires_at > NOW()'), [86_400, 'active']]]);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE user SET last_active_time'))).toBe(true);
  });

  it('记住登录的会话到期写入时续七天', async () => {
    query
      .mockResolvedValueOnce([
        [
          sessionRow({
            user_id: 'remember-owner',
            touch_due: 1,
            create_time: new Date(Date.now() - 86_400_000),
            expires_at: new Date(Date.now() + 6 * 86_400_000),
            expires_in_seconds: 6 * 86_400,
          }),
        ],
      ])
      .mockResolvedValue([{}]);
    expect(await getSession('active')).toMatchObject({ expires_in_seconds: 604_800 });
    expect(updates()[0][1]).toEqual([604_800, 'active']);
  });

  it('剩余充足的普通会话到期写入时只更新活跃时间', async () => {
    query
      .mockResolvedValueOnce([
        [
          sessionRow({
            user_id: 'idle-owner',
            touch_due: 1,
            expires_at: new Date(Date.now() + 3 * 86_400_000),
            expires_in_seconds: 3 * 86_400,
          }),
        ],
      ])
      .mockResolvedValue([{}]);
    expect(await getSession('active')).toMatchObject({ expires_in_seconds: 3 * 86_400 });
    expect(updates()).toEqual([
      ['UPDATE user_sessions SET last_active_time = NOW() WHERE sid = ? AND expires_at > NOW()', ['active']],
    ]);
  });

  it('数据库中已撤销或过期的会话返回空并清理该行', async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ affectedRows: 0 }]);
    expect(await getSession('revoked')).toBeNull();
    expect(query).toHaveBeenLastCalledWith('DELETE FROM user_sessions WHERE sid = ?', ['revoked']);
    expect(updates()).toHaveLength(0);
  });

  it('数据库不可用时不放行', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    await expect(getSession('active')).rejects.toThrow('database unavailable');
  });
});
