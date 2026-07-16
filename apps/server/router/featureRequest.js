import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as handle from '../router_handle/featureRequestHandle.js';

const router = express.Router();

const featureWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: (req) => `feature:${req.billingUser?.id || req.user?.id || ipKeyGenerator(req.ip || '')}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).send({ data: { code: 'RATE_LIMITED' }, status: 429, msg: '操作过于频繁，请稍后再试' }),
});

const featureCreateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 12,
  keyGenerator: (req) => `feature-create:${req.billingUser?.id || req.user?.id || ipKeyGenerator(req.ip || '')}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).send({ data: { code: 'RATE_LIMITED' }, status: 429, msg: '今天提交的建议较多，请明天再试' }),
});

router.post('/listPublic', handle.listPublic);
router.post('/getPublicDetail', handle.getDetail);
router.post('/create', featureCreateLimiter, handle.create);
router.post('/listMine', handle.listMine);
router.post('/toggleVote', featureWriteLimiter, handle.toggleVote);
router.post('/addSubmitterUpdate', featureWriteLimiter, handle.addSubmitterUpdate);
router.post('/admin/list', handle.listAdmin);
router.post('/admin/create', handle.adminCreate);
router.post('/admin/review', handle.adminReview);
router.post('/admin/reply', handle.adminReply);
router.post('/admin/updateStatus', handle.adminUpdateStatus);
router.post('/admin/merge', handle.adminMerge);
router.post('/admin/edit', handle.adminEdit);

export default router;
