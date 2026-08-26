import { describe, expect, it, vi } from 'vitest';
import { checkout } from '../router_handle/supportHandle.js';

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
