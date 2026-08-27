import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  routes: new Map(),
  getStatus: vi.fn(),
  getUserAiUsage: vi.fn(),
  getUserAiUsageDetail: vi.fn(),
}));

vi.mock('express', () => ({
  default: {
    Router: () => ({
      post(path, ...handlers) {
        mocks.routes.set(path, handlers);
      },
    }),
  },
}));
vi.mock('../util/aiQuota.js', () => ({ getStatus: mocks.getStatus }));
vi.mock('../util/aiUsageService.js', () => ({
  getUserAiUsage: mocks.getUserAiUsage,
  getUserAiUsageDetail: mocks.getUserAiUsageDetail,
}));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/requestRateLimit.js', () => ({
  aiUsageReadRateLimiter: (_req, _res, next) => next?.(),
}));

await import('./chat.js');

function response() {
  return {
    send: vi.fn(),
    status: vi.fn(function status() {
      return this;
    }),
  };
}

function previewRequest(body = {}) {
  return {
    billingUser: { id: 'root-user', role: 'root' },
    resourceUser: { id: 'preview-user', role: 'user' },
    user: { id: 'preview-user', role: 'user' },
    body,
  };
}

describe('AI 额度与用量只读身份', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStatus.mockResolvedValue({ dailyRemaining: 123 });
    mocks.getUserAiUsage.mockResolvedValue({ items: [] });
    mocks.getUserAiUsageDetail.mockResolvedValue({ executionId: 'execution-1' });
  });

  it('管理员预览时查询目标用户额度，不泄露管理员额度', async () => {
    const req = previewRequest();
    const res = response();

    await mocks.routes.get('/aiQuota').at(-1)(req, res);

    expect(mocks.getStatus).toHaveBeenCalledWith(req, {
      userId: 'preview-user',
      userRole: 'user',
    });
  });

  it('管理员预览时用量列表和调用详情均查询目标用户', async () => {
    const usageReq = previewRequest({ page: 1 });
    const usageRes = response();
    const detailReq = previewRequest({ executionId: 'execution-1' });
    const detailRes = response();

    await mocks.routes.get('/aiUsage').at(-1)(usageReq, usageRes);
    await mocks.routes.get('/aiUsageDetail').at(-1)(detailReq, detailRes);

    expect(mocks.getUserAiUsage).toHaveBeenCalledWith('preview-user', { page: 1 });
    expect(mocks.getUserAiUsageDetail).toHaveBeenCalledWith('preview-user', 'execution-1');
  });

  it('普通登录仍查询当前登录用户', async () => {
    const req = { user: { id: 'current-user', role: 'user' }, body: {} };
    const res = response();

    await mocks.routes.get('/aiQuota').at(-1)(req, res);

    expect(mocks.getStatus).toHaveBeenCalledWith(req, {
      userId: 'current-user',
      userRole: 'user',
    });
  });
});
