import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: { query: vi.fn().mockResolvedValue([[]]) } }));

// auth.js 依赖 common.js(resultData),存在 common.js↔router↔handler 循环依赖:
// 先 import common.js 让 handler 作为叶子完成初始化,规避循环(同 commonHandle.test.js)。
await import('./common.js');
const { accountBanMiddleware } = await import('./auth.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  return res;
}

describe('accountBanMiddleware', () => {
  it('未封禁用户放行', () => {
    const next = vi.fn();
    accountBanMiddleware({ user: { isBanned: false }, path: '/bookmark/addBookmark' }, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('封禁用户访问业务接口 → 423', () => {
    const next = vi.fn();
    const res = mockRes();
    accountBanMiddleware({ user: { isBanned: true }, path: '/bookmark/addBookmark' }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(423);
  });

  it('封禁用户仍可走登录/登出等白名单', () => {
    for (const path of ['/user/login', '/user/logout', '/user/registerUser']) {
      const next = vi.fn();
      accountBanMiddleware({ user: { isBanned: true }, path }, mockRes(), next);
      expect(next, path).toHaveBeenCalledTimes(1);
    }
  });

  it('白名单收紧:封禁用户不再放行 configPassword → 423', () => {
    const next = vi.fn();
    const res = mockRes();
    accountBanMiddleware({ user: { isBanned: true }, path: '/user/configPassword' }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(423);
  });
});
