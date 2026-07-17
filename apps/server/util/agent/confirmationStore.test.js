import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const redis = {
  set: vi.fn(),
  setEx: vi.fn(),
  get: vi.fn(),
  getDel: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
};
vi.mock('../redisClient.js', () => ({ default: redis }));

const {
  acquireToolConfirmationAction,
  claimToolConfirmationExecution,
  createToolConfirmation,
  consumeToolConfirmation,
  finalizeToolConfirmationAction,
  inspectToolConfirmationExecution,
  rejectToolConfirmation,
  settleToolConfirmationExecution,
  ToolConfirmationError,
} = await import('./confirmationStore.js');

describe('agent confirmationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.set.mockResolvedValue('OK');
    redis.setEx.mockResolvedValue('OK');
    redis.eval.mockResolvedValue(1);
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

  it('笔记创建的动作幂等键跨确认令牌保持稳定，其他写操作不改变既有语义', async () => {
    const input = {
      ownerKey: 'user:u1',
      sessionId: 'session-1',
      toolName: 'create_note',
      args: { title: '测试', content: '正文', type: 'markdown' },
      context: { resourceUserId: 'u1', resourceUserRole: 'user' },
    };
    await createToolConfirmation(input);
    await createToolConfirmation(input);
    await createToolConfirmation({ ...input, sessionId: 'session-2' });
    await createToolConfirmation({ ...input, toolName: 'create_bookmark', args: { url: 'https://example.com' } });

    const first = JSON.parse(redis.setEx.mock.calls[0][2]);
    const second = JSON.parse(redis.setEx.mock.calls[1][2]);
    const differentSession = JSON.parse(redis.setEx.mock.calls[2][2]);
    const bookmark = JSON.parse(redis.setEx.mock.calls[3][2]);
    expect(first.idempotencyKey).toMatch(/^agent-write-v1:[0-9a-f]{64}$/);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(differentSession.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(bookmark.idempotencyKey).toBeNull();
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
    await expect(consumeToolConfirmation(issued.token, 'user:u2', 'session-2')).resolves.toMatchObject({
      toolName: 'create_note',
    });
    expect(redis.getDel).toHaveBeenCalledTimes(1);
  });

  it('过期和跨 owner 都失败关闭', async () => {
    redis.get.mockResolvedValueOnce(null);
    await expect(consumeToolConfirmation('expired', 'user:u1', 'session-1')).rejects.toBeInstanceOf(
      ToolConfirmationError,
    );

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

  it('图片笔记签发阶段只保存动作锁键，不占用动作锁', async () => {
    const input = {
      ownerKey: 'user:u5',
      sessionId: 'session-5',
      toolName: 'create_image_note',
      args: { attachmentId: 'attachment-1', title: '头像' },
      context: { resourceUserId: 'u5', resourceUserRole: 'user' },
    };
    await createToolConfirmation(input);
    await createToolConfirmation(input);

    const first = JSON.parse(redis.setEx.mock.calls[0][2]);
    const second = JSON.parse(redis.setEx.mock.calls[1][2]);
    expect(first.actionLockKey).toMatch(/^agent:action-lock:[0-9a-f]{64}$/);
    expect(second.actionLockKey).toBe(first.actionLockKey);
    expect(second.id).not.toBe(first.id);
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.setEx).toHaveBeenCalledTimes(2);
  });

  it('图片笔记只在执行前获取 NX 动作锁，并阻止并发确认', async () => {
    const input = {
      ownerKey: 'user:u5',
      sessionId: 'session-5',
      toolName: 'create_image_note',
      args: { attachmentId: 'attachment-1', title: '头像' },
      context: { resourceUserId: 'u5', resourceUserRole: 'user' },
    };
    await createToolConfirmation(input);
    await createToolConfirmation(input);
    const first = JSON.parse(redis.setEx.mock.calls[0][2]);
    const second = JSON.parse(redis.setEx.mock.calls[1][2]);

    await expect(acquireToolConfirmationAction(first)).resolves.toBe(true);
    redis.set.mockResolvedValueOnce(null);
    await expect(acquireToolConfirmationAction(second)).rejects.toMatchObject({
      code: 'TOOL_ACTION_PENDING',
      status: 409,
    });

    expect(redis.set.mock.calls[0]).toEqual([first.actionLockKey, first.id, { NX: true, EX: 360 }]);
    expect(redis.set.mock.calls[1]).toEqual([first.actionLockKey, second.id, { NX: true, EX: 360 }]);
  });

  it('图片笔记动作锁按资源账号隔离，跨账号附件 ID 相同也互不影响', async () => {
    await createToolConfirmation({
      ownerKey: 'user:u6',
      sessionId: 'session-6',
      toolName: 'create_image_note',
      args: { attachmentId: 'same-id' },
      context: { resourceUserId: 'u6', resourceUserRole: 'user' },
    });
    await createToolConfirmation({
      ownerKey: 'user:u7',
      sessionId: 'session-7',
      toolName: 'create_image_note',
      args: { attachmentId: 'same-id' },
      context: { resourceUserId: 'u7', resourceUserRole: 'user' },
    });

    const first = JSON.parse(redis.setEx.mock.calls[0][2]);
    const second = JSON.parse(redis.setEx.mock.calls[1][2]);
    await acquireToolConfirmationAction(first);
    await acquireToolConfirmationAction(second);

    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.set.mock.calls[0][0]).not.toBe(redis.set.mock.calls[1][0]);
  });

  it('拒绝图片笔记确认只消费令牌，不创建或释放动作锁', async () => {
    const issued = await createToolConfirmation({
      ownerKey: 'user:u8',
      sessionId: 'session-8',
      toolName: 'create_image_note',
      args: { attachmentId: 'attachment-8' },
      context: { resourceUserId: 'u8', resourceUserRole: 'user' },
    });
    const stored = redis.setEx.mock.calls[0][2];
    redis.get.mockResolvedValue(stored);
    redis.getDel.mockResolvedValue(stored);

    await rejectToolConfirmation(issued.token, 'user:u8', 'session-8');

    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('maintain 确认按资源账号绑定，成功后保留短时冷却锁', async () => {
    const issued = await createToolConfirmation({
      ownerKey: 'admin:root-1:visitor-target',
      sessionId: 'session-maintain',
      toolName: 'create_image_note',
      args: { attachmentId: 'attachment-maintain' },
      context: {
        resourceUserId: 'visitor-target',
        resourceUserRole: 'visitor',
        adminContextId: 'admin-context-1',
        adminMode: 'maintain',
      },
    });
    const stored = redis.setEx.mock.calls[0][2];
    const parsed = JSON.parse(stored);
    redis.get.mockResolvedValueOnce(stored);
    redis.getDel.mockResolvedValueOnce(stored);
    const confirmation = await consumeToolConfirmation(issued.token, 'admin:root-1:visitor-target', 'session-maintain');
    await acquireToolConfirmationAction(confirmation);

    await finalizeToolConfirmationAction(confirmation, { succeeded: true });

    expect(confirmation).toMatchObject({
      resourceUserId: 'visitor-target',
      adminContextId: 'admin-context-1',
      adminMode: 'maintain',
    });
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('GET', KEYS[1]) ~= ARGV[1]"), {
      keys: [parsed.actionLockKey],
      arguments: [parsed.id, 'expire', '300'],
    });
  });

  it('执行失败只释放当前确认自己持有的动作锁', async () => {
    const input = {
      ownerKey: 'user:u9',
      sessionId: 'session-9',
      toolName: 'create_image_note',
      args: { attachmentId: 'attachment-9' },
      context: { resourceUserId: 'u9', resourceUserRole: 'user' },
    };
    await createToolConfirmation(input);
    await createToolConfirmation(input);
    const owner = JSON.parse(redis.setEx.mock.calls[0][2]);
    const other = JSON.parse(redis.setEx.mock.calls[1][2]);
    await acquireToolConfirmationAction(owner);
    redis.eval.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    await finalizeToolConfirmationAction(other, { succeeded: false });
    await finalizeToolConfirmationAction(owner, { succeeded: false });

    expect(redis.eval).toHaveBeenCalledTimes(2);
    expect(redis.eval.mock.calls[0][1]).toEqual({
      keys: [owner.actionLockKey],
      arguments: [other.id, 'delete', '300'],
    });
    expect(redis.eval.mock.calls[1][1]).toEqual({
      keys: [owner.actionLockKey],
      arguments: [owner.id, 'delete', '300'],
    });
  });

  it('确认令牌落库失败时未曾占用图片动作锁', async () => {
    redis.setEx.mockRejectedValueOnce(new Error('redis write failed'));

    await expect(
      createToolConfirmation({
        ownerKey: 'user:u9',
        sessionId: 'session-9',
        toolName: 'create_image_note',
        args: { attachmentId: 'attachment-9' },
        context: { resourceUserId: 'u9', resourceUserRole: 'user' },
      }),
    ).rejects.toThrow('redis write failed');

    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('用 token 摘要键原子认领执行，Redis 不保存明文 token', async () => {
    const issued = await createToolConfirmation({
      ownerKey: 'user:replay-1',
      sessionId: 'session-replay-1',
      toolName: 'create_note',
      args: { title: '可重试结果' },
      context: { resourceUserId: 'replay-1', resourceUserRole: 'user' },
    });
    const tokenRaw = redis.setEx.mock.calls[0][2];
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(tokenRaw);
    redis.eval.mockResolvedValueOnce(1);

    const inspected = await inspectToolConfirmationExecution(issued.token, 'user:replay-1', 'session-replay-1');
    const claimed = await claimToolConfirmationExecution(inspected.confirmation);

    expect(claimed.state).toBe('claimed');
    const claimCall = redis.eval.mock.calls[0][1];
    expect(claimCall.keys[0]).toMatch(/^agent:confirm:[0-9a-f]{64}$/);
    expect(claimCall.keys[1]).toMatch(/^agent:confirm-execution:[0-9a-f]{64}$/);
    expect(claimCall.keys.join('')).not.toContain(issued.token);
    expect(claimCall.arguments[1]).not.toContain(issued.token);
    expect(claimCall.arguments[2]).toBe('300');
  });

  it('成功结果短期缓存后，同一 token 回放相同 summary 和 sources', async () => {
    const issued = await createToolConfirmation({
      ownerKey: 'user:replay-2',
      sessionId: 'session-replay-2',
      toolName: 'create_image_note',
      args: { attachmentId: 'attachment-replay-2', title: '图片笔记' },
      context: { resourceUserId: 'replay-2', resourceUserRole: 'user' },
    });
    const tokenRaw = redis.setEx.mock.calls[0][2];
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(tokenRaw);
    redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const inspected = await inspectToolConfirmationExecution(issued.token, 'user:replay-2', 'session-replay-2');
    const claimed = await claimToolConfirmationExecution(inspected.confirmation);
    const outcome = {
      httpStatus: 200,
      data: {
        toolName: 'create_image_note',
        summary: '图片笔记已创建',
        sources: [{ type: 'note', id: 'note-1', title: '图片笔记' }],
      },
      message: '',
    };
    await settleToolConfirmationExecution(claimed.confirmation, outcome);
    const settledRaw = redis.eval.mock.calls[1][1].arguments[1];
    redis.get.mockReset();
    redis.get.mockResolvedValueOnce(settledRaw);

    const replay = await inspectToolConfirmationExecution(issued.token, 'user:replay-2', 'session-replay-2');

    expect(replay).toMatchObject({
      state: 'settled',
      outcome: {
        httpStatus: 200,
        data: { summary: '图片笔记已创建', sources: [{ id: 'note-1' }] },
      },
    });
  });

  it('明确业务失败也短期缓存并原样回放，不再执行写操作', async () => {
    const issued = await createToolConfirmation({
      ownerKey: 'user:replay-failure',
      sessionId: 'session-replay-failure',
      toolName: 'create_note',
      args: { title: '重复标题' },
      context: { resourceUserId: 'replay-failure', resourceUserRole: 'user' },
    });
    const tokenRaw = redis.setEx.mock.calls[0][2];
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(tokenRaw);
    redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const inspected = await inspectToolConfirmationExecution(
      issued.token,
      'user:replay-failure',
      'session-replay-failure',
    );
    const claimed = await claimToolConfirmationExecution(inspected.confirmation);
    await settleToolConfirmationExecution(claimed.confirmation, {
      httpStatus: 400,
      data: { code: 'DUPLICATE_TITLE', toolName: 'create_note' },
      message: '笔记标题已存在。',
    });
    const settledRaw = redis.eval.mock.calls[1][1].arguments[1];
    redis.get.mockReset();
    redis.get.mockResolvedValueOnce(settledRaw);

    const replay = await inspectToolConfirmationExecution(
      issued.token,
      'user:replay-failure',
      'session-replay-failure',
    );

    expect(replay).toMatchObject({
      state: 'settled',
      outcome: {
        httpStatus: 400,
        data: { code: 'DUPLICATE_TITLE', toolName: 'create_note' },
        message: '笔记标题已存在。',
      },
    });
  });

  it('并发认领只有首个请求成功，后续请求读取 running 而不重复执行', async () => {
    const issued = await createToolConfirmation({
      ownerKey: 'user:replay-3',
      sessionId: 'session-replay-3',
      toolName: 'create_note',
      args: { title: '并发测试' },
      context: { resourceUserId: 'replay-3', resourceUserRole: 'user' },
    });
    const tokenRaw = redis.setEx.mock.calls[0][2];
    redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tokenRaw)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tokenRaw);
    const firstReady = await inspectToolConfirmationExecution(issued.token, 'user:replay-3', 'session-replay-3');
    const secondReady = await inspectToolConfirmationExecution(issued.token, 'user:replay-3', 'session-replay-3');
    redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const first = await claimToolConfirmationExecution(firstReady.confirmation);
    const runningRaw = redis.eval.mock.calls[0][1].arguments[1];
    redis.get.mockResolvedValueOnce(runningRaw);

    const second = await claimToolConfirmationExecution(secondReady.confirmation);

    expect(first.state).toBe('claimed');
    expect(second.state).toBe('running');
  });

  it('回放记录仍严格绑定 owner 和 session', async () => {
    const binding = {
      id: 'confirmation-bound',
      ownerHash: 'invalid-owner-hash',
      sessionId: 'session-bound',
      toolName: 'create_note',
      argsHash: 'args-hash',
      resourceUserId: 'bound-user',
      resourceUserRole: 'user',
      adminContextId: null,
      adminMode: null,
    };
    const execution = {
      state: 'running',
      binding,
      bindingHash: crypto.createHash('sha256').update(JSON.stringify(binding)).digest('hex'),
    };
    redis.get.mockResolvedValueOnce(JSON.stringify(execution));

    await expect(
      inspectToolConfirmationExecution('bound-token', 'user:other-user', 'session-bound'),
    ).rejects.toMatchObject({ code: 'TOOL_CONFIRMATION_FORBIDDEN' });
  });
});
