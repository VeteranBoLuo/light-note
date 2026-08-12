import { attachAdminContextRequestAudit } from './adminContextAudit.js';

export const ADMIN_POLICIES = Object.freeze({
  READ: 'read',
  CONTENT_WRITE: 'content_write',
  BACKGROUND_WRITE: 'background_write',
  AI_USE: 'ai_use',
  AI_STATE_WRITE: 'ai_state_write',
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
  ['POST', '/bookmark/resolveUrl'],
  ['POST', '/bookmark/snapshot'],
  ['GET', '/bookmark/health'],
  ['POST', '/bookmark/getIconBatchStatus'],
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
  ['POST', '/bookmark/importBookmarksExcel'],
  ['POST', '/bookmark/archive'],
  ['POST', '/bookmark/health/ignore'],
  // AI 整理"应用"是对 subject 的真实内容写(建标签/加关系/补书签名称),必须 maintain-only、readonly 阻断,
  // 不能归 AI_USE(否则只读预览代管也能落库,违反"readonly 阻断写")。
  ['POST', '/bookmark/ai/organize/apply'],
  ['POST', '/bookmark/retryIconBatchFailures'],
]);

declare(ADMIN_POLICIES.AI_USE, 'bookmark', [
  ['POST', '/bookmark/summarize'],
  ['POST', '/bookmark/ai/organize/quote'],
  ['POST', '/bookmark/ai/organize/run'],
]);

declare(ADMIN_POLICIES.CONTENT_DESTRUCTIVE, 'bookmark', [
  ['POST', '/bookmark/health/check'],
  ['POST', '/bookmark/health/checkAll'],
  ['POST', '/bookmark/health/reset'],
]);

declare(ADMIN_POLICIES.READ, 'note', [
  ['POST', '/note/queryNoteList'],
  ['POST', '/note/getNoteTreeFeatures'],
  ['POST', '/note/queryNoteTree'],
  ['POST', '/note/queryNoteBreadcrumb'],
  ['POST', '/note/getNoteDetail'],
  ['POST', '/note/getNotesForExport'],
  ['POST', '/note/resolveResourceRefs'],
  ['POST', '/note/resourceBacklinks'],
  ['POST', '/note/queryNoteTagList'],
  ['POST', '/note/getNoteTags'],
  ['POST', '/note/getNoteVersions'],
  ['POST', '/note/getNoteVersionDetail'],
  ['POST', '/note/queryNoteTemplates'],
  ['POST', '/note/getNoteTemplateDetail'],
  // 导出中转不改用户内容,只把已可读的笔记正文换成一次性下载地址,与 /file/downloadFileById 同属只读
  ['POST', '/note/exportFile'],
  ['GET', '/note/exportFile'],
]);

declare(ADMIN_POLICIES.CONTENT_WRITE, 'note', [
  ['POST', '/note/uploadImage'],
  ['POST', '/note/updateNote'],
  ['POST', '/note/convertMode'],
  ['POST', '/note/addNote'],
  ['POST', '/note/moveNoteNode'],
  ['POST', '/note/moveNoteNodes'],
  ['POST', '/note/delNote'],
  ['POST', '/note/deleteNoteSubtree'],
  ['POST', '/note/updateNoteSort'],
  ['POST', '/note/toggleNoteTop'],
  ['POST', '/note/addNoteTag'],
  ['POST', '/note/editNoteTag'],
  ['POST', '/note/delNoteTag'],
  ['POST', '/note/updateNoteTags'],
  ['POST', '/note/restoreNoteVersion'],
  ['POST', '/note/addNoteTemplate'],
  ['POST', '/note/updateNoteTemplate'],
  ['POST', '/note/duplicateNoteTemplate'],
]);

// 模板为硬删除(轻量可再生数据不接回收站),按不可逆内容操作声明,maintain 模式不予放行
declare(ADMIN_POLICIES.CONTENT_DESTRUCTIVE, 'note', [['POST', '/note/delNoteTemplate']]);

declare(ADMIN_POLICIES.AI_USE, 'note', [['POST', '/note/assist']]);

declare(ADMIN_POLICIES.READ, 'file', [
  ['POST', '/file/queryFiles'],
  ['POST', '/file/downloadFileById'],
  ['POST', '/file/checkFileNames'],
  ['POST', '/file/queryTotalFileSize'],
  ['POST', '/file/getFileInfo'],
  ['POST', '/file/preview/resolve'],
  ['POST', '/file/preview/archive'],
  ['POST', '/file/queryFolder'],
  ['POST', '/file/getFileTags'],
  ['POST', '/file/share/list'],
  ['POST', '/file/share/resolve'],
  ['POST', '/file/share/download'],
  ['POST', '/file/share/preview/prepare'],
  ['POST', '/file/share/preview/resolve'],
  ['POST', '/file/share/preview/archive'],
]);

