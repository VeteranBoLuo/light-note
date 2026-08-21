const API_LOG_SKIP_SUBSTRINGS = Object.freeze([
  'Logs',
  'getUserInfo',
  'getUserList',
  'analyzeImgUrl',
  'getIconBatchStatus',
  'getRelatedTag',
  'getOpinionNotice',
  'noticeSummary',
  'aiQuota',
  'unreadCount', // 通知未读数：铃铛角标每 120s 轮询，高频且无操作审计价值。
]);

const PASSIVE_API_PATHS = new Set([
  '/json/getConfigByName', // 公开配置读取（更新日志滚动发布兼容期间仍会回退调用）。
  '/updateLog/list', // 公开更新日志读取，页面与构建预渲染都会调用。
  '/inbox/count', // 待处理角标读取，页面加载及构建预渲染会高频调用。
  '/support/state', // 支持页与 App 前台恢复读取，不包含操作审计价值。
  '/support/afdian/webhook', // 第三方订单载荷含留言/收货信息，绝不写入通用 API 日志。
  '/support/afdian/oauth/callback', // 回调查询参数含短时 code/state，由领域日志只记稳定结果码。
  '/community-chat/access', // 公共聊天室权限快照：前台恢复/安全刷新会反复读取，无操作审计价值。
  '/community-chat/rooms', // 频道目录与未读快照：属于被动状态同步。
  '/infra/dashboard', // 服务器管理前台默认每 3 秒读取一次快照，由独立运维审计记录真正的写动作。
  '/infra/services', // 固定服务状态为被动轮询快照，不复制到通用 API 日志。
  '/infra/storage', // 存储与 IO 为被动只读快照。
  '/infra/security', // 安全快照含登录来源等敏感运维信息，仅在页面内受限展示。
  '/common/recordAiEvent', // AI 产品事件已落独立无正文事件表，不在通用 API 日志重复保存。
  '/me', // 身份恢复探针只同步会话状态；使用精确路径，避免误伤 /messages。
]);

const NOTE_CONTENT_MUTATION_PATHS = new Set([
  '/note/addNote',
  '/note/updateNote',
  '/note/updateDrawingNote',
  '/note/uploadDrawingThumbnail',
  '/note/convertMode',
  '/note/addNoteTemplate',
  '/note/updateNoteTemplate',
]);

function normalizeApiPath(originalUrl) {
  const pathname = String(originalUrl || '').split(/[?#]/, 1)[0];
  return pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
}

function textLength(value) {
  return typeof value === 'string' ? value.length : 0;
}

function optionalScalar(value, maxLength = 255) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value).slice(0, maxLength);
}

/**
 * 通用 API 日志只保留排障所需的请求轮廓。笔记正文/手绘 scene 是用户内容，
 * 又会在自动保存中反复出现；这些路由只记 ID、版本、类型和长度，不复制原文。
 */
export function summarizeApiLogPayload(originalUrl, payload) {
  const path = normalizeApiPath(originalUrl);
  if (
    !NOTE_CONTENT_MUTATION_PATHS.has(path) ||
    payload == null ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return payload;
  }

  const summary = {
    payloadSummary: 'note_content_omitted',
  };
  for (const key of ['id', 'noteId', 'type', 'targetType', 'revision', 'rendererVersion', 'baseRevision', 'parentId']) {
    const value = optionalScalar(payload[key]);
    if (value !== undefined) summary[key] = value;
  }
  for (const key of ['content', 'scene', 'convertedContent', 'thumbnail']) {
    if (typeof payload[key] === 'string') summary[`${key}Length`] = textLength(payload[key]);
  }
  if (typeof payload.title === 'string') summary.titleLength = textLength(payload.title);
  if (Array.isArray(payload.tags)) summary.tagCount = payload.tags.length;
  if (Array.isArray(payload.tagIds)) summary.tagCount = payload.tagIds.length;
  if (payload.shareExposureAcknowledged === true) summary.shareExposureAcknowledged = true;
  return summary;
}

/**
 * 仅跳过无操作审计价值的系统读取请求。
 *
 * 不使用公网 IP 过滤：动态或共享公网 IP 下可能同时存在真实游客，按 IP 排除会误伤。
 */
export function shouldSkipApiLog(originalUrl) {
  const url = String(originalUrl || '');
  if (API_LOG_SKIP_SUBSTRINGS.some((key) => url.includes(key))) return true;
  const path = normalizeApiPath(url);
  return PASSIVE_API_PATHS.has(path) || path.startsWith('/updateLog/image/');
}
