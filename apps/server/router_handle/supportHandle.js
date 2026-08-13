import { L, resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  buildAfdianAuthorizationUrl,
  exchangeAfdianAuthorizationCode,
  verifyAfdianWebhookSignature,
} from '../util/afdianClient.js';
import { createAfdianOAuthState, consumeAfdianOAuthState } from '../util/afdianOAuthState.js';
import {
  createAfdianCheckoutIntent,
  getAfdianSupportState,
  ingestAfdianWebhookOrder,
  linkAfdianAccount,
  reconcileAfdianOrder,
  syncAfdianOrderHistory,
  unlinkAfdianAccount,
} from '../util/afdianSupportService.js';

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

export async function checkout(req, res) {
  if (!ensureNotVisitor(req, res)) return;
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

export async function oauthStart(req, res) {
  if (!ensureNotVisitor(req, res)) return;
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
    await linkAfdianAccount({ userId: req.user.id, ...identity });
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
  if (!ensureNotVisitor(req, res)) return;
  try {
    const data = await unlinkAfdianAccount({ userId: req.user.id });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function webhook(req, res) {
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
