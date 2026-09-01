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
      'adminAiOperations.js': '/admin/ai-operations',
      'chat.js': '/chat',
      'common.js': '/common',
      'dailyReview.js': '/daily-review',
      'file.js': '/file',
      'featureRequest.js': '/featureRequest',
      'growth.js': '/growth',
      'inbox.js': '/inbox',
      'infra.js': '/infra',
      'todo.js': '/todo',
      'toolbox.js': '/toolbox',
      'json.js': '/json',
      'knowledgeBase.js': '/knowledgeBase',
      'noteLibrary.js': '/note',
      'notification.js': '/notification',
      'opinion.js': '/opinion',
      'resourceGovernance.js': '/resource-governance',
      'search.js': '/search',
      'security.js': '/security',
      'seo.js': '',
      'support.js': '/support',
      'trash.js': '/trash',
      'updateLog.js': '/updateLog',
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

  it('管理员私有用户备注不允许在目标用户代管上下文中写入', () => {
    for (const mode of ['readonly', 'maintain']) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq('/user/admin/remark', 'POST', mode), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' } }));
    }
  });

  it('工具箱结果可随主体只读检查，但报价、扣积分、取消和保存均不可代执行', () => {
    for (const path of [
      '/toolbox/home',
      '/toolbox/jobs/job-1',
      '/toolbox/artifacts/artifact-1',
      '/toolbox/workspaces/workspace-1',
    ]) {
      const next = vi.fn();
      adminRoutePolicyMiddleware(createReq(path, 'GET', 'readonly'), createRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
    for (const path of [
      '/toolbox/quotes',
      '/toolbox/workspaces',
      '/toolbox/workspaces/workspace-1/resources',
      '/toolbox/workspaces/workspace-1/items',
      '/toolbox/workspaces/workspace-1/sessions',
      '/toolbox/workspaces/workspace-1/open',
      '/toolbox/jobs',
      '/toolbox/jobs/job-1/cancel',
      '/toolbox/artifacts/artifact-1/save',
    ]) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq(path, 'POST', 'maintain'), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' } }));
    }
  });

  it('插件授权与授权码交换不能在管理员代管上下文中代表目标用户执行', () => {
    for (const mode of ['readonly', 'maintain']) {
      for (const path of ['/user/extension/authorize', '/user/extension/exchange']) {
        const next = vi.fn();
        const res = createRes();
        adminRoutePolicyMiddleware(createReq(path, 'POST', mode), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' } }),
        );
      }
    }
  });

  it('功能公告已读只能写入真实登录账号，管理员代管上下文不能代点', () => {
    for (const mode of ['readonly', 'maintain']) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq('/user/feature-announcements/seen', 'POST', mode), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' } }));
    }
  });

  it('资源治理查询、重试和取消在任何代管上下文都失败关闭', () => {
    for (const [method, path] of [
      ['POST', '/resource-governance/findings/query'],
      ['POST', '/resource-governance/invalid-owners/cleanup'],
      ['GET', '/resource-governance/jobs/job-1'],
      ['POST', '/resource-governance/jobs/job-1/retry'],
      ['POST', '/resource-governance/jobs/job-1/cancel'],
    ]) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq(path, method, 'maintain'), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' } }));
    }
  });

  it('服务器指标、日志和动作在任何管理员代管上下文都失败关闭', () => {
    for (const [method, path] of [
      ['GET', '/infra/dashboard'],
      ['GET', '/infra/diagnostics'],
      ['GET', '/infra/services'],
      ['GET', '/infra/storage'],
      ['GET', '/infra/security'],
      ['GET', '/infra/logs/nginx'],
      ['POST', '/infra/actions'],
    ]) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq(path, method, 'maintain'), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' } }));
    }
  });

  it('只读接口在 readonly 与 maintain 模式都放行', () => {
    for (const mode of ['readonly', 'maintain']) {
      const next = vi.fn();
      adminRoutePolicyMiddleware(createReq('/bookmark/getBookmarkList', 'POST', mode), createRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('批量导出笔记读取在 readonly 与 maintain 模式都放行', () => {
    for (const mode of ['readonly', 'maintain']) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq('/note/getNotesForExport', 'POST', mode), res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.json).not.toHaveBeenCalled();
    }
  });

  it('卡片缩略图动态 GET 路径在 readonly 与 maintain 模式都按只读接口放行', () => {
    const fileName = `${'a'.repeat(64)}.webp`;
    for (const mode of ['readonly', 'maintain']) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq(`/note/image-thumbnail/${fileName}`, 'GET', mode), res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.json).not.toHaveBeenCalled();
    }
  });

  it('手绘位图缩略图读取按只读接口放行，上传仍受内容写权限约束', () => {
    for (const mode of ['readonly', 'maintain']) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq('/note/drawing-thumbnail/drawing-1/4.webp', 'GET', mode), res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.json).not.toHaveBeenCalled();
    }

    const headNext = vi.fn();
    const headRes = createRes();
    adminRoutePolicyMiddleware(
      createReq('/note/drawing-thumbnail/drawing-1/4.webp', 'HEAD', 'maintain'),
      headRes,
      headNext,
    );
    expect(headNext).toHaveBeenCalledTimes(1);
    expect(headRes.json).not.toHaveBeenCalled();

    const readonlyNext = vi.fn();
    const readonlyRes = createRes();
    adminRoutePolicyMiddleware(
      createReq('/note/uploadDrawingThumbnail', 'POST', 'readonly'),
      readonlyRes,
      readonlyNext,
    );
    expect(readonlyNext).not.toHaveBeenCalled();
    expect(readonlyRes.json).toHaveBeenCalled();
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

  it('聊天室访问能力与房间角标查询只读放行，不包含推进已读位置的接口', () => {
    const declared = getDeclaredAdminRoutePolicies();
    for (const path of ['/community-chat/access', '/community-chat/rooms']) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq(path, 'GET'), res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.json).not.toHaveBeenCalled();
    }
    expect(declared.has('PUT /community-chat/rooms/:slug/read')).toBe(false);
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

  it('笔记公开分享不允许管理员代替目标用户创建、撤销或轮换', () => {
    for (const mode of ['readonly', 'maintain']) {
      for (const path of ['/note/share/create', '/note/share/revoke', '/note/share/rotate']) {
        const next = vi.fn();
        const res = createRes();
        adminRoutePolicyMiddleware(createReq(path, 'POST', mode), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' } }),
        );
      }
    }
  });

  it('待办日历范围补齐属于账号写入，管理员代管上下文不能替目标用户生成实例', () => {
    for (const mode of ['readonly', 'maintain']) {
      const next = vi.fn();
      const res = createRes();
      adminRoutePolicyMiddleware(createReq('/todo/v2/calendar-range', 'POST', mode), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_MAINTENANCE_FORBIDDEN' } }));
    }
  });

  it('AI 整理"应用"是内容写:readonly 阻断、maintain 放行;只读的 quote/run 仍放行', () => {
    // apply = 真实写(建标签/关系/补名称),必须 maintain-only
    const denyNext = vi.fn();
    const denyRes = createRes();
    adminRoutePolicyMiddleware(createReq('/bookmark/ai/organize/apply', 'POST', 'readonly'), denyRes, denyNext);
    expect(denyNext).not.toHaveBeenCalled();
    expect(denyRes.json).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ADMIN_PREVIEW_READONLY' } }));

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

  it('管理员上下文可读取目标账号成长数据，但成长权益写入始终拒绝', () => {
    for (const path of [
      '/growth/me',
      '/growth/dashboard',
      '/growth/tasks',
      '/growth/ranks',
      '/growth/weeklyReport',
      '/growth/heatmap',
      '/growth/shop',
      '/growth/inventory',
      '/growth/lottery',
      '/growth/recap',
      '/growth/claimable',
      '/growth/preferences',
      '/growth/weekly',
      '/growth/points/log',
    ]) {
      const next = vi.fn();
      adminRoutePolicyMiddleware(createReq(path, 'GET', 'readonly'), createRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }

    for (const mode of ['readonly', 'maintain']) {
      for (const path of [
        '/growth/checkin',
        '/growth/tasks/claim',
        '/growth/shop/buy',
        '/growth/lottery/draw',
        '/growth/achievement/claim',
        '/growth/claimAll',
        '/growth/weekly/claim',
        '/growth/recap/state',
      ]) {
        const next = vi.fn();
        const res = createRes();
        adminRoutePolicyMiddleware(createReq(path, 'POST', mode), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      }
      const preferencesNext = vi.fn();
      const preferencesRes = createRes();
      adminRoutePolicyMiddleware(createReq('/growth/preferences', 'PUT', mode), preferencesRes, preferencesNext);
      expect(preferencesNext).not.toHaveBeenCalled();
      expect(preferencesRes.status).toHaveBeenCalledWith(403);
    }
  });

  it('管理员可只读检查已有每日回顾，但不能替目标账号生成、处理或跳过', () => {
    for (const mode of ['readonly', 'maintain']) {
      const readNext = vi.fn();
      adminRoutePolicyMiddleware(createReq('/daily-review/today', 'GET', mode), createRes(), readNext);
      expect(readNext).toHaveBeenCalledTimes(1);

      for (const path of [
        '/daily-review/today/ensure',
        '/daily-review/today/action',
        '/daily-review/items/3412f2d3-22a2-49b5-9485-5653c5eb8e62/action',
      ]) {
        const next = vi.fn();
        const res = createRes();
        adminRoutePolicyMiddleware(createReq(path, 'POST', mode), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      }
    }
  });

  it('maintain 模式放行可逆内容写入并抑制成长/转化副作用', () => {
    for (const path of ['/bookmark/updateBookmark', '/file/clearFolderFiles']) {
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
