import { attachAdminContextRequestAudit } from './adminContextAudit.js';

export const ADMIN_POLICIES = Object.freeze({
  READ: 'read',
  CONTENT_WRITE: 'content_write',
  BACKGROUND_WRITE: 'background_write',
  AI_USE: 'ai_use',
  CONTENT_DESTRUCTIVE: 'content_destructive',
  ACCOUNT_WRITE: 'account_write',
  ENTITLEMENT_WRITE: 'entitlement_write',
  ADMIN_ONLY: 'admin_only',
});

const routePolicies = new Map();

function declare(policy, resourceType, routes) {
  for (const [method, path] of routes) {
    routePolicies.set(`${method.toUpperCase()} ${path}`, { policy, resourceType });
  }
}

declare(ADMIN_POLICIES.READ, 'bookmark', [
  ['POST', '/bookmark/queryTagList'],
  ['POST', '/bookmark/getTagDetail'],
  ['POST', '/bookmark/getRelatedTag'],
  ['POST', '/bookmark/getTagGraph'],
  ['POST', '/bookmark/getGlobalGraph'],
  ['POST', '/bookmark/getBookmarkList'],
  ['POST', '/bookmark/getBookmarkDetail'],
  ['POST', '/bookmark/getCommonBookmarks'],
  ['POST', '/bookmark/snapshot'],
  ['GET', '/bookmark/health'],
]);

declare(ADMIN_POLICIES.CONTENT_WRITE, 'bookmark', [
  ['POST', '/bookmark/updateTagSort'],
  ['POST', '/bookmark/addTag'],
  ['POST', '/bookmark/delTag'],
  ['POST', '/bookmark/updateTag'],
  ['POST', '/bookmark/addBookmark'],
  ['POST', '/bookmark/delBookmark'],
  ['POST', '/bookmark/updateBookmark'],
  ['POST', '/bookmark/updateBookmarkSort'],
  ['POST', '/bookmark/toggleBookmarkTop'],
  ['POST', '/bookmark/importBookmarksHtml'],
  ['POST', '/bookmark/archive'],
  ['POST', '/bookmark/health/ignore'],
]);

declare(ADMIN_POLICIES.AI_USE, 'bookmark', [
  ['POST', '/bookmark/summarize'],
  ['POST', '/bookmark/ai/organize/quote'],
  ['POST', '/bookmark/ai/organize/run'],
  ['POST', '/bookmark/ai/organize/apply'],
]);

declare(ADMIN_POLICIES.CONTENT_DESTRUCTIVE, 'bookmark', [
  ['POST', '/bookmark/health/check'],
  ['POST', '/bookmark/health/checkAll'],
  ['POST', '/bookmark/health/reset'],
]);

declare(ADMIN_POLICIES.READ, 'note', [
  ['POST', '/note/queryNoteList'],
  ['POST', '/note/getNoteDetail'],
  ['POST', '/note/queryNoteTagList'],
  ['POST', '/note/getNoteTags'],
  ['POST', '/note/getNoteVersions'],
  ['POST', '/note/getNoteVersionDetail'],
]);

declare(ADMIN_POLICIES.CONTENT_WRITE, 'note', [
  ['POST', '/note/uploadImage'],
  ['POST', '/note/updateNote'],
  ['POST', '/note/addNote'],
  ['POST', '/note/delNote'],
  ['POST', '/note/updateNoteSort'],
  ['POST', '/note/addNoteTag'],
  ['POST', '/note/editNoteTag'],
  ['POST', '/note/delNoteTag'],
  ['POST', '/note/updateNoteTags'],
  ['POST', '/note/restoreNoteVersion'],
]);

declare(ADMIN_POLICIES.AI_USE, 'note', [['POST', '/note/assist']]);

declare(ADMIN_POLICIES.READ, 'file', [
  ['POST', '/file/queryFiles'],
  ['POST', '/file/downloadFileById'],
  ['POST', '/file/checkFileNames'],
  ['POST', '/file/queryTotalFileSize'],
  ['POST', '/file/getFileInfo'],
  ['POST', '/file/queryFolder'],
  ['POST', '/file/getFileTags'],
]);

