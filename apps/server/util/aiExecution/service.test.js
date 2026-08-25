import { describe, expect, it, vi } from 'vitest';
import { createAiGateway } from '../agent/aiGateway.js';
import { getActiveAiExecution } from './context.js';
import { createAiProviderPlan } from './providerPlan.js';
import { runAiExecution } from './service.js';

function createPersistence() {
  return {
    insertAiExecution: vi.fn(),
    updateAiExecutionReservation: vi.fn(),
    renewAiExecutionLease: vi.fn(),
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

  it('最终没有可交付结果时记为失败、保留 Provider 用量，但退回用户额度', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5_000, reservationKey: 'outcome-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const gateway = createAiGateway({
      completeClient: vi.fn().mockResolvedValue({
        content: '',
        usage: { promptTokens: 12, completionTokens: 1, totalTokens: 13 },
        usageStatus: 'reported',
      }),
      streamClient: vi.fn(),
    });

    const output = await runAiExecution(
      {
        requestId: '36d68dd2-c1df-4acd-a8c1-b53b0e2db9f3',
        request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
        taskType: 'bookmark_summary',
        surface: 'bookmark_detail',
        persistence,
        resolveResultOutcome: (result) =>
          result?.ok === false ? { status: 'failed', errorCode: 'AI_SKILL_OUTPUT_EMPTY' } : null,
      },
      async () => {
        await gateway.complete([], { trace: { stage: 'bookmark_summary' } });
        return { ok: false, reason: 'empty', msg: '摘要生成失败' };
      },
      { quota },
    );

    expect(output).toEqual({ ok: false, reason: 'empty', msg: '摘要生成失败' });
    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 0, { aborted: false });
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      errorCode: 'AI_SKILL_OUTPUT_EMPTY',
      usage: { totalTokens: 13 },
      chargedTokens: 0,
    });
  });

  it('非协议类业务失败只要没有可交付结果，也退回用户额度', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5_000, reservationKey: 'business-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const gateway = createAiGateway({
      completeClient: vi.fn().mockResolvedValue({
        content: '模型已返回，但业务应用失败',
        usage: { promptTokens: 12, completionTokens: 1, totalTokens: 13 },
        usageStatus: 'reported',
      }),
      streamClient: vi.fn(),
    });

    await runAiExecution(
      {
        requestId: 'c6ab0d95-9dc0-4838-8647-f59f55a88330',
        request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
        taskType: 'bookmark_summary',
        surface: 'bookmark_detail',
        persistence,
        resolveResultOutcome: () => ({ status: 'failed', errorCode: 'BOOKMARK_SUMMARY_SAVE_FAILED' }),
      },
      async () => {
        await gateway.complete([], { trace: { stage: 'bookmark_summary' } });
        return { ok: false };
      },
      { quota },
    );

    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 0, { aborted: false });
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      errorCode: 'BOOKMARK_SUMMARY_SAVE_FAILED',
      usage: { totalTokens: 13 },
      chargedTokens: 0,
    });
  });

  it('批量动作部分完成时保留结果，并按已发生用量结算', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5_000, reservationKey: 'partial-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const gateway = createAiGateway({
      completeClient: vi.fn().mockResolvedValue({
        content: '部分可用结果',
        usage: { promptTokens: 12, completionTokens: 1, totalTokens: 13 },
        usageStatus: 'reported',
      }),
      streamClient: vi.fn(),
    });

    const output = await runAiExecution(
      {
        requestId: '32f55f4e-bb14-47da-af45-94af307b17a2',
        request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
        taskType: 'organize_note_tags',
        surface: 'note_library',
        persistence,
        resolveResultOutcome: (result) =>
          result?.failedItems ? { status: 'partial', errorCode: 'AI_ORGANIZE_PARTIAL' } : null,
      },
      async () => {
        await gateway.complete([], { trace: { stage: 'organize_note_tags' } });
        return { successfulItems: 2, failedItems: 1, suggestions: ['kept'] };
      },
      { quota },
    );

    expect(output.suggestions).toEqual(['kept']);
    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 13, { aborted: false });
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'partial',
      errorCode: 'AI_ORGANIZE_PARTIAL',
      chargedTokens: 13,
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

  it('额度占位无法关联根账本时失败关闭，并在 Provider 前按 0 释放', async () => {
    const persistence = createPersistence();
    persistence.updateAiExecutionReservation.mockRejectedValueOnce(
      Object.assign(new Error('temporary store failure'), { code: 'AI_EXECUTION_RESERVATION_NOT_PERSISTED' }),
    );
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5_000, reservationKey: 'unlinked-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const client = vi.fn();
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn() });

    await expect(
      runAiExecution(
        {
          requestId: '924a8066-25ea-4fde-903c-7da824077acf',
          request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
          taskType: 'reservation_link_failure',
          persistence,
        },
        () => gateway.complete([], { trace: { stage: 'reservation_link_failure' } }),
        { quota },
      ),
    ).rejects.toMatchObject({ code: 'AI_EXECUTION_RESERVATION_LINK_FAILED', status: 503 });

    expect(client).not.toHaveBeenCalled();
    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 0, { aborted: false });
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      chargedTokens: 0,
      quotaSettlementStatus: 'reconciled',
    });
  });

  it('并发子调用在首次占位返回后仍重新校验目录调用上限', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5_000, reservationKey: 'limit-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const client = vi.fn().mockResolvedValue({
      content: 'ok',
      usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      usageStatus: 'reported',
    });
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn() });

    await expect(
      runAiExecution(
        {
          requestId: '92ee9fc8-0e79-4dcc-a7a3-6982f93b81fa',
          request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
          taskType: 'skill_file_summarize',
          maxUserProviderCalls: 1,
          persistence,
        },
        () => Promise.all([gateway.complete([]), gateway.complete([])]),
        { quota },
      ),
    ).rejects.toMatchObject({ code: 'AI_EXECUTION_PROVIDER_CALL_LIMIT', status: 500 });

    expect(quota.reserve).toHaveBeenCalledOnce();
    expect(client).toHaveBeenCalledOnce();
    expect(persistence.insertAiProviderSpan).toHaveBeenCalledOnce();
  });

  it('usage 缺失时按每个 Span 的请求前预算保守结算且不超过实际预占', async () => {
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
    const charged = quota.reconcile.mock.calls[0][1];
    expect(charged).toBeGreaterThan(0);
    expect(charged).toBeLessThanOrEqual(5_000);
  });

  it('Vision 技术失败转本地保底时释放缺失 usage 预算，后续摘要只结算真实用量', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5_000, reservationKey: 'vision-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const networkError = Object.assign(new Error('network failed'), { code: 'AI_NETWORK_ERROR' });
    const client = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({
        content: '本地文字的摘要',
        usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
        usageStatus: 'reported',
      });
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn() });

    await runAiExecution(
      {
        requestId: 'a51bd530-42dd-4aa1-b538-a066a847ddfe',
        request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
        taskType: 'skill_file_summarize',
        maxUserProviderCalls: 2,
        reservationTokens: 5_000,
        persistence,
      },
      async () => {
        await gateway
          .complete([], {
            maxTokens: 1_200,
            missingUsageOnFailure: 'waive',
            trace: { stage: 'image_recognition' },
          })
          .catch(() => 'local-ocr');
        await gateway.complete([], { maxTokens: 1_200, trace: { stage: 'file_summary' } });
      },
      { quota },
    );

    expect(client).toHaveBeenCalledTimes(2);
    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 10, { aborted: false });
    expect(persistence.settleAiExecution.mock.calls.at(-1)[0]).toMatchObject({
      providerCallCount: 2,
      missingBillableUsageSpans: 0,
      chargedTokens: 10,
    });
  });

  it('阶段计划允许一次图片识别后继续正文生成，不再被动作级单次上限误拦截', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 20_000, reservationKey: 'plan-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const client = vi.fn().mockResolvedValue({
      content: 'ok',
      usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 },
      usageStatus: 'reported',
    });
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn() });
    const providerPlan = createAiProviderPlan({
      image_recognition: { billingScope: 'user', maxCalls: 1 },
      model_generation: { billingScope: 'user', maxCalls: 1 },
      output_repair: { billingScope: 'platform', maxCalls: 1 },
    });

    await runAiExecution(
      {
        requestId: '469f2f9d-e428-4f3c-ac39-f33e80eb6164',
        request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
        taskType: 'skill_file_summarize',
        providerPlan,
        reservationTokens: 20_000,
        persistence,
      },
      async () => {
        await gateway.complete([], { maxTokens: 1_200, trace: { stage: 'image_recognition' } });
        await gateway.complete([], { maxTokens: 2_600, trace: { stage: 'skill_file_summarize' } });
      },
      { quota },
    );

    expect(client).toHaveBeenCalledTimes(2);
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      providerCallCount: 2,
      userProviderCallCount: 2,
      providerStageCallCounts: { image_recognition: 1, model_generation: 1 },
    });
  });

  it('阶段计划拒绝图片识别后直接伪造平台修复', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 20_000, reservationKey: 'plan-r2' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const client = vi.fn().mockResolvedValue({ content: 'ok', usageStatus: 'reported' });
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn() });
    const providerPlan = createAiProviderPlan({
      image_recognition: { billingScope: 'user', maxCalls: 1 },
      model_generation: { billingScope: 'user', maxCalls: 1 },
      output_repair: { billingScope: 'platform', maxCalls: 1 },
    });

    await expect(
      runAiExecution(
        {
          requestId: '58c0ad65-063d-42a4-bbcc-e68e40d66338',
          request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
          taskType: 'skill_file_summarize',
          providerPlan,
          reservationTokens: 20_000,
          persistence,
        },
        async () => {
          await gateway.complete([], { trace: { stage: 'image_recognition' } });
          await gateway.complete([], {
            billingScope: 'platform',
            repairReasonCode: 'AI_SKILL_STRUCTURED_OUTPUT_MISSING',
            trace: { stage: 'skill_file_summarize_repair' },
          });
        },
        { quota },
      ),
    ).rejects.toMatchObject({ code: 'AI_EXECUTION_PLATFORM_REPAIR_INVALID' });
    expect(client).toHaveBeenCalledOnce();
  });

  it('长执行在租约窗口内先续期，再允许访问 Provider', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5_000, reservationKey: 'lease-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const gateway = createAiGateway({
      completeClient: vi.fn().mockResolvedValue({ content: 'ok', usageStatus: 'reported' }),
      streamClient: vi.fn(),
    });
    await runAiExecution(
      {
        requestId: '89b111f5-84f9-4520-83c3-dd20d94cc605',
        request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
        taskType: 'lease_test',
        leaseMs: 60_000,
        persistence,
      },
      () => gateway.complete([], { trace: { stage: 'lease_test' } }),
      { quota },
    );
    expect(persistence.renewAiExecutionLease).toHaveBeenCalledOnce();
    expect(persistence.insertAiExecution.mock.calls[0][0]).toMatchObject({
      billingRuleVersion: 3,
      validationRuleVersion: 2,
      leaseExpiresAt: expect.any(Date),
    });
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

  it('内部协议修复记录 Provider 总用量但由平台承担，不重复扣用户额度', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5000, reservationKey: 'repair-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const client = vi
      .fn()
      .mockResolvedValueOnce({
        content: '首版',
        usage: { promptTokens: 70, completionTokens: 30, totalTokens: 100 },
        usageStatus: 'reported',
      })
      .mockResolvedValueOnce({
        content: '修复版',
        usage: { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
        usageStatus: 'reported',
      });
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn() });

    await runAiExecution(
      {
        requestId: '33fc6783-f295-4ec3-bf36-c150690ef44a',
        request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
        taskType: 'skill_file_summarize',
        skillId: 'file.summarize',
        maxUserProviderCalls: 1,
        maxPlatformProviderCalls: 1,
        persistence,
      },
      async () => {
        await gateway.complete([], { maxTokens: 100, trace: { stage: 'file_summary' } });
        await gateway.complete([], {
          maxTokens: 100,
          billingScope: 'platform',
          repairReasonCode: 'AI_SKILL_OUTPUT_SOURCE_REQUIRED',
          trace: { stage: 'file_summary_repair' },
        });
      },
      { quota },
    );

    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 100, { aborted: false });
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      providerCallCount: 2,
      userProviderCallCount: 1,
      platformProviderCallCount: 1,
      usage: { totalTokens: 150 },
      billableUsage: { totalTokens: 100 },
      chargedTokens: 100,
    });
    expect(persistence.insertAiProviderSpan).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sequenceNo: 1, billingScope: 'user', triggerCode: null }),
    );
    expect(persistence.insertAiProviderSpan).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sequenceNo: 2,
        billingScope: 'platform',
        triggerCode: 'AI_SKILL_OUTPUT_SOURCE_REQUIRED',
      }),
    );
    expect(client.mock.calls[1][1]).not.toHaveProperty('repairReasonCode');
  });

  it('每个批量子调用在 Provider 前认领预算，下一项超过实际预占时停止且不超扣', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 1_500, reservationKey: 'batch-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const client = vi.fn().mockResolvedValue({
      content: 'ok',
      usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
      usageStatus: 'reported',
    });
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn() });

    await expect(
      runAiExecution(
        {
          requestId: 'cd97beae-a6e5-40dd-9e33-f41e54678b3c',
          request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
          taskType: 'organize_note_tags',
          skillId: 'note.organize_tags',
          reservationTokens: 1_500,
          maxUserProviderCalls: 20,
          maxPlatformProviderCalls: 0,
          persistence,
        },
        async () => {
          await gateway.complete([], { maxTokens: 600, trace: { stage: 'organize_note_tags' } });
          await gateway.complete([], { maxTokens: 600, trace: { stage: 'organize_note_tags' } });
        },
        { quota },
      ),
    ).rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED', status: 429 });

    expect(client).toHaveBeenCalledOnce();
    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 10, { aborted: false });
  });

  it('请求在首个 Provider 前已取消时不占位、不调用模型且记录 aborted', async () => {
    const persistence = createPersistence();
    const quota = { reserve: vi.fn(), reconcile: vi.fn() };
    const client = vi.fn();
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn() });
    const controller = new AbortController();
    controller.abort();

    await expect(
      runAiExecution(
        {
          requestId: 'b0519804-71c0-4b27-82ef-42b968cb6ec5',
          request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
          taskType: 'skill_note_transform_text',
          persistence,
        },
        () => gateway.complete([], { signal: controller.signal, trace: { stage: 'note_transform' } }),
        { quota },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(quota.reserve).not.toHaveBeenCalled();
    expect(client).not.toHaveBeenCalled();
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'aborted',
      providerCallCount: 0,
      chargedTokens: 0,
      quotaSettlementStatus: 'not_used',
    });
  });

  it('用户在 Provider 已完成后主动取消时，仍按已确认用量结算', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5_000, reservationKey: 'aborted-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const gateway = createAiGateway({
      completeClient: vi.fn().mockResolvedValue({
        content: '已经生成的部分内容',
        usage: { promptTokens: 12, completionTokens: 1, totalTokens: 13 },
        usageStatus: 'reported',
      }),
      streamClient: vi.fn(),
    });

    await expect(
      runAiExecution(
        {
          requestId: '21b924ce-c26d-4b57-9945-42bdd191467c',
          request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
          taskType: 'skill_note_transform_text',
          persistence,
        },
        async () => {
          await gateway.complete([], { trace: { stage: 'note_transform' } });
          const error = new Error('用户停止生成');
          error.name = 'AbortError';
          error.code = 'AI_REQUEST_ABORTED';
          throw error;
        },
        { quota },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 13, { aborted: true });
    expect(persistence.settleAiExecution.mock.calls.at(-1)[0]).toMatchObject({
      status: 'aborted',
      chargedTokens: 13,
    });
  });

  it('系统额度执行失败时继续结算系统用量，不套用用户失败免扣', async () => {
    const persistence = createPersistence();
    const quota = {
      reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 5_000, reservationKey: 'system-r1' }),
      reconcile: vi.fn().mockResolvedValue(true),
    };
    const gateway = createAiGateway({
      completeClient: vi.fn().mockResolvedValue({
        content: '',
        usage: { promptTokens: 12, completionTokens: 1, totalTokens: 13 },
        usageStatus: 'reported',
      }),
      streamClient: vi.fn(),
    });

    await expect(
      runAiExecution(
        {
          requestId: '9149e1fd-3106-46c0-b9d9-a75a353f9b98',
          billingPolicy: 'system',
          taskType: 'system_summary',
          persistence,
        },
        async () => {
          await gateway.complete([], { trace: { stage: 'system_summary' } });
          const error = new Error('系统任务没有生成结果');
          error.code = 'AI_SKILL_OUTPUT_EMPTY';
          throw error;
        },
        { quota },
      ),
    ).rejects.toMatchObject({ code: 'AI_SKILL_OUTPUT_EMPTY' });

    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 13, { aborted: false });
    expect(persistence.settleAiExecution.mock.calls.at(-1)[0]).toMatchObject({
      billingPolicy: 'system',
      status: 'failed',
      chargedTokens: 13,
    });
  });
});
