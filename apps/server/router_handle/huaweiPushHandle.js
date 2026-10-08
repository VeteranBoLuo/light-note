import { resultData } from '../util/common.js';
import { huaweiPushEnabled } from '../util/huaweiPushPolicy.js';
import {
  bindHuaweiSubscription,
  activatePushSubscription,
  unbindPushSubscription,
} from '../util/browserPushService.js';

function actor(req, res) {
  if (
    !req.user?.id ||
    req.user.role === 'visitor' ||
    req.adminContext ||
    !process.env.HUAWEI_PUSH_ORIGIN ||
    req.get?.('origin') !== process.env.HUAWEI_PUSH_ORIGIN ||
    req.get?.('sec-fetch-site') === 'cross-site'
  ) {
    res.send(resultData(null, 403, 'HUAWEI_PUSH_ACCOUNT_REQUIRED'));
    return null;
  }
  return req.user.id;
}
export async function subscribe(req, res) {
  const uid = actor(req, res);
  if (!uid) return;
  if (!huaweiPushEnabled()) return res.send(resultData(null, 503, 'HUAWEI_PUSH_DISABLED'));
  try {
    res.send(resultData(await bindHuaweiSubscription(uid, req.body?.deviceToken)));
  } catch (error) {
    res.send(
      resultData(
        null,
        error?.code === 'PUSH_SUBSCRIPTION_INVALID' ? 410 : error?.code === 'INVALID_HUAWEI_TOKEN' ? 400 : 409,
        'HUAWEI_PUSH_BIND_FAILED',
      ),
    );
  }
}
export async function activate(req, res) {
  const uid = actor(req, res);
  if (!uid) return;
  if (!huaweiPushEnabled()) return res.send(resultData(null, 503, 'HUAWEI_PUSH_DISABLED'));
  try {
    const ok = await activatePushSubscription(uid, String(req.body?.id || ''), String(req.body?.generation || ''));
    res.send(resultData(null, ok ? 200 : 409, ok ? '' : 'HUAWEI_PUSH_BINDING_EXPIRED'));
  } catch {
    res.send(resultData(null, 500, 'HUAWEI_PUSH_ACTIVATE_FAILED'));
  }
}
export async function unsubscribe(req, res) {
  const uid = actor(req, res);
  if (!uid) return;
  try {
    await unbindPushSubscription(uid, String(req.body?.id || ''), String(req.body?.generation || ''));
    res.send(resultData(null));
  } catch {
    res.send(resultData(null, 500, 'HUAWEI_PUSH_UNBIND_FAILED'));
  }
}
