import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as handle from '../router_handle/supportHandle.js';

const router = express.Router();

function limiter({ prefix, windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => `${prefix}:${req.user?.id || ipKeyGenerator(req.ip || 'unknown')}`,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).send({ data: { code: 'RATE_LIMITED' }, status: 429, msg: '操作过于频繁，请稍后再试' }),
  });
}

const checkoutLimiter = limiter({ prefix: 'afdian-checkout', windowMs: 60 * 60 * 1000, limit: 30 });
const oauthLimiter = limiter({ prefix: 'afdian-oauth', windowMs: 10 * 60 * 1000, limit: 10 });
const webhookLimiter = limiter({ prefix: 'afdian-webhook', windowMs: 60 * 1000, limit: 120 });

router.get('/state', handle.state);
router.get('/checkout', checkoutLimiter, handle.checkout);
router.get('/afdian/oauth/start', oauthLimiter, handle.oauthStart);
router.get('/afdian/oauth/callback', oauthLimiter, handle.oauthCallback);
router.post('/afdian/oauth/unlink', oauthLimiter, handle.oauthUnlink);
router.post('/afdian/webhook', webhookLimiter, handle.webhook);

export default router;
