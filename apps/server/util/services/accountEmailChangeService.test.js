import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requestEmailChange,
  hasRecentGithubAuthentication,
  rememberRecentGithubAuthentication,
} from './accountEmailChangeService.js';
const user = {
  id: 'owner',
  email: 'old@example.com',
  password: 'hash',
  login_password_set: 1,
  github_id: '123',
  role: 'user',
  del_flag: 0,
};
let db, redis, send, verify, values;
beforeEach(() => {
  values = new Map();
  db = { query: vi.fn().mockImplementation(async (sql) => (sql.startsWith('SELECT *') ? [[{ ...user }]] : [[]])) };
  redis = {
    get: vi.fn(async (key) => values.get(key)),
    setEx: vi.fn(async (key, _ttl, value) => {
      values.set(key, value);
      return 'OK';
    }),
    set: vi.fn().mockResolvedValue('OK'),
    eval: vi.fn().mockResolvedValue(1),
  };
  send = vi.fn().mockResolvedValue({});
  verify = vi.fn().mockResolvedValue(true);
});
const request = (input = {}) =>
  requestEmailChange(
    { userId: 'owner', sid: 'current-session', email: 'new@example.com', oldPassword: 'current-password', ...input },
    { db, redis, send, verify },
  );
describe('安全更换邮箱发送', () => {
  it('先验证原账号身份，只给新邮箱发送用途隔离的验证码', async () => {
    const result = await request();
    expect(verify).toHaveBeenCalledWith('current-password', 'hash');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'new@example.com',
        emailType: 'email_change',
        businessType: 'email_change',
      }),
    );
    expect(result).toMatchObject({ maskedEmail: 'ne***@example.com', expiresIn: 300 });
    const [key, ttl, raw] = redis.setEx.mock.calls[0];
    expect(key).toMatch(/^account:email-change:/);
    expect(key).not.toContain('email:code:');
    expect(ttl).toBe(300);
    expect(JSON.parse(raw)).toMatchObject({ userId: 'owner', email: 'new@example.com', attempts: 0 });
    expect(JSON.parse(raw)).not.toHaveProperty('code');
    expect(JSON.parse(raw)).not.toHaveProperty('oldPassword');
  });
  it('原密码错误不发信，已关联 GitHub 本身不能替代验证', async () => {
    verify.mockResolvedValue(false);
    await expect(request()).rejects.toMatchObject({ code: 'EMAIL_CHANGE_IDENTITY_REQUIRED' });
    expect(send).not.toHaveBeenCalled();
  });
  it('近期 GitHub 证明限定同一会话和账号快照', async () => {
    await rememberRecentGithubAuthentication('current-session', user, { redis });
    expect(await hasRecentGithubAuthentication('current-session', user, { redis })).toBe(true);
    expect(await hasRecentGithubAuthentication('other-session', user, { redis })).toBe(false);
    expect(await hasRecentGithubAuthentication('current-session', { ...user, password: 'changed' }, { redis })).toBe(
      false,
    );
    await expect(request({ oldPassword: undefined })).resolves.toHaveProperty('challenge');
  });
  it('其他账号占用的新邮箱不会合并，也不会发信', async () => {
    db.query.mockResolvedValueOnce([[user]]).mockResolvedValueOnce([[{ id: 'other' }]]);
    await expect(request()).rejects.toMatchObject({ code: 'EMAIL_CHANGE_EMAIL_IN_USE' });
    expect(send).not.toHaveBeenCalled();
  });
  it('同邮箱、GitHub 占位地址及注入地址均拒绝', async () => {
    for (const email of ['OLD@example.com', '123@users.noreply.github.com', 'new@example.com\r\nBcc:other@example.com'])
      await expect(request({ email })).rejects.toHaveProperty('code');
    expect(send).not.toHaveBeenCalled();
  });
  it('同一账号发送有服务端冷却，换 IP 也不能跳过', async () => {
    redis.set.mockResolvedValue(null);
    await expect(request()).rejects.toMatchObject({ code: 'EMAIL_CHANGE_RATE_LIMITED' });
    expect(send).not.toHaveBeenCalled();
  });
  it('SMTP 发送失败不会留下可确认票据', async () => {
    send.mockRejectedValue(Object.assign(new Error(), { code: 'SMTP_FAILURE' }));
    await expect(request()).rejects.toHaveProperty('code', 'SMTP_FAILURE');
    expect(redis.setEx).not.toHaveBeenCalled();
    expect(redis.eval).toHaveBeenCalled();
  });
  it('停用账号不能发送，即使原密码正确', async () => {
    db.query.mockResolvedValue([[{ ...user, del_flag: 1 }]]);
    await expect(request()).rejects.toHaveProperty('code', 'EMAIL_CHANGE_ACCOUNT_UNAVAILABLE');
    expect(verify).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