declare(ADMIN_POLICIES.CONTENT_WRITE, 'file', [
  ['POST', '/file/uploadFiles'],
  ['POST', '/file/confirmUpload'],
  ['POST', '/file/deleteFileById'],
  ['POST', '/file/updateFile'],
  ['POST', '/file/addFolder'],
  ['POST', '/file/associateFile'],
  ['POST', '/file/updateFolder'],
  ['POST', '/file/deleteFolder'],
  ['POST', '/file/updateFolderSort'],
  ['POST', '/file/updateFileTags'],
]);
declare(ADMIN_POLICIES.CONTENT_DESTRUCTIVE, 'file', [['POST', '/file/hermesBackup']]);

declare(ADMIN_POLICIES.READ, 'search', [
  ['POST', '/search/global'],
  ['POST', '/search/batchResourceTagWorkspace'],
  ['POST', '/workbench/summary'],
]);

declare(ADMIN_POLICIES.READ, 'inbox', [
  ['POST', '/inbox/list'],
  ['POST', '/inbox/count'],
]);
declare(ADMIN_POLICIES.CONTENT_WRITE, 'inbox', [
  ['POST', '/inbox/enqueue'],
  ['POST', '/inbox/complete'],
]);
declare(ADMIN_POLICIES.READ, 'todo', [
  ['POST', '/todo/list'],
  ['POST', '/todo/count'],
]);
// 待办属于账号私有行动数据，首期不开放管理员代管；普通请求不受该策略影响。
declare(ADMIN_POLICIES.ACCOUNT_WRITE, 'todo', [
  ['POST', '/todo/create'],
  ['POST', '/todo/update'],
  ['POST', '/todo/complete'],
  ['POST', '/todo/reopen'],
  ['POST', '/todo/delete'],
]);
declare(ADMIN_POLICIES.CONTENT_WRITE, 'search', [
  ['POST', '/search/batchUpdateResourceTags'],
  ['POST', '/search/batchDeleteResources'],
]);

declare(ADMIN_POLICIES.READ, 'trash', [
  ['POST', '/trash/list'],
  ['POST', '/trash/fileSize'],
]);
declare(ADMIN_POLICIES.CONTENT_WRITE, 'trash', [
  ['POST', '/trash/restore'],
  ['POST', '/trash/restoreAll'],
]);
declare(ADMIN_POLICIES.CONTENT_DESTRUCTIVE, 'trash', [
  ['POST', '/trash/permanentDelete'],
  ['POST', '/trash/emptyAll'],
]);

declare(ADMIN_POLICIES.READ, 'common', [
  ['POST', '/common/getImages'],
  ['POST', '/common/getHelpConfig'],
  ['GET', '/common/noticeSummary'],
  ['POST', '/json/getConfigByName'],
  ['GET', '/helpCenter'],
  ['GET', '/helpCenter/:id'],
  ['GET', '/sitemap.xml'],
]);
declare(ADMIN_POLICIES.CONTENT_WRITE, 'common', [['POST', '/common/analyzeImgUrl']]);
declare(ADMIN_POLICIES.BACKGROUND_WRITE, 'telemetry', [
  ['POST', '/common/recordOperationLogs'],
  ['POST', '/common/recordConversion'],
]);

declare(ADMIN_POLICIES.READ, 'user', [
  ['GET', '/user/getUserInfo'],
  ['GET', '/user/me'],
  ['GET', '/user/adminContext/status'],
]);
declare(ADMIN_POLICIES.ADMIN_ONLY, 'admin_context', [['POST', '/user/adminContext/end']]);
declare(ADMIN_POLICIES.ADMIN_ONLY, 'admin_context', [['POST', '/user/adminContext/start']]);
declare(ADMIN_POLICIES.ACCOUNT_WRITE, 'user', [
  ['POST', '/user/login'],
  ['POST', '/user/registerUser'],
  ['POST', '/user/github'],
  ['POST', '/user/saveUserInfo'],
  ['GET', '/user/deleteUserById'],
  ['POST', '/user/logout'],
  ['POST', '/user/configPassword'],
  ['POST', '/user/getMySessions'],
  ['POST', '/user/revokeSession'],
  ['POST', '/user/exportData'],
  ['POST', '/user/importData'],
  ['POST', '/user/sendEmail'],
  ['POST', '/user/verifyCode'],
  ['POST', '/user/appeal'],
  ['POST', '/opinion/recordOpinion'],
]);

