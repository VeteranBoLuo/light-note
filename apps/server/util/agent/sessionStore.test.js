import { describe, expect, it, vi } from 'vitest';

const redis = {
  on: vi.fn(),
  get: vi.fn().mockResolvedValue(null),
  setEx: vi.fn().mockResolvedValue('OK'),
};
vi.mock('../redisClient.js', () => ({ default: redis }));

const { getOrCreateSession, getSessionId, recordTurn } = await import('./sessionStore.js');

describe('agent sessionStore', () => {
  it('新会话使用服务端 UUID，不接受客户端固定 ID', async () => {
    const session = await getOrCreateSession('user:u1', 'client-fixed-session');
    expect(getSessionId(session)).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    expect(getSessionId(session)).not.toBe('client-fixed-session');
  });

  it('同一 owner 可续用，会话 ID 不能跨 owner 读取', async () => {
    const first = await getOrCreateSession('user:u2', '');
    const continued = await getOrCreateSession('user:u2', first.id);
    const foreign = await getOrCreateSession('user:u3', first.id);
    expect(continued.id).toBe(first.id);
    expect(foreign.id).not.toBe(first.id);
  });

  it('Redis key 包含 owner 哈希与会话 ID，记录轮次后仍写回同一命名空间', async () => {
    redis.setEx.mockClear();
    const session = await getOrCreateSession('user:u4', '');
    await recordTurn(session, '问题', '回答', []);
    await vi.waitFor(() => expect(redis.setEx).toHaveBeenCalled());
    const keys = redis.setEx.mock.calls.map((call) => call[0]);
    expect(keys.every((key) => /^chat:sess:[0-9a-f]{64}:[0-9a-f-]{36}$/i.test(key))).toBe(true);
    expect(keys.every((key) => key.endsWith(session.id))).toBe(true);
  });
});
