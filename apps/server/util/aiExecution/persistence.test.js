import { describe, expect, it, vi } from 'vitest';
import { insertAiProviderSpan, settleAiExecution } from './persistence.js';

function execution(overrides = {}) {
  return {
    id: 'execution-1',
    status: 'success',
    providerCallCount: 2,
    usage: { promptTokens: 70, completionTokens: 30, totalTokens: 100 },
    chargedTokens: 80,
    missingUsageSpans: 0,
    missingBillableUsageSpans: 0,
    quotaSettlementStatus: 'reconciled',
    errorCode: null,
    durationMs: 500,
    ...overrides,
  };
}

function database() {
  return { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
}

describe('aiExecution persistence', () => {
  it('Span 持久化调用顺序、计费归属和修复触发码，但不保存模型正文', async () => {
    const db = database();
    await insertAiProviderSpan(
      {
        id: 'span-1',
        executionId: 'execution-1',
        traceId: 'trace-1',
        stage: 'skill_file_summarize_repair',
        taskType: 'skill_file_summarize',
        kind: 'complete',
        billingScope: 'platform',
        sequenceNo: 3,
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'success',
        triggerCode: 'AI_SKILL_OUTPUT_SOURCE_REQUIRED',
        usageStatus: 'reported',
        estimatedTokens: 2200,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        estimatedCost: 0,
        durationMs: 800,
        errorCode: null,
        content: '不得落库的模型正文',
      },
      db,
    );

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('billing_scope, sequence_no');
    expect(sql).toContain('trigger_code');
    expect(sql).toContain('estimated_tokens');
    expect(values).toContain('AI_SKILL_OUTPUT_SOURCE_REQUIRED');
    expect(values).not.toContain('不得落库的模型正文');
  });

  it('用户主调用 usage 缺失时把扣费记录标成估算', async () => {
    const db = database();
    await settleAiExecution(execution({ missingUsageSpans: 1, missingBillableUsageSpans: 1 }), db);

    expect(db.query.mock.calls[0][1][7]).toBe(0);
  });

  it('只有平台修复 usage 缺失时不污染用户扣费的完整性标记', async () => {
    const db = database();
    await settleAiExecution(execution({ missingUsageSpans: 1, missingBillableUsageSpans: 0 }), db);

    expect(db.query.mock.calls[0][1][7]).toBe(1);
  });
});
