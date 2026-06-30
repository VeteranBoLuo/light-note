import { sanitizeObject } from './payloadSanitizer.js';

export const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
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

export const shouldSkipSecurity = (req) => {
  const path = req.path || req.originalUrl || '';
  return path.startsWith('/security');
};
