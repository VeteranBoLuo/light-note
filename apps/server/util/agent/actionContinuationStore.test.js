import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = {
  setEx: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
};
vi.mock('../redisClient.js', () => ({ default: redis }));

const {
  claimActionContinuation,
  completeActionContinuation,
  createActionContinuation,
  finalizeActionContinuation,
  inspectActionContinuation,
  rebindActionContinuation,
  settleActionContinuation,
} = await import('./actionContinuationStore.js');

const ownerKey = 'user:user-1';
const sessionId = 'session-1';
const initialAction = { kind: 'interaction', id: 'interaction-1' };
let storedRaw = '';

function installRedisState() {
  redis.setEx.mockImplementation(async (_key, _ttl, raw) => {
    storedRaw = raw;
    return 'OK';
  });
  redis.get.mockImplementation(async () => storedRaw || null);
  redis.eval.mockImplementation(async (_script, options) => {
    if (options.arguments[0] !== storedRaw) return 0;
    storedRaw = options.arguments[1];
    return 1;
  });
  redis.del.mockImplementation(async () => {
    storedRaw = '';
    return 1;
  });
}

async function issue(action = initialAction, policy = 'final_reply') {
  return createActionContinuation({
    ownerKey,
    sessionId,
    action,
    policy,
    snapshot: { question: '找到待办后把它设为已完成', locale: 'zh-CN', originRequestId: 'request-1' },
  });
}

describe('agent actionContinuationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedRaw = '';
    installRedisState();
  });

  it('仅保存 token 摘要，并绑定 owner、session 与动作', async () => {
    const continuation = await issue();
    const [key, ttl, raw] = redis.setEx.mock.calls[0];

    expect(continuation).toMatchObject({ schemaVersion: 1, policy: 'final_reply' });
    expect(continuation.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(key).toMatch(/^agent:action-continuation:[0-9a-f]{64}$/);
    expect(key).not.toContain(continuation.token);
    expect(ttl).toBe(15 * 60);
    expect(JSON.parse(raw)).toMatchObject({
      state: 'pending',
      sessionId,
      action: initialAction,
      snapshotReady: false,
    });
  });

  it('动作完成前不能续答，跨 owner 与跨 session 均失败关闭', async () => {
    const continuation = await issue();

    await expect(inspectActionContinuation(continuation.token, ownerKey, sessionId)).rejects.toMatchObject({
      code: 'ACTION_CONTINUATION_PENDING',
      status: 409,
    });
    await expect(inspectActionContinuation(continuation.token, 'user:other', sessionId)).rejects.toMatchObject({
      code: 'ACTION_CONTINUATION_FORBIDDEN',
      status: 403,
    });
    await expect(inspectActionContinuation(continuation.token, ownerKey, 'other-session')).rejects.toMatchObject({
      code: 'ACTION_CONTINUATION_FORBIDDEN',
      status: 403,
    });
  });

  it('未显式声明 Final Reply 时按 terminal 失败关闭', async () => {
    const action = { kind: 'confirmation', id: 'confirmation-terminal' };
    const continuation = await createActionContinuation({
      ownerKey,
      sessionId,
      action,
      snapshot: { question: '创建一条待办', locale: 'zh-CN' },
    });
    await finalizeActionContinuation({
      token: continuation.token,
      ownerKey,
      sessionId,
      action,
      snapshot: { question: '创建一条待办', locale: 'zh-CN' },
    });

    expect(continuation.policy).toBe('terminal');
    await expect(
      completeActionContinuation({
        token: continuation.token,
        ownerKey,
        sessionId,
        action,
        outcome: {
          receipt: {
            actionId: action.id,
            capabilityId: 'todo.create',
            toolName: 'create_todo',
            status: 'succeeded',
            summary: '待办已创建',
            completedAt: new Date().toISOString(),
          },
        },
      }),
    ).resolves.toBeNull();
    expect(JSON.parse(storedRaw)).toMatchObject({ state: 'pending', policy: 'terminal' });
  });

  it('选择卡晋级确认卡后只接受新动作的权威成功回执', async () => {
    const continuation = await issue();
    await finalizeActionContinuation({
      token: continuation.token,
      ownerKey,
      sessionId,
      action: initialAction,
      snapshot: {
        question: '找到待办后把它设为已完成',
        locale: 'zh-CN',
        originRequestId: 'request-1',
        tools: [{ name: 'search_todo', status: 'success', summary: '找到一条待办' }],
      },
    });
    const promotedAction = { kind: 'confirmation', id: 'confirmation-1' };
    await rebindActionContinuation({
      token: continuation.token,
      ownerKey,
      sessionId,
      fromAction: initialAction,
      toAction: promotedAction,
    });

    await expect(
      completeActionContinuation({
        token: continuation.token,
        ownerKey,
        sessionId,
        action: initialAction,
        outcome: {},
      }),
    ).rejects.toMatchObject({ code: 'ACTION_CONTINUATION_FORBIDDEN' });

    await expect(
      completeActionContinuation({
        token: continuation.token,
        ownerKey,
        sessionId,
        action: promotedAction,
        outcome: {
          receipt: {
            actionId: promotedAction.id,
            capabilityId: 'todo.status.set',
            toolName: 'set_todo_status',
            status: 'succeeded',
            summary: '待办已完成',
            completedAt: new Date().toISOString(),
          },
        },
      }),
    ).resolves.toMatchObject({ policy: 'final_reply' });

    expect(JSON.parse(storedRaw)).toMatchObject({
      state: 'ready',
      action: promotedAction,
      outcome: { receipt: { status: 'succeeded', toolName: 'set_todo_status' } },
    });
  });

  it('续答原子认领并缓存最终答案，重试只回放而不要求再次调用模型', async () => {
    const action = { kind: 'confirmation', id: 'confirmation-1' };
    const continuation = await issue(action);
    await finalizeActionContinuation({
      token: continuation.token,
      ownerKey,
      sessionId,
      action,
      snapshot: { question: '创建一条待办并告诉我结果', locale: 'zh-CN' },
    });
    await completeActionContinuation({
      token: continuation.token,
      ownerKey,
      sessionId,
      action,
      outcome: {
        receipt: {
          actionId: action.id,
          capabilityId: 'todo.create',
          toolName: 'create_todo',
          status: 'succeeded',
          summary: '待办“检查方案”已创建',
          completedAt: new Date().toISOString(),
        },
      },
    });

    const ready = await inspectActionContinuation(continuation.token, ownerKey, sessionId);
    const claimed = await claimActionContinuation(ready.continuation);
    await settleActionContinuation(claimed, {
      answer: '待办“检查方案”已经创建完成。',
      usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 },
    });

    await expect(inspectActionContinuation(continuation.token, ownerKey, sessionId)).resolves.toMatchObject({
      state: 'settled',
      continuation: {
        answer: '待办“检查方案”已经创建完成。',
        usage: { totalTokens: 28 },
      },
    });
  });
});
