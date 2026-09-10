import { describe, expect, it, vi } from 'vitest';
import {
  checkout,
  adminCampaignVisibility,
  checkoutCreate,
  checkoutStatus,
  campaignPresentation,
} from '../router_handle/supportHandle.js';

function responseDouble() {
  const res = {
    status: vi.fn(),
    send: vi.fn(),
  };
  res.status.mockImplementation(() => res);
  res.send.mockImplementation((payload) => payload);
  return res;
}

describe('爱发电赞助与权益结算端点边界', () => {
  it('旧版 option 结算入口失败关闭，避免滚动发布期间按新规则吞掉旧页面承诺', async () => {
    const req = {
      adminContext: null,
      user: { id: 'light-note-user', role: 'user', isAuthenticated: true },
      query: { option: 'coffee' },
    };
    const res = responseDouble();

    await checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 410,
        data: { code: 'SUPPORT_CHECKOUT_LEGACY_RETIRED' },
      }),
    );
  });
});

describe('活动与原单接口鉴权', () => {
  it.each([
    { user: { id: 'user', role: 'user', isAuthenticated: true }, adminContext: null },
    { user: { id: 'root', role: 'root', isAuthenticated: true }, adminContext: { mode: 'read' } },
    { user: null, adminContext: null },
  ])('普通账号和只读代管不能修改开放状态', async (req) => {
    const res = responseDouble();
    await adminCampaignVisibility(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ROOT_REQUIRED' } }));
  });
  it.each([checkoutCreate, checkoutStatus, campaignPresentation])(
    '代管上下文不能访问私人结算和目录',
    async (handler) => {
      const res = responseDouble();
      await handler({ user: { id: 'owner', isAuthenticated: true }, adminContext: { mode: 'read' } }, res);
      expect(res.status).toHaveBeenCalledWith(403);
    },
  );
});
