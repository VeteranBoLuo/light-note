import { describe, expect, it, vi } from 'vitest';

vi.mock('@/http/request.ts', () => ({
  apiBasePost: vi.fn(),
}));

import { normalizeFeatureRequestSummary } from './featureRequestApi.ts';

describe('normalizeFeatureRequestSummary', () => {
  it('将接口 camelCase 的开发中数量映射到页面状态字段', () => {
    expect(
      normalizeFeatureRequestSummary({
        evaluating: 1,
        planned: 2,
        inProgress: 3,
        released: 4,
        declined: 5,
      }),
    ).toEqual({
      evaluating: 1,
      planned: 2,
      in_progress: 3,
      released: 4,
      declined: 5,
    });
  });

  it('兼容未经过接口转换的 snake_case 数据', () => {
    expect(normalizeFeatureRequestSummary({ in_progress: 2 }).in_progress).toBe(2);
  });

  it('缺少统计数据时返回完整的零值状态', () => {
    expect(normalizeFeatureRequestSummary()).toEqual({
      evaluating: 0,
      planned: 0,
      in_progress: 0,
      released: 0,
      declined: 0,
    });
  });
});
