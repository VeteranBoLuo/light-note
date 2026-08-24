import { describe, expect, it, vi } from 'vitest';
import { createAiGateway } from '../agent/aiGateway.js';
import { getActiveAiExecution } from './context.js';
import { runAiExecution } from './service.js';

function createPersistence() {
  return {
    insertAiExecution: vi.fn(),
    updateAiExecutionReservation: vi.fn(),
    insertAiProviderSpan: vi.fn(),
    settleAiExecution: vi.fn(),
  };
}

describe('aiExecution', () => {
  it('账号 AI 限制在根执行统一失败关闭，不依赖业务 URL 且不触发额度或 Provider', async () => {
    const persistence = createPersistence();
    const quota = { reserve: vi.fn(), reconcile: vi.fn() };
    const operation = vi.fn();

    await expect(
      runAiExecution(
        {
          requestId: 'd633795a-a47c-46ce-8ab2-652836db5a83',
          request: {
            user: { id: 'u1', role: 'user' },
            securityRestrictions: [{ restriction_type: 'ai_lock' }],
            headers: {},
            body: {},
          },
          taskType: 'note.summarize',
          surface: 'note_detail',
          persistence,
        },
        operation,
        { quota },
      ),
    ).rejects.toMatchObject({ code: 'AI_ACCESS_RESTRICTED', status: 403 });

    expect(operation).not.toHaveBeenCalled();
    expect(quota.reserve).not.toHaveBeenCalled();
    expect(quota.reconcile).not.toHaveBeenCalled();
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      errorCode: 'AI_ACCESS_RESTRICTED',
      providerCallCount: 0,
    });
  });

  it('缓存命中或确定性动作不访问 Provider 时不占位，也不会被模型额度拦截', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: true, reserved: 0, reservationKey: 'unused' }),
      reconcile: vi.fn(),
    };

    await expect(
      runAiExecution(
        {
          requestId: '2394cf3b-bb27-40fb-a1af-e5ce89c48c99',
          request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
          taskType: 'cached_result',
          surface: 'test',
          persistence,
        },
        async () => ({ cached: true }),
        { quota },
      ),
    ).resolves.toEqual({ cached: true });

    expect(quota.reserve).not.toHaveBeenCalled();
    expect(quota.reconcile).not.toHaveBeenCalled();
    expect(persistence.updateAiExecutionReservation).not.toHaveBeenCalled();
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      providerCallCount: 0,
      chargedTokens: 0,
      quotaSettlementStatus: 'not_used',
      status: 'success',
    });
  });

  it('一次用户动作只占位和结算一次，并累计所有 Provider Span', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5000, reservationKey: 'r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const completeClient = vi
      .fn()
      .mockResolvedValueOnce({
        content: '第一步',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        usageStatus: 'reported',
        provider: 'deepseek',
        model: 'test',
      })
      .mockResolvedValueOnce({
        content: '第二步',
        usage: { promptTokens: 20, completionTokens: 7, totalTokens: 27 },
        usageStatus: 'reported',
        provider: 'deepseek',
        model: 'test',
      });
    const gateway = createAiGateway({ completeClient, streamClient: vi.fn() });

    const output = await runAiExecution(
      {
        requestId: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
        request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
        taskType: 'skill_test',
        skillId: 'file.summarize',
        skillVersion: 1,
        surface: 'test',
        persistence,
      },
      async () => {
        expect(getActiveAiExecution()?.skillId).toBe('file.summarize');
        await gateway.complete([], { trace: { stage: 'draft' } });
        return (await gateway.complete([], { trace: { stage: 'repair' } })).content;
      },
      { quota },
    );

    expect(output).toBe('第二步');
    expect(quota.reserve).toHaveBeenCalledOnce();
    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 42, { aborted: false });
    expect(persistence.insertAiProviderSpan).toHaveBeenCalledTimes(2);
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      providerCallCount: 2,
      usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42 },
      chargedTokens: 42,
      status: 'success',
    });
  });

  it('并发 Provider 子调用共享第一次懒占位，额度拒绝发生在任何模型请求之前', async () => {
    const persistence = createPersistence();
    const blockedQuota = {
      reserve: vi.fn().mockResolvedValue({ blocked: true, reserved: 0, reservationKey: 'blocked' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const blockedClient = vi.fn();
    const blockedGateway = createAiGateway({ completeClient: blockedClient, streamClient: vi.fn() });

    await expect(
      runAiExecution(
        {
          requestId: '566af6c7-c717-4977-9526-0657279200b5',
          request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
          taskType: 'blocked_provider',
          persistence,
        },
        () => Promise.all([blockedGateway.complete([]), blockedGateway.complete([]), blockedGateway.complete([])]),
        { quota: blockedQuota },
      ),
    ).rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED', status: 429 });

    expect(blockedQuota.reserve).toHaveBeenCalledOnce();
    expect(blockedClient).not.toHaveBeenCalled();
    expect(persistence.insertAiProviderSpan).not.toHaveBeenCalled();
    expect(persistence.settleAiExecution.mock.calls.at(-1)[0]).toMatchObject({
      providerCallCount: 0,
      status: 'quota_blocked',
    });
  });

  it('usage 缺失时按每个缺失 Span 保守结算', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5000, reservationKey: 'r2' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const gateway = createAiGateway({
      completeClient: vi.fn().mockResolvedValue({ content: 'ok', usage: {}, usageStatus: 'missing' }),
      streamClient: vi.fn(),
    });
    await runAiExecution(
      {
        requestId: '56dfd9c9-2e78-4e06-97b8-398f6d0d08ab',
        request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
        taskType: 'missing_usage',
        persistence,
      },
      async () => {
        await gateway.complete([]);
        await gateway.complete([]);
      },
      { quota },
    );
    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 10_000, { aborted: false });
  });

  it('声明不扣模型额度的执行不能访问 Provider，防止免费策略绕过统一额度', async () => {
    const persistence = createPersistence();
    const quota = { reserve: vi.fn(), reconcile: vi.fn() };
    const completeClient = vi.fn();
    const gateway = createAiGateway({ completeClient, streamClient: vi.fn() });

    await expect(
      runAiExecution(
        {
          requestId: '7b98c61f-eaa8-48b4-bfff-fc24acc2f247',
          billingPolicy: 'none',
          billingReason: 'deterministic_cache_hit',
          taskType: 'cached_result',
          surface: 'test',
          persistence,
        },
        () => gateway.complete([], { trace: { stage: 'forbidden_provider' } }),
        { quota },
      ),
    ).rejects.toMatchObject({ code: 'AI_EXECUTION_PROVIDER_NOT_BILLABLE', status: 500 });

    expect(completeClient).not.toHaveBeenCalled();
    expect(quota.reserve).not.toHaveBeenCalled();
    expect(quota.reconcile).not.toHaveBeenCalled();
    expect(persistence.insertAiProviderSpan).not.toHaveBeenCalled();
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      billingPolicy: 'none',
      providerCallCount: 0,
      chargedTokens: 0,
      status: 'failed',
      errorCode: 'AI_EXECUTION_PROVIDER_NOT_BILLABLE',
    });
  });
});
