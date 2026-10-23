import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  confirm: vi.fn(),
  account: vi.fn(),
  recent: vi.fn(),
  audit: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('../util/services/accountEmailChangeService.js', () => ({
  requestEmailChange: mocks.request,
  confirmEmailChange: mocks.confirm,
  getEmailChangeAccount: mocks.account,
  hasRecentGithubAuthentication: mocks.recent,
}));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, msg = '') => ({ data, status, msg }),
  L: (_req, zh) => zh,
}));
vi.mock('../util/auth.js', () => ({ clearAuthCookie: mocks.clear }));
vi.mock('../util/operationLog.js', () => ({ recordServerOperation: mocks.audit }));
import { requestCode, confirm, status } from './accountEmailHandle.js';
let req, res;
beforeEach(() => {
  vi.clearAllMocks();
  req = {
    user: { id: 'real-owner', role: 'user', sessionId: 'real-session' },
    body: {
      userId: 'forged',
      sid: 'forged',
      email: 'new@example.com',
      oldPassword: 'password',
      challenge: 'ticket',
      code: '123456',
    },
  };
  res = { send: vi.fn() };
  mocks.request.mockResolvedValue({ challenge: 'ticket' });
  mocks.confirm.mockResolvedValue({ email: 'new@example.com' });
  mocks.audit.mockResolvedValue();
});
describe('更换邮箱 HTTP 身份边界', () => {
  it('用户与会话身份仅来自认证链，不采信请求体', async () => {
    await requestCode(req, res);
    expect(mocks.request).toHaveBeenCalledWith({
      userId: 'real-owner',
      sid: 'real-session',
      email: 'new@example.com',
      oldPassword: 'password',
    });
    await confirm(req, res);
    expect(mocks.confirm).toHaveBeenCalledWith({
      userId: 'real-owner',
      sid: 'real-session',
      challenge: 'ticket',
      code: '123456',
    });
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it.each(['visitor', 'deleted'])('拒绝 %s 身份', async (role) => {
    req.user.role = role;
    for (const handler of [requestCode, confirm, status]) await handler(req, res);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('管理员代看和无会话均不能操作', async () => {
    req.adminContext = { mode: 'maintain' };
    await requestCode(req, res);
    expect(res.send).toHaveBeenLastCalledWith(expect.objectContaining({ status: 403 }));
    delete req.adminContext;
    delete req.user.sessionId;
    await confirm(req, res);
    expect(res.send).toHaveBeenLastCalledWith(expect.objectContaining({ status: 401 }));
  });
  it('服务端异常不泄露邮箱、验证码或底层错误', async () => {
    mocks.request.mockRejectedValue(new Error('password=secret smtp recipient@example.com'));
    await requestCode(req, res);
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('secret');
    expect(res.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 500, data: { code: 'EMAIL_CHANGE_FAILED' } }),
    );
  });
});
