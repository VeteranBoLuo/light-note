import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  reserve: vi.fn(),
  reconcile: vi.fn(),
  getActiveProviderInfo: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ default: { query: mocks.poolQuery } }));
vi.mock('../aiQuota.js', () => ({ reserve: mocks.reserve, reconcile: mocks.reconcile }));
vi.mock('./deepseekClient.js', () => ({ getActiveProviderInfo: mocks.getActiveProviderInfo }));

const { beginAiGatewayGovernance, finishAiGatewayGovernance } = await import('./aiGatewayGovernance.js');

describe('AI Gateway entry governance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserve.mockResolvedValue({ blocked: false, reserved: 5000 });
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.poolQuery.mockResolvedValue([{}]);
    mocks.getActiveProviderInfo.mockReturnValue({
      provider: 'deepseek',
      model: 'test-model',
      price: { input: 1, output: 2 },
    });
  });

  it('用户入口以真实计费主体占位，并在完成后按真实 usage 结算和写无正文日志', async () => {
    const req = {
      billingUser: { id: 'actor-1', role: 'user', alias: '用户甲' },
      user: { id: 'subject-1', role: 'user' },
      headers: {},
      body: { privateText: '绝不记录的正文' },
    };
    const state = await beginAiGatewayGovernance({
      governance: { request: req, quotaPolicy: 'user', taskType: 'bookmark_summary' },
      traceId: 'trace-user-1',
      taskType: 'bookmark_summary',
      startedAt: Date.now(),
    });
    await finishAiGatewayGovernance({
      state,
      result: {
        content: '模型私密回答',
        provider: 'deepseek',
        model: 'test-model',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        usageStatus: 'reported',
        finishReason: 'stop',
      },
    });

    expect(mocks.reserve).toHaveBeenCalledWith(req, {
      userId: 'actor-1',
      userRole: 'user',
      requestId: 'trace-user-1',
    });
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.any(Object), 15, { aborted: false });
    const logged = mocks.poolQuery.mock.calls.flat(2).join(' ');
    expect(logged).toContain('trace-user-1');
    expect(logged).toContain('bookmark_summary AI 请求，正文不写入日志');
    expect(logged).not.toContain('绝不记录的正文');
    expect(logged).not.toContain('模型私密回答');
  });

  it('后台入口必须显式使用独立系统身份，并按缺失 usage 保守结算占位', async () => {
    const state = await beginAiGatewayGovernance({
      governance: { quotaPolicy: 'system', systemId: 'follow_up', taskType: 'follow_up' },
      traceId: 'trace-system-1',
      taskType: 'follow_up',
      startedAt: Date.now(),
    });
    await finishAiGatewayGovernance({ state, result: { usageStatus: 'missing' } });

    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ ip: 'ai-gateway-system' }), {
      userId: 'system:follow_up',
      userRole: 'user',
      requestId: 'trace-system-1',
    });
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.any(Object), 5000, { aborted: false });
  });

  it('额度不足时在 Provider 调用前返回稳定错误并记录 quota_blocked', async () => {
    mocks.reserve.mockResolvedValueOnce({ blocked: true, used: 100_000, quota: 100_000 });

    await expect(
      beginAiGatewayGovernance({
        governance: {
          request: { user: { id: 'user-1', role: 'user' }, headers: {}, body: {} },
          quotaPolicy: 'user',
          taskType: 'organize_note_tags',
        },
        traceId: 'trace-blocked',
        taskType: 'organize_note_tags',
        startedAt: Date.now(),
      }),
    ).rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED', status: 429 });
    expect(mocks.poolQuery.mock.calls.flat(2).join(' ')).toContain('quota_blocked');
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('无请求上下文时禁止隐式猜测身份策略', async () => {
    await expect(
      beginAiGatewayGovernance({
        governance: { taskType: 'unknown_background' },
        traceId: 'trace-invalid',
        taskType: 'unknown_background',
        startedAt: Date.now(),
      }),
    ).rejects.toMatchObject({ code: 'AI_GOVERNANCE_POLICY_REQUIRED' });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
