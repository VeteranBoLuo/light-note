import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: { query: vi.fn().mockResolvedValue([[]]) } }));

// auth.js 依赖 common.js(resultData),存在 common.js↔router↔handler 循环依赖:
// 先 import common.js 让 handler 作为叶子完成初始化,规避循环(同 commonHandle.test.js)。
await import('./common.js');
const { accountBanMiddleware, ensureNotVisitor, isVisitorWorkspaceContentWrite } = await import('./auth.js');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
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

describe('游客内容维护权限', () => {
  it('仅识别明确列出的书签/笔记/标签写路径', () => {
    expect(isVisitorWorkspaceContentWrite({ originalUrl: '/api/note/updateNote?from=auto-save' })).toBe(true);
    expect(isVisitorWorkspaceContentWrite({ originalUrl: '/api/bookmark/addTag' })).toBe(true);
    expect(isVisitorWorkspaceContentWrite({ originalUrl: '/api/file/uploadFile' })).toBe(false);
    expect(isVisitorWorkspaceContentWrite({ originalUrl: '/api/user/saveUserInfo' })).toBe(false);
  });

  it('真实 root 建立的游客工作区可执行白名单内容写入', () => {
    const req = {
      originalUrl: '/api/note/updateNote',
      user: { id: 'visitor-1', role: 'visitor' },
      adminActor: { id: 'root-1', role: 'root' },
      isAdminPreview: true,
      isVisitorWorkspace: true,
    };
    const res = mockRes();
    expect(ensureNotVisitor(req, res)).toBe(true);
    expect(req.isVisitorWorkspaceContentWrite).toBe(true);
    expect(res.send).not.toHaveBeenCalled();
  });

  it('游客工作区不能写云空间或后台接口', () => {
    const req = {
      originalUrl: '/api/file/updateFile',
      user: { id: 'visitor-1', role: 'visitor' },
      adminActor: { id: 'root-1', role: 'root' },
      isAdminPreview: true,
      isVisitorWorkspace: true,
    };
    const res = mockRes();
    expect(ensureNotVisitor(req, res)).toBe(false);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('普通用户的管理员预览保持只读', () => {
    const req = {
      originalUrl: '/api/note/updateNote',
      user: { id: 'user-1', role: 'user' },
      adminActor: { id: 'root-1', role: 'root' },
      isAdminPreview: true,
      isVisitorWorkspace: false,
    };
    const res = mockRes();
    expect(ensureNotVisitor(req, res)).toBe(false);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
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
