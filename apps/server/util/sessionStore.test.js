import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const getConnection = vi.fn();
const redisDel = vi.fn();
const redisGet = vi.fn();
const redisSet = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query, getConnection } }));
vi.mock('./redisClient.js', () => ({
  default: { get: redisGet, expire: vi.fn(), setEx: redisSet, del: redisDel },
}));

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
  it('同一稳定设备再次登录时原子替换旧 session，并驱逐旧 Redis 缓存', async () => {
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
    expect(redisDel).toHaveBeenCalledWith(['session:old-sid-a', 'session:old-sid-b']);
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
  it('同时删除数据库会话与所有设备的 Redis 缓存', async () => {
    query
      .mockReset()
      .mockResolvedValueOnce([[{ sid: 'desktop-sid' }, { sid: 'android-sid' }]])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);
    redisDel.mockResolvedValue(2);
    await removeUserSessions('password-user');
    expect(query).toHaveBeenCalledWith('DELETE FROM user_sessions WHERE user_id = ?', ['password-user']);
    expect(redisDel).toHaveBeenCalledWith(['session:desktop-sid', 'session:android-sid']);
  });
});

describe('撤销会话的数据库事实优先于缓存', () => {
  const cached = () => ({
    user_id: 'cached-owner',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    create_time: new Date().toISOString(),
  });
  beforeEach(() => {
    query.mockReset();
    redisGet.mockReset().mockImplementation(async () => JSON.stringify(cached()));
    redisSet.mockReset().mockResolvedValue('OK');
    redisDel.mockReset().mockResolvedValue(1);
  });
  it('缓存删除失败后重复请求也不能使用已撤销会话', async () => {
    query.mockImplementation(async (sql) => (sql.startsWith('SELECT') ? [[]] : [{ affectedRows: 0 }]));
    redisDel.mockRejectedValue(new Error('unavailable'));
    expect(await getSession('revoked')).toBeNull();
    expect(await getSession('revoked')).toBeNull();
    expect(redisSet).not.toHaveBeenCalled();
    expect(query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE user_sessions'))).toHaveLength(2);
  });
  it('缓存命中也要等数据库验证完成才返回身份', async () => {
    let finish;
    query.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    query.mockResolvedValue([{ affectedRows: 1 }]);
    let returned = false;
    const reading = getSession('active').then((value) => {
      returned = true;
      return value;
    });
    await Promise.resolve();
    expect(returned).toBe(false);
    finish([{ affectedRows: 1 }]);
    expect(await reading).toMatchObject({ user_id: 'cached-owner', expires_in_seconds: 86_400 });
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining('AND user_id = ? AND expires_at > NOW()'),
      [86_400, 'active', 'cached-owner'],
    ]);
    expect(redisSet).toHaveBeenCalledWith('session:active', 900, expect.any(String));
  });
  it('数据库不可用时不凭缓存放行', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    await expect(getSession('active')).rejects.toThrow('database unavailable');
    expect(redisSet).not.toHaveBeenCalled();
  });
  it('同秒更新 affectedRows 为零时重读有效记录，不误退出正常用户', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ sid: 'active' }]]);
    expect(await getSession('active')).toMatchObject({ user_id: 'cached-owner' });
  });
  it('数据库已过期的会话不能凭未过期缓存续期', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    expect(await getSession('expired')).toBeNull();
    expect(redisSet).not.toHaveBeenCalled();
  });
});
