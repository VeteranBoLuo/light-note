import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  aiActionRateLimiter: vi.fn(),
  externalLookupRateLimiter: vi.fn((_req, _res, next) => next()),
}));

vi.mock('../router_handle/tagIconHandle.js', () => ({ search: vi.fn(), resolve: vi.fn() }));
vi.mock('../util/requestRateLimit.js', () => ({
  aiActionRateLimiter: mocks.aiActionRateLimiter,
  externalLookupRateLimiter: mocks.externalLookupRateLimiter,
}));

const { limitExplicitAiSearch } = await import('./tagIcon.js');

describe('tagIcon route rate limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('普通免费搜索不占用 AI 分钟级防洪预算', () => {
    const next = vi.fn();
    limitExplicitAiSearch({ body: { useAi: false } }, {}, next);

    expect(next).toHaveBeenCalledOnce();
    expect(mocks.aiActionRateLimiter).not.toHaveBeenCalled();
  });

  it('显式 AI 扩展同时经过统一 AI 分钟级防洪', () => {
    const req = { body: { useAi: true } };
    const res = {};
    const next = vi.fn();
    limitExplicitAiSearch(req, res, next);

    expect(mocks.aiActionRateLimiter).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});
