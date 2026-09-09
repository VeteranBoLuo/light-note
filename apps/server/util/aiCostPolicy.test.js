import { describe, expect, it } from 'vitest';
import { estimateAiUsageCost, getConservativeAiUnitCost, isPeakAiTime } from './aiCostPolicy.js';
describe('AI 成本策略', () => {
  it('按缓存命中、未命中及输出计算，峰谷和周末分别核价', () => {
    const input = {
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      usage: { promptTokens: 1_000_000, cachedPromptTokens: 500_000, completionTokens: 100_000 },
    };
    expect(estimateAiUsageCost({ ...input, at: '2026-09-09T02:00:00Z' })).toBe(2.45);
    expect(estimateAiUsageCost({ ...input, at: '2026-09-09T04:00:00Z' })).toBe(1.225);
    expect(isPeakAiTime('2026-09-12T02:00:00Z')).toBe(false);
  });
  it('未知价格不伪装为零成本，阶段模型覆盖计入保守门禁', () => {
    expect(estimateAiUsageCost({ provider: 'deepseek', model: 'unknown' })).toBeNull();
    expect(getConservativeAiUnitCost({})).toBeCloseTo(10.8);
    expect(getConservativeAiUnitCost({ AGENT_COMPOSER_MODEL: 'deepseek-v4-pro' })).toBeCloseTo(32.4);
    expect(getConservativeAiUnitCost({ AGENT_VISION_MODEL: 'unknown' })).toBeNull();
  });
});
