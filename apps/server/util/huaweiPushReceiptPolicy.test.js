import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  huaweiReceiptConfig,
  verifyHuaweiReceiptHeader,
  parseHuaweiReceipts,
  huaweiReceiptMeaning,
} from './huaweiPushReceiptPolicy.js';

const now = Date.parse('2026-10-22T03:00:00Z');
const key = Buffer.alloc(32, 7);
const env = {
  LIGHTNOTE_RUNTIME_ENV: 'production',
  HUAWEI_PUSH_RECEIPTS_ENABLED: 'true',
  HUAWEI_PUSH_RECEIPT_USERNAME: 'fixture',
  HUAWEI_PUSH_RECEIPT_SECRET: key.toString('base64'),
  HUAWEI_PUSH_APP_ID: '123',
  HUAWEI_PUSH_PROJECT_ID: '456',
};
const attemptId = '3d863da1-f023-46dc-84df-0f7f5b43c8ba';
const token = 'test-only-token-'.repeat(8);
const v1 = (patch = {}) => ({
  token,
  biTag: `ln:${attemptId}`,
  requestId: 'request1',
  clientId: '123',
  status: 0,
  timestamp: now,
  ...patch,
});
const v2 = (patch = {}) => ({
  token,
  biTag: `ln:${attemptId}`,
  requestId: 'request1',
  appPackageName: 'top.boluo66.lightnote',
  deliveryStatus: { result: 0, timestamp: now },
  ...patch,
});
const sign = (timestamp = String(now), nonce = 'test-nonce-12345', secret = key) => {
  const value = createHmac('sha256', secret)
    .update(timestamp + nonce + env.HUAWEI_PUSH_RECEIPT_USERNAME)
    .digest('base64');
  return `timestamp=${timestamp}; nonce=${nonce}; value=${value}`;
};

describe('Huawei receipt authentication', () => {
  it('uses the Base64-decoded key and accepts documented second/millisecond timestamps', () => {
    expect(huaweiReceiptConfig(env).key.equals(key)).toBe(true);
    expect(verifyHuaweiReceiptHeader(sign(), env, now)).toMatchObject({ expiresAt: now + 300000 });
    expect(verifyHuaweiReceiptHeader(sign(String(now / 1000)), env, now)).toHaveProperty('nonceKey');
  });
  it.each([
    undefined,
    {},
    'x'.repeat(1025),
    'timestamp=1;nonce=12345678;value=x',
    sign() + ';timestamp=' + now,
    sign() + ';other=field',
    sign(String(now - 300001)),
    sign(String(now + 300001)),
    sign(String(now), 'bad nonce'),
    sign(String(now), 'test-nonce-12345', Buffer.alloc(32, 8)),
  ])('fails closed for an invalid signature/header (%#)', (header) => {
    expect(() => verifyHuaweiReceiptHeader(header, env, now)).toThrow('HUAWEI_RECEIPT_UNAUTHORIZED');
  });
  it('does not enable a public callback outside production or without strong configured authentication', () => {
    expect(huaweiReceiptConfig({})).toBeNull();
    expect(() => verifyHuaweiReceiptHeader(sign(), {}, now)).toThrow('HUAWEI_RECEIPT_DISABLED');
    for (const patch of [
      { LIGHTNOTE_RUNTIME_ENV: 'local' },
      { HUAWEI_PUSH_RECEIPT_USERNAME: '' },
      { HUAWEI_PUSH_RECEIPT_SECRET: 'not base64' },
      { HUAWEI_PUSH_RECEIPT_SECRET: Buffer.alloc(4).toString('base64') },
      { HUAWEI_PUSH_RECEIPT_ID: 'bad/id' },
    ])
      expect(() => huaweiReceiptConfig({ ...env, ...patch })).toThrow('HUAWEI_RECEIPT_CONFIG_INVALID');
  });
});