declare(ADMIN_POLICIES.BACKGROUND_WRITE, 'notification', [
  ['POST', '/notification/list'],
  ['POST', '/notification/unreadCount'],
  ['POST', '/notification/markRead'],
  ['POST', '/notification/markAllRead'],
  ['POST', '/notification/delete'],
  ['POST', '/growth/notices/read'],
  ['POST', '/opinion/markOpinionReplyViewed'],
  ['GET', '/opinion/getOpinionNotice'],
]);

declare(ADMIN_POLICIES.READ, 'growth', [
  ['GET', '/growth/me'],
  ['GET', '/growth/shop'],
  ['GET', '/growth/inventory'],
  ['GET', '/growth/lottery'],
  ['GET', '/growth/recap'],
  ['GET', '/growth/claimable'],
  ['GET', '/growth/weekly'],
  ['GET', '/growth/points/log'],
]);
declare(ADMIN_POLICIES.ENTITLEMENT_WRITE, 'growth', [
  ['POST', '/growth/checkin'],
  ['POST', '/growth/useProtectCard'],
  ['POST', '/growth/claimDailyBonus'],
  ['POST', '/growth/shop/buy'],
  ['POST', '/growth/item/use'],
  ['POST', '/growth/equipTitle'],
  ['POST', '/growth/equipFrame'],
  ['POST', '/growth/lottery/draw'],
  ['POST', '/growth/achievement/claim'],
  ['POST', '/growth/claimAll'],
  ['POST', '/growth/weekly/claim'],
]);

declare(ADMIN_POLICIES.AI_USE, 'agent', [
  ['POST', '/chat/agent'],
  ['POST', '/chat/agent/confirm'],
  ['POST', '/chat/agent/confirm/reject'],
  ['POST', '/chat/aiQuota'],
  ['POST', '/chat/generateBookmarkMeta'],
  ['POST', '/chat/generateBookmarkDescription'],
  ['POST', '/chat/generateTagIcon'],
]);

declare(ADMIN_POLICIES.ADMIN_ONLY, 'admin', [
  ['POST', '/user/getUserList'],
  ['POST', '/common/getApiLogs'],
  ['GET', '/common/clearApiLogs'],
  ['POST', '/common/getConversionFunnel'],
  ['POST', '/common/getOperationLogs'],
  ['POST', '/common/getLogExclude'],
  ['POST', '/common/addLogExclude'],
  ['POST', '/common/removeLogExclude'],
  ['GET', '/common/clearOperationLogs'],
  ['POST', '/common/getIpLogStats'],
  ['POST', '/common/clearLogsByIp'],
  ['POST', '/common/clearImages'],
  ['POST', '/common/runSql'],
  ['POST', '/common/getAgentLogs'],
  ['POST', '/common/getAgentLogsSummary'],
  ['POST', '/common/getDeepSeekBalance'],
  ['POST', '/common/getAdminOverview'],
  ['POST', '/notification/send'],
  ['POST', '/notification/admin/stats'],
  ['POST', '/notification/admin/list'],
  ['POST', '/notification/admin/recall'],
  ['POST', '/opinion/getOpinionList'],
  ['POST', '/opinion/replyOpinion'],
  ['POST', '/opinion/delOpinion'],
  ['POST', '/security/overview'],
  ['POST', '/security/events'],
  ['GET', '/security/events/:eventId'],
  ['POST', '/security/events/:eventId/handle'],
  ['POST', '/security/events/batchHandle'],
  ['POST', '/security/ipReputation'],
  ['POST', '/security/ipAccounts'],
  ['POST', '/security/ipBan'],
  ['POST', '/security/ipUnban'],
  ['POST', '/security/accountBans'],
  ['POST', '/security/accountReputation'],
  ['POST', '/security/accountBan'],
  ['POST', '/security/accountUnban'],
  ['POST', '/security/rules'],
  ['POST', '/security/whitelist'],
  ['POST', '/security/whitelist/save'],
  ['POST', '/security/whitelist/remove'],
  ['GET', '/growth/dashboard'],
  ['GET', '/growth/ranks'],
  ['GET', '/growth/weeklyReport'],
  ['POST', '/growth/admin/userGrowth'],
  ['POST', '/growth/admin/adjust'],
  ['POST', '/growth/admin/pointsOverview'],
  ['POST', '/growth/admin/userPoints'],
  ['POST', '/growth/admin/grantPoints'],
  ['POST', '/json/deleteConfigById'],
  ['POST', '/json/updateConfig'],
  ['POST', '/knowledgeBase/list'],
  ['POST', '/knowledgeBase/get'],
  ['POST', '/knowledgeBase/search'],
  ['POST', '/knowledgeBase/create'],
  ['POST', '/knowledgeBase/update'],
  ['POST', '/knowledgeBase/delete'],
  ['POST', '/knowledgeBase/batchUpdateStatus'],
  ['POST', '/knowledgeBase/batchUpdateCategory'],
  ['POST', '/knowledgeBase/batchDelete'],
  ['POST', '/knowledgeBase/categories'],
]);

