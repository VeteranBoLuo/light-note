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
const readLimiter = limiter({ prefix: 'afdian-read', windowMs: 60 * 1000, limit: 120 });
const preferenceLimiter = limiter({ prefix: 'afdian-preference', windowMs: 10 * 60 * 1000, limit: 20 });
const adminActionLimiter = limiter({ prefix: 'afdian-admin-action', windowMs: 10 * 60 * 1000, limit: 20 });

router.get('/state', handle.state);
router.get('/store/state', readLimiter, handle.storeState);
router.get('/catalog', readLimiter, handle.catalog);
router.get('/leaderboard', readLimiter, handle.leaderboard);
router.get('/leaderboard/avatar/:publicId', readLimiter, handle.publicAvatar);
router.get('/orders', readLimiter, handle.orders);
router.post('/public-preference', preferenceLimiter, handle.publicPreference);
router.get('/donation/checkout', checkoutLimiter, handle.donationCheckout);
router.get('/checkout', checkoutLimiter, handle.checkout);
router.get('/afdian/oauth/start', oauthLimiter, handle.oauthStart);
router.get('/afdian/oauth/callback', oauthLimiter, handle.oauthCallback);
router.post('/afdian/oauth/unlink', oauthLimiter, handle.oauthUnlink);
router.post('/afdian/webhook', webhookLimiter, handle.webhook);
router.get('/admin/overview', readLimiter, handle.adminOverview);
router.get('/admin/orders', readLimiter, handle.adminOrders);
router.get('/admin/supporters', readLimiter, handle.adminSupporters);
router.get('/admin/campaigns', readLimiter, handle.adminCampaigns);
router.get('/admin/campaigns/:campaignId/grants', readLimiter, handle.adminCampaignGrants);
router.post('/admin/campaigns/cost-preview', adminActionLimiter, handle.adminCampaignCostPreview);
router.post('/admin/campaigns', adminActionLimiter, handle.adminCampaignCreate);
router.post('/admin/campaigns/:campaignId/publish', adminActionLimiter, handle.adminCampaignPublish);
router.post('/admin/campaigns/:campaignId/suspend', adminActionLimiter, handle.adminCampaignSuspend);
router.post('/admin/sync', adminActionLimiter, handle.adminSync);
router.post('/admin/orders/:providerOrderNo/reconcile', adminActionLimiter, handle.adminReconcile);
router.post('/admin/orders/:providerOrderNo/reward-approve', adminActionLimiter, handle.adminRewardApprove);
router.post('/admin/supporters/:userId/identity-visibility', adminActionLimiter, handle.adminIdentityVisibility);

export default router;
