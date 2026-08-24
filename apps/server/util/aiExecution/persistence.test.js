import { describe, expect, it, vi } from 'vitest';
import { settleAiExecution } from './persistence.js';

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