const normalizePath = (req) => {
  let path = String(req.originalUrl || req.path || '').split('?')[0];
  path = path.replace(/^\/api(?=\/)/, '');
  return path || '/';
};

function resolvePolicy(method, path) {
  const exact = routePolicies.get(`${method} ${path}`);
  if (exact) return exact;
  if (/^\/security\/events\/[^/]+$/.test(path)) {
    return routePolicies.get(`${method} /security/events/:eventId`);
  }
  if (/^\/security\/events\/[^/]+\/handle$/.test(path)) {
    return routePolicies.get(`${method} /security/events/:eventId/handle`);
  }
  if (/^\/helpCenter\/[^/]+$/.test(path)) {
    return routePolicies.get(`${method} /helpCenter/:id`);
  }
  return null;
}

function sendPolicyError(res, status, code, message) {
  return res.status(status).json({ data: { code }, status, msg: message });
}

export function adminRoutePolicyMiddleware(req, res, next) {
  if (!req.adminContext) return next();

  const path = normalizePath(req);
  const capability = resolvePolicy(req.method.toUpperCase(), path);
  req.adminCapability = capability || { policy: 'missing', resourceType: null };
  attachAdminContextRequestAudit(req, res);

  if (!capability) {
    return sendPolicyError(
      res,
      403,
      'ADMIN_CONTEXT_POLICY_MISSING',
      '该接口尚未声明管理员上下文策略，已按默认拒绝处理。',
    );
  }

  if (path === '/user/adminContext/end' && capability.policy === ADMIN_POLICIES.ADMIN_ONLY) {
    return next();
  }

  if (capability.policy === ADMIN_POLICIES.READ) return next();

  if (capability.policy === ADMIN_POLICIES.BACKGROUND_WRITE) {
    return res.json({
      data: { noop: true, adminContext: true },
      status: 200,
      msg: '',
    });
  }

  if (capability.policy === ADMIN_POLICIES.CONTENT_WRITE) {
    if (req.adminContext.mode !== 'maintain') {
      return sendPolicyError(res, 403, 'ADMIN_PREVIEW_READONLY', '管理员当前处于只读预览模式。');
    }
    if (req.adminContext.subjectRole === 'visitor' && capability.resourceType === 'file') {
      return sendPolicyError(
        res,
        403,
        'ADMIN_MAINTENANCE_FORBIDDEN',
        '游客展示账号不允许维护云空间内容。',
      );
    }
    req.suppressUserRewards = true;
    req.suppressConversionTracking = true;
    req.isVisitorWorkspaceContentWrite = req.adminContext.subjectRole === 'visitor';
    return next();
  }

  if (capability.policy === ADMIN_POLICIES.AI_USE) {
    req.suppressUserRewards = true;
    req.suppressConversionTracking = true;
    return next();
  }

  return sendPolicyError(
    res,
    403,
    'ADMIN_MAINTENANCE_FORBIDDEN',
    '该操作不属于管理员内容维护允许范围。',
  );
}

export function getDeclaredAdminRoutePolicies() {
  return new Map(routePolicies);
}
