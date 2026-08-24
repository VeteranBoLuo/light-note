import { describe, expect, it, vi } from 'vitest';
import { getUserAiUsage, normalizeAiUsageQuery } from './aiUsageService.js';

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
});
