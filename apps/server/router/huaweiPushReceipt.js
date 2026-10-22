import express from 'express';
import { createHash } from 'node:crypto';
import pool from '../db/index.js';
import { parseHuaweiReceipts, verifyHuaweiReceiptHeader } from '../util/huaweiPushReceiptPolicy.js';
import { recordHuaweiReceipts } from '../util/huaweiPushDelivery.js';

export function createHuaweiPushReceiptRouter({ db = pool, env = process.env, now = () => Date.now() } = {}) {
  const router = express.Router();
  const nonces = new Map();
  const failure = (res, status, code) => res.status(status).json({ code, message: code });
  router.post(
    '/',
    (req, res, next) => {
      try {
        res.locals.huaweiReceiptAuth = verifyHuaweiReceiptHeader(req.get('X-HUAWEI-CALLBACK-ID'), env, now());
        next();
      } catch (error) {
        failure(
          res,
          error.code === 'HUAWEI_RECEIPT_UNAUTHORIZED' ? 401 : 503,
          error.code || 'HUAWEI_RECEIPT_UNAVAILABLE',
        );
      }
    },
    express.json({ limit: '256kb', strict: true }),
    async (req, res) => {
      try {
        const { nonceKey, expiresAt } = res.locals.huaweiReceiptAuth;
        const hash = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
        for (const [key, value] of nonces) if (value.expiresAt < now()) nonces.delete(key);
        if (nonces.has(nonceKey) && nonces.get(nonceKey).hash !== hash)
          return failure(res, 401, 'HUAWEI_RECEIPT_UNAUTHORIZED');
        const receipts = parseHuaweiReceipts(req.body, env);
        // Reserve before the async store so concurrent requests cannot reuse a
        // signed nonce with another body. Storage failures still allow exact retries.
        nonces.set(nonceKey, { hash, expiresAt });
        if (nonces.size > 5000) nonces.delete(nonces.keys().next().value);
        await recordHuaweiReceipts(db, receipts);
        return res.json({ code: '0', message: 'success' });
      } catch (error) {
        const invalid = error.code === 'HUAWEI_RECEIPT_PAYLOAD_INVALID';
        if (!invalid) console.error('[huawei-push-receipt] code=HUAWEI_RECEIPT_STORE_FAILED');
        return failure(res, invalid ? 400 : 503, invalid ? error.code : 'HUAWEI_RECEIPT_STORE_FAILED');
      }
    },
  );
  router.use((error, req, res, next) => {
    if (!error) return next();
    return failure(res, error.type === 'entity.too.large' ? 413 : 400, 'HUAWEI_RECEIPT_PAYLOAD_INVALID');
  });
  return router;
}

export default createHuaweiPushReceiptRouter();