declare(ADMIN_POLICIES.CONTENT_WRITE, 'file', [
  ['POST', '/file/uploadFiles'],
  ['POST', '/file/confirmUpload'],
  ['POST', '/file/deleteFileById'],
  ['POST', '/file/updateFile'],
  ['POST', '/file/preview/prepare'],
  ['POST', '/file/addFolder'],
  ['POST', '/file/associateFile'],
  ['POST', '/file/updateFolder'],
  ['POST', '/file/deleteFolder'],
  ['POST', '/file/updateFolderSort'],
  ['POST', '/file/updateFileTags'],
  ['POST', '/file/share/create'],
  ['POST', '/file/share/revoke'],
  ['POST', '/file/share/rotate'],
]);
declare(ADMIN_POLICIES.CONTENT_DESTRUCTIVE, 'file', [['POST', '/file/hermesBackup']]);

declare(ADMIN_POLICIES.READ, 'search', [
  ['POST', '/search/global'],
  ['POST', '/search/batchSelectionPreview'],
  ['POST', '/search/batchResourceTagWorkspace'],
  ['POST', '/workbench/summary'],
  // 移动端「今日」轻量聚合，与工作台概览同属只读
  ['POST', '/workbench/today'],
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
  ['POST', '/todo/v2/config'],
  ['POST', '/todo/v2/preview'],
  ['POST', '/todo/v2/update-preview'],
  ['POST', '/todo/v2/convert-preview'],
  // 日历导出中转不改用户内容,只把已可读的待办换成一次性下载地址,与 /note/exportFile 同属只读
  ['POST', '/todo/exportCalendar'],
  ['GET', '/todo/exportCalendar'],
]);
// 待办属于账号私有行动数据，首期不开放管理员代管；普通请求不受该策略影响。
declare(ADMIN_POLICIES.ACCOUNT_WRITE, 'todo', [
  ['POST', '/todo/create'],
  ['POST', '/todo/update'],
  ['POST', '/todo/complete'],
  ['POST', '/todo/reopen'],
  ['POST', '/todo/delete'],
  ['POST', '/todo/restore'],
  ['POST', '/todo/batch-status'],
  ['POST', '/todo/batch-delete'],
  ['POST', '/todo/batch-restore'],
  ['POST', '/todo/reorder'],
  ['POST', '/todo/snooze'],
  ['POST', '/todo/v2/create'],
  ['POST', '/todo/v2/update'],
  ['POST', '/todo/v2/convert'],
  ['POST', '/todo/v2/series/pause'],
  ['POST', '/todo/v2/series/resume'],
  ['POST', '/todo/v2/series/stop'],
  ['POST', '/todo/v2/instance/skip'],
  ['POST', '/todo/v2/delete'],
]);
declare(ADMIN_POLICIES.CONTENT_WRITE, 'search', [
  ['POST', '/search/batchUpdateResourceTags'],
  ['POST', '/search/batchAddResourcesToInbox'],
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
  ['POST', '/common/resolveHelpSources'],
  ['GET', '/common/noticeSummary'],
  ['POST', '/json/getConfigByName'],
  ['GET', '/helpCenter'],
  ['GET', '/helpCenter/:id'],
  ['GET', '/sitemap.xml'],
]);
// 安装包永久地址：只做一次 302 到静态文件，不读用户数据，代管上下文下同样放行
declare(ADMIN_POLICIES.READ, 'app', [['GET', '/app/android/latest.apk']]);
declare(ADMIN_POLICIES.READ, 'update_log', [
  ['POST', '/updateLog/list'],
  ['GET', '/updateLog/image/:logId/:fileName'],
]);
declare(ADMIN_POLICIES.ADMIN_ONLY, 'update_log', [
  ['POST', '/updateLog/manageList'],
  ['POST', '/updateLog/createDraft'],
  ['POST', '/updateLog/save'],
  ['POST', '/updateLog/delete'],
  ['POST', '/updateLog/cleanupImages'],
  ['POST', '/updateLog/uploadImage'],
]);
declare(ADMIN_POLICIES.CONTENT_WRITE, 'common', [['POST', '/common/analyzeImgUrl']]);
declare(ADMIN_POLICIES.BACKGROUND_WRITE, 'telemetry', [
  ['POST', '/common/recordOperationLogs'],
  ['POST', '/common/recordAiEvent'],
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
  ['POST', '/user/github/authorize'],
  ['POST', '/user/github'],
  ['POST', '/user/saveUserInfo'],
  ['GET', '/user/deleteUserById'],
  ['POST', '/user/logout'],
  ['POST', '/user/configPassword'],
  ['POST', '/user/getMySessions'],
  ['POST', '/user/revokeSession'],
  ['POST', '/user/requestAccountDeletionCode'],
  ['POST', '/user/deleteMyAccount'],
  ['POST', '/user/exportData'],
  ['POST', '/user/importData'],
  ['POST', '/user/sendEmail'],
  ['POST', '/user/verifyCode'],
  ['POST', '/user/appeal'],
  ['POST', '/opinion/recordOpinion'],
]);

