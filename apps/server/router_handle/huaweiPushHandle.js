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
    res.send(resultData(await bindHuaweiSubscription(uid, req.body?.deviceToken, req.body?.previousBinding ?? null)));
  } catch (error) {
    const failures = {
      PUSH_DEVICE_LIMIT: [409, 'HUAWEI_PUSH_DEVICE_LIMIT'],
      PUSH_BINDING_EXPIRED: [409, 'HUAWEI_PUSH_BINDING_EXPIRED'],
      PUSH_ACCOUNT_UNAVAILABLE: [403, 'HUAWEI_PUSH_ACCOUNT_REQUIRED'],
      INVALID_PUSH_BINDING: [400, 'HUAWEI_PUSH_BINDING_INVALID'],
      INVALID_HUAWEI_TOKEN: [400, 'HUAWEI_PUSH_TOKEN_INVALID'],
      PUSH_SUBSCRIPTION_INVALID: [410, 'HUAWEI_PUSH_TOKEN_INVALID'],
    };
    const [status, code] = failures[error?.code] || [500, 'HUAWEI_PUSH_BIND_FAILED'];
    res.send(resultData(null, status, code));
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
