import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { notificationSchedulerEnabled } from './notificationSchedulerPolicy.js';

const error = (code) => Object.assign(new Error(code), { code });
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const bounded = (value, max) =>
  typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
export const huaweiAttemptTag = (id) => `ln:${id}`;
export const huaweiReceiptTokenHash = (token) => createHash('sha256').update(`huawei:${token}`).digest('hex');

export function huaweiReceiptConfig(env = process.env) {
  if (env.HUAWEI_PUSH_RECEIPTS_ENABLED !== 'true') return null;
  const username = env.HUAWEI_PUSH_RECEIPT_USERNAME;
  const encoded = env.HUAWEI_PUSH_RECEIPT_SECRET;
  if (
    !notificationSchedulerEnabled(env) ||
    !bounded(username, 128) ||
    typeof encoded !== 'string' ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw error('HUAWEI_RECEIPT_CONFIG_INVALID');
  const key = Buffer.from(encoded, 'base64');
  if (key.length < 32 || key.toString('base64') !== encoded) throw error('HUAWEI_RECEIPT_CONFIG_INVALID');
  if (env.HUAWEI_PUSH_RECEIPT_ID && !/^[A-Za-z0-9_-]{1,128}$/.test(env.HUAWEI_PUSH_RECEIPT_ID))
    throw error('HUAWEI_RECEIPT_CONFIG_INVALID');
  return { username, key, packageName: env.HUAWEI_PUSH_PACKAGE_NAME || 'top.boluo66.lightnote' };
}

// The provider signs the header tuple, not the JSON body. TLS, an expiry window and
// matching the saved attempt's tag/token/application are all required.
export function verifyHuaweiReceiptHeader(header, env = process.env, now = Date.now()) {
  const config = huaweiReceiptConfig(env);
  if (!config) throw error('HUAWEI_RECEIPT_DISABLED');
  if (typeof header !== 'string' || header.length > 1024) throw error('HUAWEI_RECEIPT_UNAUTHORIZED');
  const fields = {};
  for (const part of header.split(';')) {
    const match = part.trim().match(/^(timestamp|nonce|value)=(.+)$/);
    if (!match || fields[match[1]] !== undefined) throw error('HUAWEI_RECEIPT_UNAUTHORIZED');
    fields[match[1]] = match[2];
  }
  if (
    !/^\d{10}(?:\d{3})?$/.test(fields.timestamp || '') ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(fields.nonce || '') ||
    !/^[A-Za-z0-9+/]{43}=$/.test(fields.value || '')
  )
    throw error('HUAWEI_RECEIPT_UNAUTHORIZED');
  const timestamp = Number(fields.timestamp) * (fields.timestamp.length === 10 ? 1000 : 1);
  if (Math.abs(now - timestamp) > 5 * 60_000) throw error('HUAWEI_RECEIPT_UNAUTHORIZED');
  const expected = createHmac('sha256', config.key)
    .update(fields.timestamp + fields.nonce + config.username)
    .digest();
  const actual = Buffer.from(fields.value, 'base64');
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual))
    throw error('HUAWEI_RECEIPT_UNAUTHORIZED');
  return {
    nonceKey: createHash('sha256')
      .update(fields.timestamp + ':' + fields.nonce)
      .digest('hex'),
    expiresAt: timestamp + 5 * 60_000,
  };
}

export function parseHuaweiReceipts(body, env = process.env) {
  if (!object(body) || !Array.isArray(body.statuses) || body.statuses.length < 1 || body.statuses.length > 100)
    throw error('HUAWEI_RECEIPT_PAYLOAD_INVALID');
  const packageName = env.HUAWEI_PUSH_PACKAGE_NAME || 'top.boluo66.lightnote';
  return body.statuses
    .map((row) => {
      if (
        !object(row) ||
        !bounded(row.token, 2048) ||
        typeof row.biTag !== 'string' ||
        row.biTag.length > 100 ||
        !bounded(row.requestId, 128)
      )
        throw error('HUAWEI_RECEIPT_PAYLOAD_INVALID');
      const v2 = row.deliveryStatus !== undefined || row.appPackageName !== undefined;
      let result,
        timestamp,
        subStatus = null,
        applicationMatches;
      if (v2) {
        if (!bounded(row.appPackageName, 255)) throw error('HUAWEI_RECEIPT_PAYLOAD_INVALID');
        applicationMatches = row.appPackageName === packageName;
        // Future V2 receipt kinds may have no deliveryStatus. They are acknowledged,
        // but cannot be interpreted as proof of delivery.
        if (row.deliveryStatus === undefined) return null;
        if (!object(row.deliveryStatus)) throw error('HUAWEI_RECEIPT_PAYLOAD_INVALID');
        ({ result, timestamp } = row.deliveryStatus);
      } else {
        const appIds = [row.appid, row.clientId];
        if (!appIds.some((id) => bounded(id, 128)) && !bounded(row.projectid, 128))
          throw error('HUAWEI_RECEIPT_PAYLOAD_INVALID');
        applicationMatches =
          appIds.some((id) => bounded(id, 128) && id === env.HUAWEI_PUSH_APP_ID) ||
          (bounded(row.projectid, 128) && row.projectid === env.HUAWEI_PUSH_PROJECT_ID);
        result = row.status;
        timestamp = row.timestamp;
        if (row.subStatus !== undefined) subStatus = row.subStatus;
      }
      if (
        !Number.isInteger(result) ||
        result < 0 ||
        result > 65535 ||
        !Number.isSafeInteger(timestamp) ||
        timestamp < 946_684_800_000 ||
        timestamp > 253_402_300_799_999 ||
        (subStatus !== null && (!Number.isInteger(subStatus) || subStatus < 0 || subStatus > 65535))
      )
        throw error('HUAWEI_RECEIPT_PAYLOAD_INVALID');
      const match = row.biTag.match(/^ln:([a-f\d-]{36})$/i);
      if (!applicationMatches || !match) return null; // Includes the provider's fixed setup probe.
      const attemptId = match[1].toLowerCase();
      const tokenHash = huaweiReceiptTokenHash(row.token);
      const id = createHash('sha256')
        .update(JSON.stringify([attemptId, row.requestId, result, subStatus, timestamp]))
        .digest('hex');
      return { id, attemptId, tokenHash, requestId: row.requestId, result, subStatus, timestamp };
    })
    .filter(Boolean);
}

export function huaweiReceiptMeaning(result, subStatus = null) {
  const code = result === 201 && [2, 5, 6].includes(subStatus) ? subStatus : result;
  return (
    {
      0: 'delivered',
      2: 'app_uninstalled',
      5: 'token_mismatch',
      6: 'notifications_disabled',
      10: 'device_inactive',
      14: 'provider_error',
      15: 'offline_message_replaced',
      22: 'device_user_mismatch',
      27: 'data_message_cached',
      31: 'unsupported_message',
      51: 'device_locked_after_restart',
      102: 'message_rate_limited',
      201: 'provider_controlled',
      256: 'marketing_rate_limited',
    }[code] || 'provider_unknown'
  );
}
