import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBaseGet: vi.fn(),
  apiBasePost: vi.fn(),
}));

vi.mock('@/http/request', () => ({
  apiBaseGet: mocks.apiBaseGet,
  apiBasePost: mocks.apiBasePost,
}));

import { approveAdminSupportReward } from './adminSupportApi';

describe('赞助赠送后台 API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('大额审批携带管理员所见的额度与归属快照', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: {} });

    await approveAdminSupportReward({
      providerOrderNo: 'order-12345678',
      expectedTokens: 25_000_000,
      expectedUserId: 'user-1',
    });

    expect(mocks.apiBasePost).toHaveBeenCalledWith('/api/support/admin/orders/order-12345678/reward-approve', {
      expectedTokens: 25_000_000,
      expectedUserId: 'user-1',
    });
  });
});
