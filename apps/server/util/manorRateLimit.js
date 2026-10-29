import rateLimit from 'express-rate-limit';
import { getGlobalRateLimitKey } from './requestRateLimit.js';

export function manorRateLimiter(limit) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    keyGenerator: getGlobalRateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res
        .status(429)
        .send({
          status: 429,
          data: { code: 'MANOR_RATE_LIMITED', retryAfter: 60 },
          msg: '庄园请求过于频繁，请稍后重试',
        }),
  });
}
export const manorReadLimit = manorRateLimiter(60);
export const manorCommandLimit = manorRateLimiter(120);
export const manorAdminWriteLimit = manorRateLimiter(6);
