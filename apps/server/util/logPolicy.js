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
  '/me',
  'unreadCount', // 通知未读数：铃铛角标每 120s 轮询，高频且无操作审计价值。
]);

const PASSIVE_API_PATHS = new Set([
  '/json/getConfigByName', // 公开配置读取（更新日志滚动发布兼容期间仍会回退调用）。
  '/updateLog/list', // 公开更新日志读取，页面与构建预渲染都会调用。
  '/inbox/count', // 待处理角标读取，页面加载及构建预渲染会高频调用。
  '/support/state', // 支持页与 App 前台恢复读取，不包含操作审计价值。
  '/support/afdian/webhook', // 第三方订单载荷含留言/收货信息，绝不写入通用 API 日志。
  '/support/afdian/oauth/callback', // 回调查询参数含短时 code/state，由领域日志只记稳定结果码。
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
  const path = normalizeApiPath(url);
  return PASSIVE_API_PATHS.has(path) || path.startsWith('/updateLog/image/');
}
