import express from 'express';
import * as tagIconHandle from '../router_handle/tagIconHandle.js';
import { aiActionRateLimiter, externalLookupRateLimiter } from '../util/requestRateLimit.js';

const router = express.Router();

export function limitExplicitAiSearch(req, res, next) {
  if (req.body?.useAi !== true) return next();
  return aiActionRateLimiter(req, res, next);
}

router.post('/search', externalLookupRateLimiter, limitExplicitAiSearch, tagIconHandle.search);
router.post('/resolve', tagIconHandle.resolve);

export default router;
