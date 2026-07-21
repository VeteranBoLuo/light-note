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
      'featureRequest.js': '/featureRequest',
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
      const source = fs.readFileSync(path.join(routerDir, file), 'utf8').replace(/^\s*\/\/.*$/gm, '');
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

  it('管理员预览时放行目标用户的通知查询', () => {
    for (const path of ['/notification/list', '/notification/unreadCount']) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq(path), res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.json).not.toHaveBeenCalled();
    }
  });

  it('管理员预览时通知状态写入降级为空操作', () => {
    for (const path of ['/notification/markRead', '/notification/markAllRead', '/notification/delete']) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq(path), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { noop: true, adminContext: true } }));
    }
  });

  it('readonly 模式拒绝内容写入并返回稳定错误码', () => {
    const next = vi.fn();
    const res = createRes();
    adminRoutePolicyMiddleware(createReq('/note/updateNote'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_PREVIEW_READONLY' } }));
  });

  it('AI 整理"应用"是内容写:readonly 阻断、maintain 放行;只读的 quote/run 仍放行', () => {
    // apply = 真实写(建标签/关系/补名称),必须 maintain-only
    const denyNext = vi.fn();
    const denyRes = createRes();
    adminRoutePolicyMiddleware(createReq('/bookmark/ai/organize/apply', 'POST', 'readonly'), denyRes, denyNext);
    expect(denyNext).not.toHaveBeenCalled();
    expect(denyRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'ADMIN_PREVIEW_READONLY' } }),
    );

    const allowNext = vi.fn();
    const allowReq = createReq('/bookmark/ai/organize/apply', 'POST', 'maintain');
    adminRoutePolicyMiddleware(allowReq, createRes(), allowNext);
    expect(allowNext).toHaveBeenCalledTimes(1);
    expect(allowReq.suppressUserRewards).toBe(true);

    // quote/run 只产建议、不落库,仍属 AI_USE,readonly 可用
    for (const path of ['/bookmark/ai/organize/quote', '/bookmark/ai/organize/run']) {
      const next = vi.fn();
      adminRoutePolicyMiddleware(createReq(path, 'POST', 'readonly'), createRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('readonly 仅放行 Agent 问答和 AI 持久对象读取，拒绝所有状态写入', () => {
    for (const path of [
      '/chat/conversations/list',
      '/chat/conversations/get',
      '/chat/conversations/lineage',
      '/chat/conversations/messages/versions',
      '/chat/conversations/export',
      '/chat/conversations/reuse-note/blocks',
      '/chat/change-sets/list',
      '/chat/change-sets/get',
      '/chat/memories/list',
    ]) {
      const next = vi.fn();
      adminRoutePolicyMiddleware(createReq(path), createRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
    for (const path of [
      '/chat/conversations/create',
      '/chat/conversations/update',
      '/chat/conversations/delete',
      '/chat/conversations/restore',
      '/chat/conversations/clear',
      '/chat/conversations/clear-all-data',
      '/chat/conversations/messages/save',
      '/chat/conversations/messages/version-group',
      '/chat/conversations/branch',
      '/chat/conversations/feedback',
      '/chat/conversations/reuse-note/prepare',
      '/chat/change-sets/create',
      '/chat/change-sets/propose',
      '/chat/change-sets/update',
      '/chat/change-sets/revalidate-retry',
      '/chat/change-sets/retry',
    ]) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq(path), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_PREVIEW_READONLY' } }));
    }
  });

  it('maintain 可管理当前上下文 AI 状态', () => {
    for (const path of ['/chat/conversations/create', '/chat/change-sets/propose']) {
      const next = vi.fn();
      const req = createReq(path, 'POST', 'maintain');
      adminRoutePolicyMiddleware(req, createRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.suppressUserRewards).toBe(true);
      expect(req.suppressConversionTracking).toBe(true);
    }
  });

  it('maintain 模式放行可逆内容写入并抑制成长/转化副作用', () => {
    for (const path of ['/bookmark/updateBookmark', '/chat/change-sets/revalidate-retry', '/chat/change-sets/retry']) {
      const next = vi.fn();
      const req = createReq(path, 'POST', 'maintain');
      adminRoutePolicyMiddleware(req, createRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.suppressUserRewards).toBe(true);
      expect(req.suppressConversionTracking).toBe(true);
    }
  });

  it('游客维护上下文允许云空间可逆写入并继续抑制副作用', () => {
    const next = vi.fn();
    const req = createReq('/file/uploadFiles', 'POST', 'maintain', 'visitor');
    adminRoutePolicyMiddleware(req, createRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.suppressUserRewards).toBe(true);
    expect(req.suppressConversionTracking).toBe(true);
    expect(req.isVisitorWorkspaceContentWrite).toBe(true);
  });

  it('游客维护上下文仍拒绝云空间不可逆操作', () => {
    const next = vi.fn();
    const res = createRes();
    adminRoutePolicyMiddleware(createReq('/file/hermesBackup', 'POST', 'maintain', 'visitor'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' } }));
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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_CONTEXT_POLICY_MISSING' } }));
  });
});
