import { L, resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import pool from '../db/index.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { recordAdminOperationAudit } from '../util/adminOperationAudit.js';
import {
  buildAfdianAuthorizationUrl,
  exchangeAfdianAuthorizationCode,
  queryAfdianPublicProfile,
  isAfdianDashboardWebhookTestPayload,
  verifyAfdianWebhookSignature,
} from '../util/afdianClient.js';
import { createAfdianOAuthState, consumeAfdianOAuthState } from '../util/afdianOAuthState.js';
import {
  createAfdianCheckoutIntent,
  createAfdianPackageCheckoutIntent,
  getAfdianEntitlementStoreState,
  getAfdianSupportState,
  ingestAfdianWebhookOrder,
  linkAfdianAccount,
  reconcileAfdianOrder,
  syncAfdianOrderHistory,
  unlinkAfdianAccount,
} from '../util/afdianSupportService.js';
import { getSupportCatalog } from '../util/afdianSupportPackageCatalog.js';
import {
  createSupportCampaignDraft,
  listSupportCampaignGrants,
  listSupportCampaigns,
  previewSupportCampaignCosts,
  publishSupportCampaign,
  suspendSupportCampaign,
} from '../util/afdianSupportCampaignService.js';
import {
  getAfdianAdminOverview,
  getAfdianLeaderboard,
  getAfdianPublicAvatar,
  getAfdianUserOrders,
  queryAfdianAdminOrders,
  queryAfdianAdminSupporters,
  setAfdianAdminIdentityHidden,
  updateAfdianPublicPreference,
} from '../util/afdianSupportReadService.js';
import { approveAfdianSupportReward } from '../util/afdianSupportRewardService.js';

function sendError(req, res, error) {
  const status = Number(error?.status) || 500;
  const code = String(error?.code || 'AFDIAN_INTEGRATION_ERROR');
  if (status >= 500) console.error('[afdian] 请求失败 code=%s', stableAgentErrorCode(error));
  return res
    .status(status)
    .send(
      resultData(
        { code },
        status,
        status >= 500
          ? L(req, '爱发电服务暂时不可用，请稍后再试', 'AFDIAN is temporarily unavailable. Please try again.')
          : L(req, error?.message || '请求失败', 'The request could not be completed.'),
      ),
    );
}

function redirectOAuthResult(res, code) {
  const query = new URLSearchParams({ afdian: code });
  return res.redirect(302, `/support?${query.toString()}`);
}

function ensurePrivateSupportAccess(req, res) {
  if (req.adminContext) {
    res.status(403).send(resultData({ code: 'ADMIN_MAINTENANCE_FORBIDDEN' }, 403, '代管上下文不能读取赞助隐私'));
    return false;
  }
  return ensureNotVisitor(req, res);
}

async function ensureRoot(req, res) {
  if (req.adminContext || !req.user?.isAuthenticated || !req.user?.id || req.user.role !== 'root') {
    res.status(403).send(resultData({ code: 'ROOT_REQUIRED' }, 403, L(req, '仅 Root 可操作', 'Root access required')));
    return false;
  }
  try {
    const [rows] = await pool.query('SELECT role, del_flag FROM user WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows[0] || rows[0].role !== 'root' || Number(rows[0].del_flag || 0) !== 0) {
      res
        .status(403)
        .send(resultData({ code: 'ROOT_REQUIRED' }, 403, L(req, '仅 Root 可操作', 'Root access required')));
      return false;
    }
    return true;
  } catch (error) {
    console.error('[afdian] Root 权限复核失败 code=%s', stableAgentErrorCode(error));
    res
      .status(500)
      .send(
        resultData({ code: 'ROOT_RECHECK_UNAVAILABLE' }, 500, L(req, '权限复核暂时不可用', 'Access check unavailable')),
      );
    return false;
  }
}

export async function state(req, res) {
  if (req.adminContext) {
    return res.status(403).send(resultData({ code: 'ADMIN_MAINTENANCE_FORBIDDEN' }, 403, '代管上下文不能读取赞助关联'));
  }
  try {
    const authenticated = Boolean(req.user?.isAuthenticated && req.user?.id && req.user.role !== 'visitor');
    const data = await getAfdianSupportState({ userId: req.user?.id, authenticated });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function storeState(req, res) {
  if (req.adminContext) {
    return res.status(403).send(resultData({ code: 'ADMIN_MAINTENANCE_FORBIDDEN' }, 403, '代管上下文不能读取购买记录'));
  }
  try {
    const authenticated = Boolean(req.user?.isAuthenticated && req.user?.id && req.user.role !== 'visitor');
    const data = await getAfdianEntitlementStoreState({ userId: req.user?.id, authenticated });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function catalog(req, res) {
  try {
    const authenticated = Boolean(
      !req.adminContext && req.user?.isAuthenticated && req.user?.id && req.user.role !== 'visitor',
    );
    const data = await getSupportCatalog({
      userId: authenticated ? req.user.id : '',
      authenticated,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function donationCheckout(req, res) {
  if (!ensurePrivateSupportAccess(req, res)) return;
  try {
    const { url } = await createAfdianCheckoutIntent({
      userId: req.user.id,
      optionKey: req.query.option,
    });
    return res.redirect(302, url);
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function checkout(req, res) {
  if (!ensurePrivateSupportAccess(req, res)) return;
  // 旧版前端曾用 /checkout?option= 发起“赞助赠 AI”。拆分发布后必须失败关闭，
  // 不能把旧页面承诺的赠送静默改成零权益赞助。新版纯支持使用独立 donation 端点。
  if (!req.query.skuId) {
    return res
      .status(410)
      .send(
        resultData(
          { code: 'SUPPORT_CHECKOUT_LEGACY_RETIRED' },
          410,
          L(
            req,
            '旧版赞助入口已停用，请刷新页面后重试',
            'This legacy support checkout has retired. Refresh and try again.',
          ),
        ),
      );
  }
  try {
    const { url } = await createAfdianPackageCheckoutIntent({
      userId: req.user.id,
      skuId: req.query.skuId,
      catalogVersion: req.query.catalogVersion,
    });
    return res.redirect(302, url);
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function oauthStart(req, res) {
  if (!ensurePrivateSupportAccess(req, res)) return;
  try {
    const { state: oauthState } = await createAfdianOAuthState({
      userId: req.user.id,
      sessionId: req.user.sessionId,
    });
    return res.redirect(302, buildAfdianAuthorizationUrl(oauthState));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function oauthCallback(req, res) {
  if (!req.user?.isAuthenticated || !req.user?.id || req.user.role === 'visitor') {
    return redirectOAuthResult(res, 'session_required');
  }
  try {
    await consumeAfdianOAuthState({
      state: req.query.state,
      userId: req.user.id,
      sessionId: req.user.sessionId,
    });
    const identity = await exchangeAfdianAuthorizationCode(req.query.code);
    const profile = await queryAfdianPublicProfile(identity.providerUserId).catch((error) => {
      console.warn('[afdian] OAuth 用户资料补全失败 code=%s', stableAgentErrorCode(error));
      return {};
    });
    await linkAfdianAccount({ userId: req.user.id, ...identity, ...profile });
    void syncAfdianOrderHistory().catch((error) => {
      console.warn('[afdian] OAuth 后历史订单同步失败 code=%s', stableAgentErrorCode(error));
    });
    return redirectOAuthResult(res, 'bound');
  } catch (error) {
    console.warn('[afdian] OAuth 回调失败 code=%s', stableAgentErrorCode(error));
    return redirectOAuthResult(res, 'failed');
  }
}

export async function oauthUnlink(req, res) {
  if (!ensurePrivateSupportAccess(req, res)) return;
  try {
    const data = await unlinkAfdianAccount({ userId: req.user.id });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function leaderboard(req, res) {
  try {
    const userId = req.adminContext ? '' : req.user?.isAuthenticated && req.user?.role !== 'visitor' ? req.user.id : '';
    return res.send(resultData(await getAfdianLeaderboard({ userId })));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function orders(req, res) {
  if (!ensurePrivateSupportAccess(req, res)) return;
  try {
    const data = await getAfdianUserOrders({
      userId: req.user.id,
      page: req.query.page,
      pageSize: req.query.pageSize,
      scope: req.query.scope,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function publicPreference(req, res) {
  if (!ensurePrivateSupportAccess(req, res)) return;
  try {
    const data = await updateAfdianPublicPreference({
      userId: req.user.id,
      participateInRanking: req.body?.participateInRanking,
      showIdentity: req.body?.showIdentity,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function publicAvatar(req, res) {
  try {
    const avatar = await getAfdianPublicAvatar({ publicId: req.params.publicId });
    if (!avatar) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=30');
    if (avatar.redirectUrl) return res.redirect(302, avatar.redirectUrl);
    res.type(avatar.contentType);
    return res.send(avatar.data);
  } catch (error) {
    console.warn('[afdian] 公开头像读取失败 code=%s', stableAgentErrorCode(error));
    return res.status(404).end();
  }
}

export async function adminOverview(req, res) {
  if (!(await ensureRoot(req, res))) return;
  try {
    return res.send(resultData(await getAfdianAdminOverview()));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function adminOrders(req, res) {
  if (!(await ensureRoot(req, res))) return;
  try {
    const data = await queryAfdianAdminOrders({
      page: req.query.page,
      pageSize: req.query.pageSize,
      state: req.query.state,
      search: req.query.search,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function adminSupporters(req, res) {
  if (!(await ensureRoot(req, res))) return;
  try {
    const data = await queryAfdianAdminSupporters({
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: req.query.search,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

async function auditAdminSupportAction(req, action, targetId, outcome, reason = '', metadata = {}) {
  await recordAdminOperationAudit(
    {
      actorUserId: req.user.id,
      action,
      targetType: 'afdian_support',
      targetId,
      outcome,
      reason,
      requestId: req.headers['x-request-id'],
      ip: req.ip,
      metadata,
    },
    { required: true },
  );
}

export async function adminCampaigns(req, res) {
  if (!(await ensureRoot(req, res))) return;
  try {
    const data = await listSupportCampaigns();
    await auditAdminSupportAction(req, 'support_campaign_list', 'all', 'succeeded', '', {
      count: data.length,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function adminCampaignCostPreview(req, res) {
  if (!(await ensureRoot(req, res))) return;
  try {
    const data = previewSupportCampaignCosts(req.body?.skus);
    await auditAdminSupportAction(req, 'support_campaign_cost_preview', 'draft', 'succeeded', '', {
      skuCount: data.items.length,
      passes: data.passes,
    });
    return res.send(resultData(data));
  } catch (error) {
    await auditAdminSupportAction(req, 'support_campaign_cost_preview', 'draft', 'failed').catch(() => {});
    return sendError(req, res, error);
  }
}

export async function adminCampaignCreate(req, res) {
  if (!(await ensureRoot(req, res))) return;
  try {
    await auditAdminSupportAction(req, 'support_campaign_create', String(req.body?.campaignKey || 'draft'), 'intent');
    const data = await createSupportCampaignDraft({ actorUserId: req.user.id, input: req.body });
    await auditAdminSupportAction(req, 'support_campaign_create', data.id, 'succeeded', '', {
      campaignKey: data.campaignKey,
      version: data.version,
      skuCount: data.skus.length,
    });
    return res.send(resultData(data));
  } catch (error) {
    await auditAdminSupportAction(
      req,
      'support_campaign_create',
      String(req.body?.campaignKey || 'draft'),
      'failed',
    ).catch(() => {});
    return sendError(req, res, error);
  }
}

export async function adminCampaignPublish(req, res) {
  if (!(await ensureRoot(req, res))) return;
  const campaignId = String(req.params.campaignId || '');
  try {
    await auditAdminSupportAction(req, 'support_campaign_publish', campaignId, 'intent');
    const data = await publishSupportCampaign({ campaignId, actorUserId: req.user.id });
    await auditAdminSupportAction(req, 'support_campaign_publish', campaignId, 'succeeded', '', {
      version: data.version,
    });
    return res.send(resultData(data));
  } catch (error) {
    await auditAdminSupportAction(req, 'support_campaign_publish', campaignId, 'failed').catch(() => {});
    return sendError(req, res, error);
  }
}

export async function adminCampaignSuspend(req, res) {
  if (!(await ensureRoot(req, res))) return;
  const campaignId = String(req.params.campaignId || '');
  try {
    await auditAdminSupportAction(req, 'support_campaign_suspend', campaignId, 'intent');
    const data = await suspendSupportCampaign({ campaignId, actorUserId: req.user.id });
    await auditAdminSupportAction(req, 'support_campaign_suspend', campaignId, 'succeeded');
    return res.send(resultData(data));
  } catch (error) {
    await auditAdminSupportAction(req, 'support_campaign_suspend', campaignId, 'failed').catch(() => {});
    return sendError(req, res, error);
  }
}

export async function adminCampaignGrants(req, res) {
  if (!(await ensureRoot(req, res))) return;
  const campaignId = String(req.params.campaignId || '');
  try {
    const data = await listSupportCampaignGrants({ campaignId });
    await auditAdminSupportAction(req, 'support_campaign_grants_view', campaignId, 'succeeded', '', {
      count: data.length,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function adminSync(req, res) {
  if (!(await ensureRoot(req, res))) return;
  try {
    await auditAdminSupportAction(req, 'support_force_sync', 'all', 'intent');
    const data = await syncAfdianOrderHistory({ force: true });
    await auditAdminSupportAction(req, 'support_force_sync', 'all', 'succeeded', '', data);
    return res.send(resultData(data));
  } catch (error) {
    await auditAdminSupportAction(req, 'support_force_sync', 'all', 'failed').catch(() => {});
    return sendError(req, res, error);
  }
}

export async function adminReconcile(req, res) {
  if (!(await ensureRoot(req, res))) return;
  const providerOrderNo = String(req.params.providerOrderNo || '');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(providerOrderNo)) {
    return res.status(400).send(resultData({ code: 'AFDIAN_ORDER_INVALID' }, 400, '订单号不合法'));
  }
  try {
    await auditAdminSupportAction(req, 'support_order_reconcile', providerOrderNo, 'intent');
    const data = await reconcileAfdianOrder(providerOrderNo);
    await auditAdminSupportAction(req, 'support_order_reconcile', providerOrderNo, 'succeeded');
    return res.send(resultData(data));
  } catch (error) {
    await auditAdminSupportAction(req, 'support_order_reconcile', providerOrderNo, 'failed').catch(() => {});
    return sendError(req, res, error);
  }
}

export async function adminRewardApprove(req, res) {
  if (!(await ensureRoot(req, res))) return;
  const providerOrderNo = String(req.params.providerOrderNo || '');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(providerOrderNo)) {
    return res.status(400).send(resultData({ code: 'AFDIAN_ORDER_INVALID' }, 400, '订单号不合法'));
  }
  try {
    const expectedTokens = Number(req.body?.expectedTokens);
    const expectedUserId = String(req.body?.expectedUserId || '').trim();
    if (!Number.isSafeInteger(expectedTokens) || expectedTokens <= 0 || !expectedUserId) {
      return res
        .status(400)
        .send(resultData({ code: 'AFDIAN_REWARD_REVIEW_SNAPSHOT_REQUIRED' }, 400, '缺少赠送复核快照'));
    }
    await auditAdminSupportAction(req, 'support_reward_approve', providerOrderNo, 'intent');
    const data = await approveAfdianSupportReward(providerOrderNo, {
      actorUserId: req.user.id,
      expectedTokens,
      expectedUserId,
      requestId: req.headers['x-request-id'],
      ip: req.ip,
    });
    return res.send(resultData(data));
  } catch (error) {
    await auditAdminSupportAction(req, 'support_reward_approve', providerOrderNo, 'failed').catch(() => {});
    return sendError(req, res, error);
  }
}

export async function adminIdentityVisibility(req, res) {
  if (!(await ensureRoot(req, res))) return;
  try {
    await setAfdianAdminIdentityHidden({
      userId: String(req.params.userId || ''),
      hidden: req.body?.hidden,
      reason: req.body?.reason,
      actorUserId: req.user.id,
      requestId: req.headers['x-request-id'],
      ip: req.ip,
    });
    return res.send(resultData({ updated: true }));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function webhook(req, res) {
  if (isAfdianDashboardWebhookTestPayload(req.body)) {
    return res.json({ ec: 200, em: '' });
  }
  if (!verifyAfdianWebhookSignature(req.body)) {
    return res.status(400).json({ ec: 400, em: 'invalid signature' });
  }
  try {
    const providerOrderNo = await ingestAfdianWebhookOrder(req.body.data.order);
    // 先持久化再确认接收；订单归属仅由随后 API 查询到的权威 custom_order_id 决定。
    void reconcileAfdianOrder(providerOrderNo).catch((error) => {
      console.warn('[afdian] Webhook 订单复核失败 code=%s', stableAgentErrorCode(error));
    });
    return res.json({ ec: 200, em: '' });
  } catch (error) {
    console.error('[afdian] Webhook 落库失败 code=%s', stableAgentErrorCode(error));
    return res.status(500).json({ ec: 500, em: 'temporary failure' });
  }
}
