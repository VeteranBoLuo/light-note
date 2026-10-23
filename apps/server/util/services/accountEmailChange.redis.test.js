import { createClient } from 'redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { confirmEmailChange, requestEmailChange } from './accountEmailChangeService.js';
import { emailDigest } from './accountEmailPolicy.js';
const socket = process.env.LIGHTNOTE_TEST_REDIS_SOCKET;
describe.skipIf(!socket)('更换邮箱验证码原子协议（隔离 Redis）', () => {
  let redis, db, connection, user, code, send;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\/light-note-email-[^/]+\/redis\.sock$/.test(socket))
      throw new Error('Dedicated disposable Redis socket required');
    redis = createClient({ socket: { path: socket } });
    await redis.connect();
  });
  beforeEach(async () => {
    await redis.flushDb();
    user = {
      id: 'owner',
      email: 'old@example.com',
      password: 'hash',
      login_password_set: 1,
      role: 'user',
      del_flag: 0,
      github_id: null,
    };
    connection = {
      beginTransaction: vi.fn().mockResolvedValue(),
      commit: vi.fn().mockResolvedValue(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
      query: vi.fn(async (sql, params) => {
        if (sql.startsWith('SELECT * FROM user')) return [[{ ...user }]];
        if (sql.startsWith('UPDATE user')) {
          user.email = params[0];
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('SELECT sid')) return [[{ sid: 'session' }, { sid: 'other-device' }]];
        return [{ affectedRows: 1 }];
      }),
    };
    db = {
      query: vi.fn(async (sql) => (sql.startsWith('SELECT *') ? [[{ ...user }]] : [[]])),
      getConnection: vi.fn(async () => connection),
    };
    send = vi.fn(async ({ text }) => {
      code = text.match(/\d{6}/)[0];
    });
  });
  afterAll(async () => {
    if (redis?.isOpen) await redis.quit();
  });
  const request = () =>
    requestEmailChange(
      { userId: 'owner', sid: 'session', email: 'new@example.com', oldPassword: 'original' },
      { db, redis, send, verify: async () => true },
    );
  const confirm = (ticket, overrides = {}) =>
    confirmEmailChange(
      { userId: 'owner', sid: 'session', challenge: ticket.challenge, code, ...overrides },
      { db, redis },
    );
  const key = (ticket) => `account:email-change:${emailDigest(ticket.challenge)}`;
  it('正确验证码只使用一次，更换后删除旧会话缓存且保留密码', async () => {
    const ticket = await request();
    await redis.set('session:session', 'old cache');
    await redis.set('session:other-device', 'old cache');
    await expect(confirm(ticket)).resolves.toEqual({ email: 'new@example.com' });
    expect(user.password).toBe('hash');
    expect(await redis.exists('session:session', 'session:other-device')).toBe(0);
    await expect(confirm(ticket)).rejects.toHaveProperty('code', 'EMAIL_CHANGE_INVALID_CODE');
  });
  it('同一验证码并发提交只有一个能进入数据库事务', async () => {
    const ticket = await request();
    const result = await Promise.allSettled([confirm(ticket), confirm(ticket)]);
    expect(result.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(db.getConnection).toHaveBeenCalledOnce();
  });
  it('错误五次后作废，不因攻击重复请求延长验证码时间', async () => {
    const ticket = await request();
    const wrong = code === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++)
      await expect(confirm(ticket, { code: wrong })).rejects.toHaveProperty('code', 'EMAIL_CHANGE_INVALID_CODE');
    expect(await redis.exists(key(ticket))).toBe(0);
    await expect(confirm(ticket)).rejects.toHaveProperty('code', 'EMAIL_CHANGE_INVALID_CODE');
    expect(db.getConnection).not.toHaveBeenCalled();
  });
  it('另一会话或另一用户不能使用或消耗当前票据', async () => {
    const ticket = await request();
    await expect(confirm(ticket, { sid: 'attacker-session' })).rejects.toHaveProperty(
      'code',
      'EMAIL_CHANGE_INVALID_CODE',
    );
    await expect(confirm(ticket, { userId: 'attacker' })).rejects.toHaveProperty('code', 'EMAIL_CHANGE_INVALID_CODE');
    expect(JSON.parse(await redis.get(key(ticket))).attempts).toBe(0);
    await expect(confirm(ticket)).resolves.toHaveProperty('email', 'new@example.com');
  });
  it('到期票据与找回密码验证码均不能用于更换邮箱', async () => {
    const ticket = await request();
    await redis.set('email:code:new@example.com', code);
    await redis.expire(key(ticket), 0);
    await expect(confirm(ticket)).rejects.toHaveProperty('code', 'EMAIL_CHANGE_INVALID_CODE');
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(await redis.get('email:code:new@example.com')).toBe(code);
  });
  it('验证后改动原密码，旧票据不能更换邮箱', async () => {
    const ticket = await request();
    user.password = 'changed';
    await expect(confirm(ticket)).rejects.toHaveProperty('code', 'EMAIL_CHANGE_ACCOUNT_CHANGED');
    expect(user.email).toBe('old@example.com');
    expect(connection.commit).not.toHaveBeenCalled();
  });
  it('会话在验证码发出后被撤销，正确验证码也不能完成更换', async () => {
    const ticket = await request();
    const normal = connection.query.getMockImplementation();
    connection.query.mockImplementation(async (...args) =>
      args[0].includes('WHERE sid = ?') ? [[]] : normal(...args),
    );
    await expect(confirm(ticket)).rejects.toHaveProperty('code', 'EMAIL_CHANGE_IDENTITY_REQUIRED');
    expect(user.email).toBe('old@example.com');
    expect(connection.commit).not.toHaveBeenCalled();
  });
  it('数据库失败释放原子认领后可重试，不延长到期时间', async () => {
    const ticket = await request();
    await redis.expire(key(ticket), 30);
    const normal = connection.query.getMockImplementation();
    let failed = false;
    connection.query.mockImplementation(async (...args) => {
      if (!failed && args[0].startsWith('UPDATE user')) {
        failed = true;
        throw Object.assign(new Error(), { code: 'ER_LOCK_DEADLOCK' });
      }
      return normal(...args);
    });
    await expect(confirm(ticket)).rejects.toHaveProperty('code', 'EMAIL_CHANGE_BUSY');
    expect(await redis.ttl(key(ticket))).toBeLessThanOrEqual(30);
    await expect(confirm(ticket)).resolves.toHaveProperty('email', 'new@example.com');
  });
});