declare(ADMIN_POLICIES.READ, 'notification', [
  ['POST', '/notification/list'],
  ['POST', '/notification/unreadCount'],
]);

// 应用级聊天室角标会先查询访问能力；这两个接口只计算并返回权限/未读数，
// 不推进 community_chat_reads。真正改变已读位置的 PUT /rooms/:slug/read 不在此处放行。
declare(ADMIN_POLICIES.READ, 'community_chat', [
  ['GET', '/community-chat/access'],
  ['GET', '/community-chat/rooms'],
]);

declare(ADMIN_POLICIES.READ, 'feature_request', [
  ['POST', '/featureRequest/listPublic'],
  ['POST', '/featureRequest/getPublicDetail'],
]);
declare(ADMIN_POLICIES.ACCOUNT_WRITE, 'feature_request', [
  ['POST', '/featureRequest/create'],
  ['POST', '/featureRequest/listMine'],
  ['POST', '/featureRequest/toggleVote'],
  ['POST', '/featureRequest/addSubmitterUpdate'],
]);
declare(ADMIN_POLICIES.BACKGROUND_WRITE, 'notification', [
  ['POST', '/notification/markRead'],
  ['POST', '/notification/markAllRead'],
  ['POST', '/notification/delete'],
  ['POST', '/growth/notices/read'],
  ['POST', '/opinion/markOpinionReplyViewed'],
  ['GET', '/opinion/getOpinionNotice'],
]);

declare(ADMIN_POLICIES.READ, 'growth', [
  ['GET', '/growth/me'],
  ['GET', '/growth/dashboard'],
  ['GET', '/growth/tasks'],
  ['GET', '/growth/ranks'],
  ['GET', '/growth/weeklyReport'],
  ['GET', '/growth/shop'],
  ['GET', '/growth/inventory'],
  ['GET', '/growth/lottery'],
  ['GET', '/growth/recap'],
  ['GET', '/growth/claimable'],
  ['GET', '/growth/weekly'],
  ['GET', '/growth/points/log'],
  ['GET', '/growth/heatmap'],
]);
declare(ADMIN_POLICIES.ENTITLEMENT_WRITE, 'growth', [
  ['POST', '/growth/checkin'],
  ['POST', '/growth/useProtectCard'],
  ['POST', '/growth/claimDailyBonus'],
  ['POST', '/growth/tasks/claim'],
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
  ['POST', '/chat/agent/recover'],
  ['POST', '/chat/agent/follow-ups'],
  ['POST', '/chat/agent/interactions/respond'],
  ['POST', '/chat/generateBookmarkMeta'],
  ['POST', '/chat/generateBookmarkDescription'],
  ['POST', '/chat/generateTagIcon'],
  ['POST', '/tagIcon/search'],
  ['POST', '/tagIcon/resolve'],
]);

declare(ADMIN_POLICIES.READ, 'agent', [
  ['POST', '/chat/conversations/list'],
  ['POST', '/chat/conversations/get'],
  ['POST', '/chat/conversations/lineage'],
  ['POST', '/chat/conversations/messages/versions'],
  ['POST', '/chat/conversations/export'],
  ['POST', '/chat/conversations/note-targets'],
  ['POST', '/chat/conversations/reuse-note/blocks'],
  ['POST', '/chat/change-sets/list'],
  ['POST', '/chat/change-sets/get'],
  ['POST', '/chat/memories/list'],
  ['POST', '/chat/attachments/status'],
  ['POST', '/chat/aiQuota'],
]);

