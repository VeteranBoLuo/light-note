import { beforeEach, describe, it, expect, vi } from 'vitest';

const query = vi.fn();
const getSession = vi.fn();
const getAdminContext = vi.fn();
const getAdminContextMetadata = vi.fn();
const recordAdminContextAudit = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query } }));
vi.mock('./sessionStore.js', () => ({
  cleanupExpiredSessions: vi.fn(),
  cleanupLegacyElevatedVisitorSessions: vi.fn(),
  createSession: vi.fn(),
  getSession,
  removeSession: vi.fn(),
}));
vi.mock('./adminContextStore.js', () => ({ getAdminContext, getAdminContextMetadata }));
vi.mock('./adminContextAudit.js', () => ({ recordAdminContextAudit }));
vi.mock('./conversion.js', () => ({ recordConversionEvent: vi.fn() }));

// auth.js 依赖 common.js(resultData),存在 common.js↔router↔handler 循环依赖:
// 先 import common.js 让 handler 作为叶子完成初始化,规避循环(同 commonHandle.test.js)。
await import('./common.js');
const { accountBanMiddleware, authMiddleware, ensureNotVisitor } = await import('./auth.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  res.removeHeader = vi.fn();
  res.cookie = vi.fn();
  res.clearCookie = vi.fn();
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAdminContextMetadata.mockResolvedValue(null);
});

describe('authMiddleware 管理员上下文', () => {
  it('把真实 root actor 与目标 subject 分离并绑定同一登录会话', async () => {
    getSession.mockResolvedValue({ user_id: 'root-1', expires_in_seconds: 600 });
    getAdminContext.mockResolvedValue({
      id: 'ctx-1',
      actorUserId: 'root-1',
      actorSessionId: 'sid-1',
      subjectUserId: 'user-1',
      subjectRole: 'user',
      mode: 'readonly',
    });
    query
      .mockResolvedValueOnce([[{ id: 'root-1', alias: 'root', role: 'root', del_flag: 0 }]])
      .mockResolvedValueOnce([[{ id: 'user-1', alias: 'subject', role: 'user', del_flag: 0 }]]);
    const req = {
      headers: { cookie: 'sid=sid-1', 'x-admin-context': 'context-token' },
      originalUrl: '/api/bookmark/getBookmarkList',
      path: '/bookmark/getBookmarkList',
      body: {},
    };
    const next = vi.fn();
    await authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.adminActor).toMatchObject({ id: 'root-1', role: 'root' });
    expect(req.billingUser).toMatchObject({ id: 'root-1', role: 'root' });
    expect(req.resourceUser).toEqual({ id: 'user-1', role: 'user' });
    expect(req.user).toMatchObject({ id: 'user-1', role: 'user', sessionId: 'sid-1' });
    expect(req.suppressUserRewards).toBe(true);
  });

  it('非 root 登录态即使拿到上下文令牌也不能进入目标账号', async () => {
    getSession.mockResolvedValue({ user_id: 'user-2', expires_in_seconds: 600 });
    getAdminContext.mockResolvedValue({
      id: 'ctx-1',
      actorUserId: 'root-1',
      actorSessionId: 'sid-1',
      subjectUserId: 'user-1',
      mode: 'readonly',
    });
    query.mockResolvedValueOnce([[{ id: 'user-2', role: 'user', del_flag: 0 }]]);
    const req = {
      headers: { cookie: 'sid=sid-user-2', 'x-admin-context': 'stolen-token' },
      originalUrl: '/api/bookmark/getBookmarkList',
      path: '/bookmark/getBookmarkList',
      body: {},
    };
    const res = mockRes();
    const next = vi.fn();
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_CONTEXT_FORBIDDEN' } }));
    expect(recordAdminContextAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'blocked' }));
  });

  it('上下文过期时使用短期元数据记录 expired 审计', async () => {
    getSession.mockResolvedValue({ user_id: 'root-1', expires_in_seconds: 600 });
    getAdminContext.mockResolvedValue(null);
    getAdminContextMetadata.mockResolvedValue({
      expired: true,
      context: {
        id: 'ctx-expired',
        actorUserId: 'root-1',
        actorSessionId: 'sid-1',
        subjectUserId: 'user-1',
        subjectRole: 'user',
        mode: 'readonly',
      },
    });
    query.mockResolvedValueOnce([[{ id: 'root-1', role: 'root', del_flag: 0 }]]);
    const req = {
      headers: { cookie: 'sid=sid-1', 'x-admin-context': 'expired-token' },
      originalUrl: '/api/bookmark/getBookmarkList',
      path: '/bookmark/getBookmarkList',
      method: 'POST',
      body: {},
    };
    const res = mockRes();
    await authMiddleware(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(recordAdminContextAudit).toHaveBeenCalledWith(
      expect.objectContaining({ contextId: 'ctx-expired', action: 'expired', outcome: 'expired' }),
    );
  });
});

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

describe('游客内容维护权限', () => {
  it('新管理员维护上下文仅放行已声明的内容写策略', () => {
    const req = {
      user: { id: 'user-1', role: 'user' },
      adminContext: { id: 'ctx-1', mode: 'maintain', subjectRole: 'user' },
      adminCapability: { policy: 'content_write', resourceType: 'note' },
    };
    const res = mockRes();
    expect(ensureNotVisitor(req, res)).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('新管理员只读上下文在 handler 二次守卫处仍拒绝写入', () => {
    const req = {
      user: { id: 'user-1', role: 'user' },
      adminContext: { id: 'ctx-1', mode: 'readonly', subjectRole: 'user' },
      adminCapability: { policy: 'content_write', resourceType: 'note' },
    };
    const res = mockRes();
    expect(ensureNotVisitor(req, res)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'ADMIN_PREVIEW_READONLY' } }),
    );
  });

  it('普通登录用户不受游客维护逻辑影响', () => {
    const res = mockRes();
    expect(
      ensureNotVisitor(
        { originalUrl: '/api/note/updateNote', user: { id: 'user-1', role: 'user' }, isAdminPreview: false },
        res,
      ),
    ).toBe(true);
    expect(res.send).not.toHaveBeenCalled();
  });
});
