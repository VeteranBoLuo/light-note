import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBaseGet: vi.fn(),
  apiBasePost: vi.fn(),
}));

vi.mock('@/http/request', () => ({
  apiBaseGet: mocks.apiBaseGet,
  apiBasePost: mocks.apiBasePost,
}));

import {
  approveAdminSupportReward,
  createAdminSupportCampaign,
  getAdminSupportCampaignGrants,
  getAdminSupportCampaigns,
  previewAdminSupportCampaignCosts,
  publishAdminSupportCampaign,
  suspendAdminSupportCampaign,
} from './adminSupportApi';

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

  it('活动草稿、成本预览、发布、暂停与领取记录使用版本化后台端点', async () => {
    mocks.apiBaseGet.mockResolvedValue({ status: 200, data: [] });
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: { id: 'campaign-1' } });
    const skus = [
      {
        skuId: 'anniversary-combo',
        title: '周年组合包',
        amount: 30,
        aiTokens: 2_500_000,
        storageMb: 640,
        perUserLimit: 1,
      },
    ];
    const campaignInput = {
      campaignKey: 'anniversary',
      title: '周年支持季',
      description: '独立活动套餐',
      startsAt: '2026-08-01T00:00',
      endsAt: '2026-09-01T00:00',
      skus,
    };

    await getAdminSupportCampaigns();
    await previewAdminSupportCampaignCosts(skus);
    await createAdminSupportCampaign(campaignInput);
    await publishAdminSupportCampaign('campaign-1');
    await suspendAdminSupportCampaign('campaign-1');
    await getAdminSupportCampaignGrants('campaign-1');

    expect(mocks.apiBaseGet).toHaveBeenNthCalledWith(1, '/api/support/admin/campaigns');
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(1, '/api/support/admin/campaigns/cost-preview', { skus });
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(2, '/api/support/admin/campaigns', campaignInput);
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(3, '/api/support/admin/campaigns/campaign-1/publish');
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(4, '/api/support/admin/campaigns/campaign-1/suspend');
    expect(mocks.apiBaseGet).toHaveBeenNthCalledWith(2, '/api/support/admin/campaigns/campaign-1/grants');
  });
});