declare(ADMIN_POLICIES.AI_STATE_WRITE, 'agent', [
  ['POST', '/chat/conversations/create'],
  // 将失效本地会话迁移为新云端会话，会创建会话及消息记录，按 AI 状态写入约束。
  ['POST', '/chat/conversations/recover-local'],
  ['POST', '/chat/conversations/update'],
  ['POST', '/chat/conversations/delete'],
  ['POST', '/chat/conversations/restore'],
  ['POST', '/chat/conversations/clear'],
  ['POST', '/chat/conversations/clear-all-data'],
  ['POST', '/chat/conversations/messages/save'],
  ['POST', '/chat/conversations/messages/version-group'],
  ['POST', '/chat/conversations/branch'],
  ['POST', '/chat/conversations/feedback'],
  ['POST', '/chat/conversations/reuse-note/prepare'],
  ['POST', '/chat/change-sets/create'],
  ['POST', '/chat/change-sets/propose'],
  ['POST', '/chat/change-sets/update'],
  ['POST', '/chat/change-sets/revalidate-retry'],
]);

declare(ADMIN_POLICIES.CONTENT_WRITE, 'agent', [
  ['POST', '/chat/agent/actions/prepare'],
  ['POST', '/chat/agent/confirm'],
  ['POST', '/chat/agent/confirm/note-directory'],
  ['POST', '/chat/agent/confirm/reject'],
  ['POST', '/chat/attachments/init'],
  ['POST', '/chat/attachments/confirm'],
  ['POST', '/chat/attachments/attachCloudFile'],
  ['POST', '/chat/attachments/delete'],
  ['POST', '/chat/attachments/clearTemporary'],
]);

declare(ADMIN_POLICIES.CONTENT_WRITE, 'note', [['POST', '/chat/conversations/save-note']]);
declare(ADMIN_POLICIES.ACCOUNT_WRITE, 'ai_memory', [
  ['POST', '/chat/memories/create'],
  ['POST', '/chat/memories/confirm'],
  ['POST', '/chat/memories/update'],
  ['POST', '/chat/memories/delete'],
  ['POST', '/chat/memories/clear'],
]);
declare(ADMIN_POLICIES.CONTENT_WRITE, 'agent', [
  ['POST', '/chat/change-sets/apply'],
  ['POST', '/chat/change-sets/retry'],
  ['POST', '/chat/change-sets/undo'],
]);

