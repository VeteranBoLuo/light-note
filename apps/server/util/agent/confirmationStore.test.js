import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = {
  setEx: vi.fn(),
  get: vi.fn(),
  getDel: vi.fn(),
  del: vi.fn(),
};
vi.mock('../redisClient.js', () => ({ default: redis }));

const {
  createToolConfirmation,
  consumeToolConfirmation,
  ToolConfirmationError,
} = await import('./confirmationStore.js');

describe('agent confirmationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.setEx.mockResolvedValue('OK');
  });

  it('签发短时一次性令牌且 Redis 不保存明文 token', async () => {
    const result = await createToolConfirmation({
      ownerKey: 'user:u1',
      sessionId: 'session-1',
      toolName: 'create_note',
      args: { title: '测试' },
      context: { resourceUserId: 'u1', resourceUserRole: 'user' },
    });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const [key, ttl, raw] = redis.setEx.mock.calls[0];
    expect(key).toMatch(/^agent:confirm:[0-9a-f]{64}$/);
    expect(key).not.toContain(result.token);
    expect(ttl).toBe(300);
    expect(JSON.parse(raw).toolName).toBe('create_note');
  });

  it('消费时校验 owner 且使用 GETDEL 保证一次性', async () => {
    const issued = await createToolConfirmation({
      ownerKey: 'user:u2',
      sessionId: 'session-2',
      toolName: 'create_note',
      args: {},
      context: { resourceUserId: 'u2', resourceUserRole: 'user' },
    });
    const stored = redis.setEx.mock.calls[0][2];
    redis.get.mockResolvedValue(stored);
    redis.getDel.mockResolvedValue(stored);
    await expect(consumeToolConfirmation(issued.token, 'user:u2', 'session-2')).resolves.toMatchObject({ toolName: 'create_note' });
    expect(redis.getDel).toHaveBeenCalledTimes(1);
  });

  it('过期和跨 owner 都失败关闭', async () => {
    redis.get.mockResolvedValueOnce(null);
    await expect(consumeToolConfirmation('expired', 'user:u1', 'session-1')).rejects.toBeInstanceOf(ToolConfirmationError);

    redis.get.mockResolvedValueOnce(JSON.stringify({ ownerHash: 'wrong' }));
    await expect(consumeToolConfirmation('foreign', 'user:u1', 'session-1')).rejects.toMatchObject({
      code: 'TOOL_CONFIRMATION_FORBIDDEN',
    });
  });

  it('参数摘要被篡改时拒绝且不消费令牌', async () => {
    const issued = await createToolConfirmation({
      ownerKey: 'user:u3',
      sessionId: 'session-3',
      toolName: 'create_note',
      args: { title: '原始标题' },
      context: { resourceUserId: 'u3', resourceUserRole: 'user' },
    });
    const stored = JSON.parse(redis.setEx.mock.calls[0][2]);
    stored.args.title = '被篡改';
    redis.get.mockResolvedValue(JSON.stringify(stored));
    await expect(consumeToolConfirmation(issued.token, 'user:u3', 'session-3')).rejects.toMatchObject({
      code: 'TOOL_CONFIRMATION_INVALID',
    });
    expect(redis.getDel).not.toHaveBeenCalled();
  });

  it('Redis 不支持原子 GETDEL 时失败关闭', async () => {
    const getDel = redis.getDel;
    try {
      redis.getDel = undefined;
      await expect(consumeToolConfirmation('token', 'user:u1', 'session-1')).rejects.toMatchObject({
        code: 'TOOL_CONFIRMATION_UNAVAILABLE',
        status: 503,
      });
    } finally {
      redis.getDel = getDel;
    }
  });

  it('确认令牌只能在签发会话内消费', async () => {
    const issued = await createToolConfirmation({
      ownerKey: 'user:u4',
      sessionId: 'session-4',
      toolName: 'create_note',
      args: {},
      context: { resourceUserId: 'u4', resourceUserRole: 'user' },
    });
    const stored = redis.setEx.mock.calls[0][2];
    redis.get.mockResolvedValue(stored);
    await expect(consumeToolConfirmation(issued.token, 'user:u4', 'other-session')).rejects.toMatchObject({
      code: 'TOOL_CONFIRMATION_FORBIDDEN',
    });
    expect(redis.getDel).not.toHaveBeenCalled();
  });
});
