import { describe, expect, it, vi } from 'vitest';

const redis = {
  on: vi.fn(),
  get: vi.fn().mockResolvedValue(null),
  setEx: vi.fn().mockResolvedValue('OK'),
};
vi.mock('../redisClient.js', () => ({ default: redis }));

const {
  getOrCreateSession,
  getSessionId,
  recordPendingActionBatch,
  recordTurn,
  resolveSessionActionRetry,
  settleSessionAction,
} = await import('./sessionStore.js');

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

  it('取消动作只能以公开参数重新准备，且成功状态不可被后到取消覆盖', async () => {
    const session = await getOrCreateSession('user:u5', '');
    await recordPendingActionBatch(session, {
      batchId: 'batch-1',
      actions: [
        {
          confirmationId: 'confirm-1',
          toolName: 'set_todo_status',
          retryArgs: { keyword: '测试待办', status: 'completed' },
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    });
    expect(resolveSessionActionRetry(session)).toMatchObject({ state: 'pending' });

    await settleSessionAction({
      ownerKey: 'user:u5',
      sessionId: session.id,
      confirmationId: 'confirm-1',
      state: 'cancelled',
    });
    expect(resolveSessionActionRetry(session)).toMatchObject({
      state: 'retryable',
      action: {
        toolName: 'set_todo_status',
        retryArgs: { keyword: '测试待办', status: 'completed' },
      },
    });

    await settleSessionAction({
      ownerKey: 'user:u5',
      sessionId: session.id,
      confirmationId: 'confirm-1',
      state: 'succeeded',
      summary: '已完成',
    });
    await settleSessionAction({
      ownerKey: 'user:u5',
      sessionId: session.id,
      confirmationId: 'confirm-1',
      state: 'cancelled',
    });
    expect(resolveSessionActionRetry(session)).toMatchObject({ state: 'succeeded' });
  });

  it('同一轮存在多个可重试动作时不猜测目标', async () => {
    const session = await getOrCreateSession('user:u6', '');
    await recordPendingActionBatch(session, {
      batchId: 'batch-2',
      actions: [
        {
          confirmationId: 'confirm-a',
          toolName: 'create_note',
          retryArgs: { title: 'A' },
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
        },
        {
          confirmationId: 'confirm-b',
          toolName: 'add_tag',
          retryArgs: { tagName: 'B' },
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
        },
      ],
    });
    expect(resolveSessionActionRetry(session)).toEqual({ state: 'ambiguous', count: 2 });
  });
});
