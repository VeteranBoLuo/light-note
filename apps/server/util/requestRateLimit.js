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

function featureLimit(baseLimit) {
  return (req) => (requestActor(req).role === 'root' ? baseLimit * 2 : baseLimit);
}

function featureRateLimiter({ limit, code, message }) {
  return rateLimit({
    windowMs: 60_000,
    limit: featureLimit(limit),
    keyGenerator: getGlobalRateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    handler: (req, res) => {
      const resetTime = req.rateLimit?.resetTime?.getTime?.() || Date.now() + 60_000;
      const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
      return res.status(429).send({ data: { code, retryAfter }, status: 429, msg: message });
    },
  });
}

// 模型额度防止长期滥用，分钟级防洪避免大量并发请求先占满进程和 Provider 连接。
export const aiActionRateLimiter = featureRateLimiter({
  limit: positiveNumber(process.env.AI_ACTION_RATE_LIMIT_PER_MINUTE, 30),
  code: 'AI_ACTION_RATE_LIMITED',
  message: 'AI 操作过于频繁，请稍后再试',
});

// 不扣 AI token 的网页归档、本地解析仍消耗网络、CPU 或 Worker，单独限频但不影响普通 CRUD。
export const expensiveFreeActionRateLimiter = featureRateLimiter({
  limit: positiveNumber(process.env.EXPENSIVE_FREE_ACTION_RATE_LIMIT_PER_MINUTE, 8),
  code: 'RESOURCE_ACTION_RATE_LIMITED',
  message: '该操作过于频繁，请稍后再试',
});

// 文件预览生成是幂等队列操作，正常连续浏览会比手动网页抓取更频繁，因此使用独立且更宽的预算。
export const localProcessingRateLimiter = featureRateLimiter({
  limit: positiveNumber(process.env.LOCAL_PROCESSING_RATE_LIMIT_PER_MINUTE, 30),
  code: 'LOCAL_PROCESSING_RATE_LIMITED',
  message: '本地处理任务过于频繁，请稍后再试',
});

// 用量页一次刷新包含多组只读聚合查询，限制恶意轮询但覆盖正常筛选、翻页与手动刷新。
export const aiUsageReadRateLimiter = featureRateLimiter({
  limit: positiveNumber(process.env.AI_USAGE_READ_RATE_LIMIT_PER_MINUTE, 30),
  code: 'AI_USAGE_RATE_LIMITED',
  message: 'AI 用量查询过于频繁，请稍后再试',
});

export const externalLookupRateLimiter = featureRateLimiter({
  limit: positiveNumber(process.env.EXTERNAL_LOOKUP_RATE_LIMIT_PER_MINUTE, 60),
  code: 'EXTERNAL_LOOKUP_RATE_LIMITED',
  message: '搜索过于频繁，请稍后再试',
});

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

export const earlyAnonymousRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: positiveNumber(process.env.EARLY_ANONYMOUS_RATE_LIMIT_PER_MINUTE, 1200),
  keyGenerator: (req) => `early-ip:${ipKeyGenerator(req.ip || 'unknown')}`,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res) => {
    const resetTime = req.rateLimit?.resetTime?.getTime?.() || Date.now() + 60_000;
    const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
    return res.status(429).send({
      data: { retryAfter },
      status: 429,
      msg: '请求过于频繁，请稍后再试',
    });
  },
});
