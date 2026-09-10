import { describe, expect, it } from 'vitest';
import { estimateAiUsageCost, getConservativeAiUnitCost, isPeakAiTime, getAiModelPrice } from './aiCostPolicy.js';
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
    expect(getConservativeAiUnitCost({}, '2026-09-11T02:00:00Z')).toBeCloseTo(9.6);
    expect(getConservativeAiUnitCost({ AGENT_COMPOSER_MODEL: 'deepseek-v4-pro' }, '2026-09-11T02:00:00Z')).toBeCloseTo(
      32.4,
    );
    expect(getConservativeAiUnitCost({ AGENT_VISION_MODEL: 'unknown' })).toBeNull();
  });
});

it('新 Flash 与旧别名使用新价格，保留历史价格并按官方时刻切换 Pro', () => {
  for (const model of ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']) {
    expect(getAiModelPrice('deepseek', model, '2026-09-11T02:00:00Z')).toEqual({ input: 2, cached: 0.04, output: 8 });
    expect(getAiModelPrice('deepseek', model, '2026-09-12T02:00:00Z')).toEqual({ input: 1, cached: 0.02, output: 4 });
    expect(
      estimateAiUsageCost({
        provider: 'deepseek',
        model,
        at: '2026-09-11T02:00:00Z',
        usage: { promptTokens: 1_000_000, cachedPromptTokens: 500_000, completionTokens: 100_000 },
      }),
    ).toBe(1.82);
  }
  expect(getAiModelPrice('deepseek', 'deepseek-v4-flash', '2026-09-10T15:59:59Z', true)).toEqual({
    input: 3,
    cached: 0.1,
    output: 9,
  });
  expect(getAiModelPrice('deepseek', 'deepseek-flash', '2026-09-09T02:00:00Z')).toBeNull();
  expect(getAiModelPrice('deepseek', 'deepseek-v4-pro', '2026-09-14T03:59:59Z', true)).toEqual({
    input: 9,
    cached: 0.3,
    output: 27,
  });
  expect(getAiModelPrice('deepseek', 'deepseek-v4-pro', '2026-09-14T04:00:00Z', true)).toEqual({
    input: 2,
    cached: 0.04,
    output: 8,
  });
  expect(getAiModelPrice('deepseek', 'deepseek-flash', 'invalid')).toBeNull();
});
