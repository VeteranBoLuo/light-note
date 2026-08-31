import { describe, expect, it, vi } from 'vitest';
import { getUserAiUsage, getUserAiUsageDetail, normalizeAiUsageQuery } from './aiUsageService.js';

describe('aiUsageService', () => {
  it('查询参数只接受稳定白名单', () => {
    expect(normalizeAiUsageQuery({ days: 30, page: 2, pageSize: 10, module: 'NOTE' })).toEqual({
      days: 30,
      page: 2,
      pageSize: 10,
      module: 'note',
    });
    expect(normalizeAiUsageQuery({ days: 365, page: -9, pageSize: 999, module: 'secret' })).toEqual({
      days: 7,
      page: 1,
      pageSize: 20,
      module: 'all',
    });
    expect(normalizeAiUsageQuery({ module: 'TOOLBOX' }).module).toBe('toolbox');
  });

  it('只返回用量治理字段，并按目录把内部 task type 映射为用户可理解的动作', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'execution-1',
              skill_id: 'note.transform_text',
              task_type: 'skill_note_transform_text',
              status: 'success',
              model_called: 1,
              provider_call_count: 2,
              provider_tokens: 1200,
              charged_tokens: 900,
              usage_complete: 1,
              quota_settlement_status: 'reconciled',
              duration_ms: 800,
              created_at: new Date('2026-08-24T08:00:00Z'),
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              model_actions: 1,
              charged_tokens: 900,
              provider_tokens: 1200,
              platform_covered_tokens: 300,
              zero_charge_model_actions: 0,
              today_charged_tokens: 900,
            },
          ],
        ])
        .mockResolvedValueOnce([[{ usage_date: '2026-08-24', charged_tokens: 900, provider_tokens: 1200, actions: 1 }]])
        .mockResolvedValueOnce([
          [
            {
              skill_id: 'note.transform_text',
              task_type: 'skill_note_transform_text',
              charged_tokens: 900,
              provider_tokens: 1200,
              actions: 1,
            },
          ],
        ]),
    };

    const result = await getUserAiUsage('payer-user', { days: 7, page: 1, pageSize: 20 }, database);

    expect(database.query).toHaveBeenCalledTimes(4);
    expect(database.query.mock.calls[0][1]).toEqual(['payer-user', 7, 20, 0]);
    expect(result.summary).toEqual({
      chargedTokens: 900,
      providerTokens: 1200,
      platformCoveredTokens: 300,
      todayChargedTokens: 900,
      modelActions: 1,
      zeroChargeModelActions: 0,
    });
    expect(result.items[0]).toMatchObject({
      id: 'execution-1',
      actionId: 'note.transform_text',
      module: 'note',
      labelKey: 'noteTransformText',
      providerCallCount: 2,
      providerTokens: 1200,
      chargedTokens: 900,
      platformCoveredTokens: 300,
    });
    expect(result.items[0]).not.toHaveProperty('skillId');
    expect(result.items[0]).not.toHaveProperty('taskType');
    expect(result.items[0]).not.toHaveProperty('errorCode');
  });

  it('存储错误收口为稳定 503，不泄露 SQL 或连接信息', async () => {
    const database = { query: vi.fn().mockRejectedValue(new Error('password@secret-db-host')) };
    await expect(getUserAiUsage('payer-user', {}, database)).rejects.toMatchObject({
      code: 'AI_USAGE_STORE_UNAVAILABLE',
      status: 503,
      message: 'AI 用量明细暂不可用',
    });
  });

  it('按付款者读取单次调用链，并把内部阶段与修复码映射为低敏公开语义', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: '7bc4f1a8-0d1e-4c60-a9d3-1974332a7c4d',
              skill_id: 'file.summarize',
              task_type: 'skill_file_summarize',
              status: 'success',
              model_called: 1,
              provider_call_count: 2,
              provider_tokens: 2157,
              charged_tokens: 1376,
              usage_complete: 1,
              quota_settlement_status: 'reconciled',
              duration_ms: 8057,
              created_at: new Date('2026-08-24T15:50:35Z'),
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              stage: 'image_recognition',
              provider: 'deepseek',
              model: 'deepseek-v4-flash-vision-exp',
              status: 'success',
              trigger_code: null,
              usage_status: 'reported',
              billing_scope: 'user',
              sequence_no: 1,
              estimated_tokens: 3000,
              prompt_tokens: 1199,
              completion_tokens: 177,
              total_tokens: 1376,
              duration_ms: 2460,
              error_code: null,
              created_at: new Date('2026-08-24T15:50:39Z'),
            },
            {
              stage: 'skill_file_summarize_repair',
              provider: 'deepseek',
              model: 'deepseek-v4-flash',
              status: 'success',
              trigger_code: 'AI_SKILL_OUTPUT_SOURCE_REQUIRED',
              usage_status: 'reported',
              billing_scope: 'platform',
              sequence_no: 2,
              estimated_tokens: 2200,
              prompt_tokens: 311,
              completion_tokens: 470,
              total_tokens: 781,
              duration_ms: 4179,
              error_code: null,
              created_at: new Date('2026-08-24T15:50:43Z'),
            },
            {
              stage: 'skill_file_summarize_repair',
              provider: 'deepseek',
              model: 'deepseek-v4-flash',
              status: 'failed',
              trigger_code: null,
              usage_status: 'missing',
              billing_scope: 'platform',
              sequence_no: 3,
              estimated_tokens: 2200,
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
              duration_ms: 5000,
              error_code: 'PROVIDER_TIMEOUT',
              created_at: new Date('2026-08-24T15:50:48Z'),
            },
            {
              stage: 'skill_file_summarize_repair',
              provider: 'deepseek',
              model: 'deepseek-v4-flash',
              status: 'success',
              trigger_code: 'AI_SKILL_OUTPUT_FUTURE_CHECK',
              usage_status: 'reported',
              billing_scope: 'platform',
              sequence_no: 4,
              estimated_tokens: 2200,
              prompt_tokens: 300,
              completion_tokens: 400,
              total_tokens: 700,
              duration_ms: 2100,
              error_code: null,
              created_at: new Date('2026-08-24T15:50:51Z'),
            },
          ],
        ]),
    };

    const result = await getUserAiUsageDetail('payer-user', '7bc4f1a8-0d1e-4c60-a9d3-1974332a7c4d', database);

    expect(database.query.mock.calls[0][1]).toEqual(['7bc4f1a8-0d1e-4c60-a9d3-1974332a7c4d', 'payer-user']);
    expect(result.calls).toEqual([
      expect.objectContaining({ sequenceNo: 1, stageType: 'image_recognition', billingScope: 'user' }),
      expect.objectContaining({
        sequenceNo: 2,
        stageType: 'output_repair',
        billingScope: 'platform',
        triggerReason: 'source_required',
      }),
      expect.objectContaining({
        sequenceNo: 3,
        stageType: 'output_repair',
        usageStatus: 'missing',
        triggerReason: 'historical_unknown',
        errorCategory: 'timeout',
      }),
      expect.objectContaining({
        sequenceNo: 4,
        stageType: 'output_repair',
        triggerReason: 'other_protocol_check',
      }),
    ]);
    expect(result.calls[1]).not.toHaveProperty('stage');
    expect(result.calls[1]).not.toHaveProperty('triggerCode');
    expect(result.calls[1]).not.toHaveProperty('errorCode');
  });

  it('最终失败免扣后，调用详情按实际承担方展示为平台承担', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: '0fb6bbcd-a895-45fa-9c20-55903f997b29',
              skill_id: 'file.summarize',
              task_type: 'skill_file_summarize',
              status: 'failed',
              model_called: 1,
              provider_call_count: 1,
              provider_tokens: 604,
              charged_tokens: 0,
              usage_complete: 1,
              quota_settlement_status: 'reconciled',
              duration_ms: 2800,
              created_at: new Date('2026-08-25T00:35:42Z'),
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              stage: 'skill_file_summarize',
              provider: 'deepseek',
              model: 'deepseek-v4-flash',
              status: 'success',
              trigger_code: null,
              usage_status: 'reported',
              billing_scope: 'user',
              sequence_no: 1,
              estimated_tokens: 5000,
              prompt_tokens: 368,
              completion_tokens: 236,
              total_tokens: 604,
              duration_ms: 2800,
              error_code: null,
              created_at: new Date('2026-08-25T00:35:42Z'),
            },
          ],
        ]),
    };

    const result = await getUserAiUsageDetail('payer-user', '0fb6bbcd-a895-45fa-9c20-55903f997b29', database);

    expect(result.execution).toMatchObject({ status: 'failed', chargedTokens: 0, platformCoveredTokens: 604 });
    expect(result.calls[0]).toMatchObject({ billingScope: 'platform', totalTokens: 604 });
  });

  it('调用详情拒绝越权或不存在的执行记录', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) };
    await expect(
      getUserAiUsageDetail('payer-user', '7bc4f1a8-0d1e-4c60-a9d3-1974332a7c4d', database),
    ).rejects.toMatchObject({ code: 'AI_USAGE_EXECUTION_NOT_FOUND', status: 404 });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
