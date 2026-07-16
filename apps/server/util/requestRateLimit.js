import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const getConfiguredGlobalRateLimits = () => ({
  visitor: positiveNumber(process.env.GLOBAL_RATE_LIMIT_VISITOR_PER_MINUTE, 300),
  authenticated: positiveNumber(process.env.GLOBAL_RATE_LIMIT_AUTHENTICATED_PER_MINUTE, 600),
  root: positiveNumber(process.env.GLOBAL_RATE_LIMIT_ROOT_PER_MINUTE, 1200),
});

const requestActor = (req = {}) => req.billingUser || req.user || {};

export const getGlobalRateLimit = (req, limits = getConfiguredGlobalRateLimits()) => {
  const actor = requestActor(req);
  if (actor.role === 'root') return limits.root;
  if (actor.isAuthenticated && actor.id) return limits.authenticated;
  return limits.visitor;
};

export const getGlobalRateLimitKey = (req = {}) => {
  const actor = requestActor(req);
  if (actor.isAuthenticated && actor.id && actor.role !== 'visitor') {
    return `account:${actor.id}`;
  }
  return `ip:${ipKeyGenerator(req.ip || 'unknown')}`;
};

export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: (req) => getGlobalRateLimit(req),
  keyGenerator: getGlobalRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res) => {
    const resetTime = req.rateLimit?.resetTime?.getTime?.() || Date.now() + 60_000;
    const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
    res.status(429).send({
      data: { retryAfter },
      status: 429,
      msg: '请求过于频繁，请稍后再试',
    });
  },
});