declare(ADMIN_POLICIES.ADMIN_ONLY, 'admin', [
  ['POST', '/user/getUserList'],
  ['POST', '/user/admin/detail'],
  // 管理员私有备注只能在普通 Root 管理会话中维护，不能借目标用户代管上下文读写。
  ['POST', '/user/admin/remark'],
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
  ['POST', '/resource-governance/scans'],
  ['GET', '/resource-governance/scans/:id'],
  ['POST', '/resource-governance/findings/query'],
  ['GET', '/resource-governance/findings/:id'],
  ['POST', '/resource-governance/findings/ignore'],
  ['POST', '/resource-governance/invalid-owners/cleanup'],
  ['POST', '/resource-governance/jobs/preview'],
  ['POST', '/resource-governance/jobs'],
  ['POST', '/resource-governance/jobs/query'],
  ['GET', '/resource-governance/jobs/:id'],
  ['POST', '/resource-governance/jobs/:id/retry'],
  ['POST', '/resource-governance/jobs/:id/cancel'],
  ['POST', '/resource-governance/audits/query'],
  ['POST', '/common/getAgentLogs'],
  ['POST', '/common/getAgentLogChain'],
  ['POST', '/common/getAgentLogsSummary'],
  ['POST', '/common/getAiFeedback'],
  ['POST', '/common/updateAdminAiFeedbackTriage'],
  ['POST', '/common/getDeepSeekBalance'],
  ['POST', '/common/getAdminOverview'],
  ['POST', '/common/getAdminOverviewRecent'],
  ['POST', '/todo/v2/admin/diagnostics'],
  ['POST', '/common/getAdminOverviewTrend'],
  ['POST', '/common/getAdminActionCenter'],
  ['POST', '/common/getAdminTodoReminderDiagnostic'],
  ['POST', '/common/retryAdminAsyncJob'],
  ['POST', '/common/dismissAdminAsyncJob'],
  ['POST', '/common/getAdminOperationAudits'],
  ['POST', '/common/getAdminProductInsights'],
  ['POST', '/common/getAdminGovernance'],
  ['POST', '/aiEvaluation/runs'],
  ['POST', '/aiEvaluation/runs/start'],
  ['POST', '/notification/send'],
  ['POST', '/notification/admin/stats'],
  ['POST', '/notification/admin/list'],
  ['POST', '/notification/admin/recall'],
  ['POST', '/notification/admin/delete'],
  ['POST', '/notification/admin/recipients'],
  ['POST', '/notification/admin/email/stats'],
  ['POST', '/notification/admin/email/list'],
  ['POST', '/notification/admin/email/detail'],
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
  ['POST', '/security/v2/overview'],
  ['POST', '/security/v2/review/clusters'],
  ['POST', '/security/v2/review/batch-disposition'],
  ['GET', '/security/v2/review/clusters/:eventId'],
  ['POST', '/security/v2/events/:eventId/disposition'],
  ['POST', '/security/v2/clusters/:eventId/disposition'],
  ['POST', '/security/v2/rules/quality'],
  ['POST', '/security/v2/rules/:ruleCode/override'],
  ['POST', '/security/v2/rules/:ruleCode/replay'],
  ['POST', '/security/v2/exceptions/list'],
  ['POST', '/security/v2/exceptions/save'],
  ['POST', '/security/v2/exceptions/disable'],
  ['POST', '/security/v2/restrictions/list'],
  ['POST', '/security/v2/restrictions/apply'],
  ['POST', '/security/v2/restrictions/revoke'],
  ['POST', '/security/v2/source-denies/list'],
  ['POST', '/security/v2/source-denies/apply'],
  ['POST', '/security/v2/source-denies/revoke'],
  ['POST', '/growth/admin/userGrowth'],
  ['POST', '/growth/admin/adjust'],
  ['POST', '/growth/admin/pointsOverview'],
  ['POST', '/growth/admin/userPoints'],
  ['POST', '/growth/admin/searchUsers'],
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
  ['POST', '/featureRequest/admin/list'],
  ['POST', '/featureRequest/admin/create'],
  ['POST', '/featureRequest/admin/review'],
  ['POST', '/featureRequest/admin/reply'],
  ['POST', '/featureRequest/admin/updateStatus'],
  ['POST', '/featureRequest/admin/deleteUpdate'],
  ['POST', '/featureRequest/admin/merge'],
  ['POST', '/featureRequest/admin/edit'],
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
  if (/^\/security\/v2\/review\/clusters\/[^/]+$/.test(path)) {
    return routePolicies.get(`${method} /security/v2/review/clusters/:eventId`);
  }
  if (/^\/security\/v2\/(?:events|clusters)\/[^/]+\/disposition$/.test(path)) {
    const kind = path.startsWith('/security/v2/events/') ? 'events' : 'clusters';
    return routePolicies.get(`${method} /security/v2/${kind}/:eventId/disposition`);
  }
  if (/^\/security\/v2\/rules\/[^/]+\/(?:override|replay)$/.test(path)) {
    const action = path.endsWith('/override') ? 'override' : 'replay';
    return routePolicies.get(`${method} /security/v2/rules/:ruleCode/${action}`);
  }
  if (/^\/helpCenter\/[^/]+$/.test(path)) {
    return routePolicies.get(`${method} /helpCenter/:id`);
  }
  if (/^\/updateLog\/image\/[^/]+\/[^/]+$/.test(path)) {
    return routePolicies.get(`${method} /updateLog/image/:logId/:fileName`);
  }
  if (/^\/resource-governance\/(?:scans|findings|jobs)\/[^/]+$/.test(path)) {
    const resource = path.split('/')[2];
    return routePolicies.get(`${method} /resource-governance/${resource}/:id`);
  }
  if (/^\/resource-governance\/jobs\/[^/]+\/(?:retry|cancel)$/.test(path)) {
    const action = path.endsWith('/retry') ? 'retry' : 'cancel';
    return routePolicies.get(`${method} /resource-governance/jobs/:id/${action}`);
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
    req.suppressUserRewards = true;
    req.suppressConversionTracking = true;
    req.isVisitorWorkspaceContentWrite = req.adminContext.subjectRole === 'visitor';
    return next();
  }

  if (capability.policy === ADMIN_POLICIES.AI_STATE_WRITE) {
    if (req.adminContext.mode !== 'maintain') {
      return sendPolicyError(res, 403, 'ADMIN_PREVIEW_READONLY', '管理员当前处于只读预览模式。');
    }
    req.suppressUserRewards = true;
    req.suppressConversionTracking = true;
    return next();
  }

  if (capability.policy === ADMIN_POLICIES.AI_USE) {
    req.suppressUserRewards = true;
    req.suppressConversionTracking = true;
    return next();
  }

  return sendPolicyError(res, 403, 'ADMIN_MAINTENANCE_FORBIDDEN', '该操作不属于管理员内容维护允许范围。');
}

export function getDeclaredAdminRoutePolicies() {
  return new Map(routePolicies);
}