describe('Huawei V1/V2 delivery evidence', () => {
  it('normalizes both formats without retaining plaintext tokens', () => {
    const old = parseHuaweiReceipts({ statuses: [v1()] }, env)[0];
    const current = parseHuaweiReceipts({ statuses: [v2()] }, env)[0];
    expect(old).toEqual(current);
    expect(current).toMatchObject({ attemptId, requestId: 'request1', result: 0, subStatus: null, timestamp: now });
    expect(current.tokenHash).toHaveLength(64);
    expect(JSON.stringify(current)).not.toContain(token);
    expect(
      parseHuaweiReceipts(
        { statuses: [v1({ clientId: undefined, projectid: '456', status: 201, subStatus: 6 })] },
        env,
      )[0],
    ).toMatchObject({ result: 201, subStatus: 6 });
  });
  it('acknowledges setup probes, unrelated applications and future non-delivery V2 events without recording delivery', () => {
    for (const row of [
      v1({ biTag: '1000211_test211' }),
      v1({ clientId: 'other-app' }),
      v2({ appPackageName: 'other.app' }),
      v2({ deliveryStatus: undefined }),
    ])
      expect(parseHuaweiReceipts({ statuses: [row] }, env)).toEqual([]);
  });
  it('accepts V1 appid receipts while keeping setup probes and other apps out of delivery evidence', () => {
    const receipt = v1({ clientId: undefined, appid: '123' });
    expect(parseHuaweiReceipts({ statuses: [receipt] }, env)).toEqual(
      parseHuaweiReceipts({ statuses: [v2()] }, env),
    );
    expect(
      parseHuaweiReceipts({ statuses: [{ ...receipt, appid: 'fixture-app', biTag: 'provider_fixed_test' }] }, env),
    ).toEqual([]);
    expect(parseHuaweiReceipts({ statuses: [{ ...receipt, appid: 'other-app' }] }, env)).toEqual([]);
    expect(
      parseHuaweiReceipts({ statuses: [receipt] }, { ...env, HUAWEI_PUSH_APP_ID: undefined }),
    ).toEqual([]);
  });
  it.each([
    null,
    [],
    {},
    { statuses: [] },
    { statuses: Array(101).fill(v1()) },
    { statuses: [null] },
    { statuses: [v2({ deliveryStatus: [] })] },
    { statuses: [v1({ status: '0' })] },
    { statuses: [v1({ timestamp: 0 })] },
    { statuses: [v1({ timestamp: 253402300800000 })] },
    { statuses: [v1({ token: '' })] },
    { statuses: [v1({ subStatus: '6' })] },
    { statuses: [v1({ clientId: undefined })] },
    { statuses: [v1({ clientId: undefined, appid: '' })] },
    { statuses: [v1({ clientId: undefined, appid: 123 })] },
    { statuses: [v1({ clientId: undefined, appid: 'x'.repeat(129) })] },
    { statuses: [v2({ appPackageName: [] })] },
    { statuses: [v1(), v1({ requestId: [] })] },
  ])('rejects malformed batches atomically (%#)', (body) => {
    expect(() => parseHuaweiReceipts(body, env)).toThrow('HUAWEI_RECEIPT_PAYLOAD_INVALID');
  });
  it('distinguishes delivery, disabled notifications, token mismatch and marketing rate limits', () => {
    expect(huaweiReceiptMeaning(0)).toBe('delivered');
    expect(huaweiReceiptMeaning(6)).toBe('notifications_disabled');
    expect(huaweiReceiptMeaning(201, 5)).toBe('token_mismatch');
    expect(huaweiReceiptMeaning(201, 0)).toBe('provider_controlled');
    expect(huaweiReceiptMeaning(256)).toBe('marketing_rate_limited');
    expect(huaweiReceiptMeaning(102)).toBe('message_rate_limited');
    expect(huaweiReceiptMeaning(65535)).toBe('provider_unknown');
  });
});
