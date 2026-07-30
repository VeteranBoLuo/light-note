import crypto from 'node:crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,64}$/;

export function normalizeRequestId(value) {
  const candidate = String(value || '').trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : crypto.randomUUID();
}

export function requestTraceMiddleware(req, res, next) {
  const requestId = normalizeRequestId(req.get?.('x-request-id'));
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
