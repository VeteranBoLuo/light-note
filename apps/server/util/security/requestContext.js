import { sanitizeObject } from './payloadSanitizer.js';

export const getClientIp = (req) => {
  // 用 req.ip(trust proxy=1 下由 nginx 追加的 X-Forwarded-For 链末尾解析出的真实客户端 IP)，
  // 不再取 XFF 首段——首段是客户端可任意伪造的，会被用来污染 IP 信誉、绕过滑窗计数、或栽赃误封他人 IP。
  // 已实测：C/D 场景(伪造 XFF + nginx 追加真实 IP)下 req.ip 稳定取到真实客户端 IP。
  const ip = req.ip || req.socket?.remoteAddress || '';
  return ip.replace(/^::ffff:/, ''); // 去 IPv4-mapped IPv6 前缀，保证滑窗 key 与落库 IP 归一
};

export const buildRequestContext = (req) => {
  const sourceIp = getClientIp(req);
  return {
    method: req.method,
    path: req.path || req.url || '',
    originalUrl: req.originalUrl || req.url || '',
    sourceIp,
    xForwardedFor: req.headers['x-forwarded-for'] || '',
    userAgent: req.headers['user-agent'] || '',
    userId: req.user?.id || req.headers['x-user-id'] || '',
    role: req.user?.role || req.headers.role || '',
    query: req.query || {},
    body: req.body || {},
    params: req.params || {},
    headers: req.headers || {},
    payloadSummary: sanitizeObject({
      query: req.query || {},
      body: req.body || {},
      params: req.params || {},
    }),
    headersSummary: sanitizeObject({
      userAgent: req.headers['user-agent'] || '',
      referer: req.headers.referer || '',
      origin: req.headers.origin || '',
      contentType: req.headers['content-type'] || '',
      contentLength: req.headers['content-length'] || '',
      xForwardedFor: req.headers['x-forwarded-for'] || '',
      fingerprint: req.headers.fingerprint || '',
    }),
    files: Array.isArray(req.files) ? req.files : req.file ? [req.file] : [],
    startedAt: Date.now(),
  };
};

const STATIC_READ_METHODS = new Set(['GET', 'HEAD']);

export const shouldSkipSecurity = (req) => {
  const path = req.path || req.originalUrl || '';
  // OPTIONS 预检无 body、无攻击面
  if (req.method === 'OPTIONS') return true;
  if (path === '/favicon.ico') return true;
  // /security 管理接口(原有行为)
  if (path.startsWith('/security')) return true;
  // 静态只读目录：仅对 GET/HEAD 跳过(静态路由本就不处理写方法，真实文件上传走 /file 仍全程检测)，
  // 既省 1 核机器上对静态资源的无谓检测，又避免加载大量静态资源被计入高频窗口误判为攻击
  if (STATIC_READ_METHODS.has(req.method) && (path.startsWith('/files') || path.startsWith('/uploads'))) {
    return true;
  }
  return false;
};
