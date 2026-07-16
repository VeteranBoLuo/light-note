const API_LOG_SKIP_SUBSTRINGS = Object.freeze([
  'Logs',
  'getUserInfo',
  'getUserList',
  'analyzeImgUrl',
  'getRelatedTag',
  'getOpinionNotice',
  'noticeSummary',
  'aiQuota',
  '/me',
  'unreadCount', // 通知未读数：铃铛角标每 120s 轮询，高频且无操作审计价值。
]);

const PASSIVE_API_PATHS = new Set([
  '/json/getConfigByName', // 公开配置读取（当前用于更新日志），构建预渲染也会调用。
  '/inbox/count', // 待处理角标读取，页面加载及构建预渲染会高频调用。
]);

function normalizeApiPath(originalUrl) {
  const pathname = String(originalUrl || '').split(/[?#]/, 1)[0];
  return pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
}

/**
 * 仅跳过无操作审计价值的系统读取请求。
 *
 * 不使用公网 IP 过滤：动态或共享公网 IP 下可能同时存在真实游客，按 IP 排除会误伤。
 */
export function shouldSkipApiLog(originalUrl) {
  const url = String(originalUrl || '');
  if (API_LOG_SKIP_SUBSTRINGS.some((key) => url.includes(key))) return true;
  return PASSIVE_API_PATHS.has(normalizeApiPath(url));
}
