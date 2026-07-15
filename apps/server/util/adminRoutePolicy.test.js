import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('./adminContextAudit.js', () => ({
  attachAdminContextRequestAudit: vi.fn(),
}));

const { adminRoutePolicyMiddleware, getDeclaredAdminRoutePolicies } = await import('./adminRoutePolicy.js');

function createReq(path, method = 'POST', mode = 'readonly', subjectRole = 'user') {
  return {
    method,
    originalUrl: `/api${path}`,
    adminContext: { id: 'ctx-1', mode, subjectRole },
  };
}

function createRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('adminRoutePolicyMiddleware', () => {
  it('所有现有业务路由都显式声明策略', () => {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const routerDir = path.resolve(dirname, '../router');
    const prefixes = {
      'bookmark.js': '/bookmark',
      'chat.js': '/chat',
      'common.js': '/common',
      'file.js': '/file',
      'growth.js': '/growth',
      'inbox.js': '/inbox',
      'todo.js': '/todo',
      'json.js': '/json',
      'knowledgeBase.js': '/knowledgeBase',
      'noteLibrary.js': '/note',
      'notification.js': '/notification',
      'opinion.js': '/opinion',
      'search.js': '/search',
      'security.js': '/security',
      'seo.js': '',
      'trash.js': '/trash',
      'user.js': '/user',
      'workbench.js': '/workbench',
    };
    const declared = getDeclaredAdminRoutePolicies();
    const missing = [];
    for (const [file, prefix] of Object.entries(prefixes)) {
      const source = fs
        .readFileSync(path.join(routerDir, file), 'utf8')
        .replace(/^\s*\/\/.*$/gm, '');
      const matcher = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
      for (const match of source.matchAll(matcher)) {
        const key = `${match[1].toUpperCase()} ${prefix}${match[2]}`;
        if (!declared.has(key)) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });

  it('只读接口在 readonly 与 maintain 模式都放行', () => {
    for (const mode of ['readonly', 'maintain']) {
      const next = vi.fn();
      adminRoutePolicyMiddleware(createReq('/bookmark/getBookmarkList', 'POST', mode), createRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('readonly 模式拒绝内容写入并返回稳定错误码', () => {
    const next = vi.fn();
    const res = createRes();
    adminRoutePolicyMiddleware(createReq('/note/updateNote'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'ADMIN_PREVIEW_READONLY' } }),
    );
  });

  it('maintain 模式放行可逆内容写入并抑制成长/转化副作用', () => {
    const next = vi.fn();
    const req = createReq('/bookmark/updateBookmark', 'POST', 'maintain');
    adminRoutePolicyMiddleware(req, createRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.suppressUserRewards).toBe(true);
    expect(req.suppressConversionTracking).toBe(true);
  });

  it('游客维护上下文仍禁止云空间写入', () => {
    const next = vi.fn();
    const res = createRes();
    adminRoutePolicyMiddleware(createReq('/file/updateFile', 'POST', 'maintain', 'visitor'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' } }),
    );
  });

  it('后台轮询/埋点在上下文内降级为空操作', () => {
    const next = vi.fn();
    const res = createRes();
    adminRoutePolicyMiddleware(createReq('/common/recordConversion'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { noop: true, adminContext: true } }));
  });

  it('未声明接口默认拒绝', () => {
    const next = vi.fn();
    const res = createRes();
    adminRoutePolicyMiddleware(createReq('/unknown/action'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'ADMIN_CONTEXT_POLICY_MISSING' } }),
    );
  });
});
