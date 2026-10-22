import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('../util/huaweiPushDelivery.js', () => ({ recordHuaweiReceipts: vi.fn() }));
import { recordHuaweiReceipts } from '../util/huaweiPushDelivery.js';
import { createHuaweiPushReceiptRouter, HUAWEI_PUSH_RECEIPT_PATH } from './huaweiPushReceipt.js';

const now = Date.parse('2026-10-22T03:00:00Z');
const key = Buffer.alloc(32, 5);
const env = {
  LIGHTNOTE_RUNTIME_ENV: 'production',
  HUAWEI_PUSH_RECEIPTS_ENABLED: 'true',
  HUAWEI_PUSH_RECEIPT_USERNAME: 'fixture',
  HUAWEI_PUSH_RECEIPT_SECRET: key.toString('base64'),
  HUAWEI_PUSH_APP_ID: '123',
};
const attemptId = '3d863da1-f023-46dc-84df-0f7f5b43c8ba';
const token = 'test-only-token-'.repeat(8);
const body = () => ({
  statuses: [
    {
      token,
      biTag: `ln:${attemptId}`,
      requestId: 'req1',
      appPackageName: 'top.boluo66.lightnote',
      deliveryStatus: { result: 0, timestamp: now },
    },
  ],
});
const header = () => {
  const nonce = randomUUID();
  return (
    `timestamp=${now};nonce=${nonce};value=` +
    createHmac('sha256', key)
      .update(String(now) + nonce + 'fixture')
      .digest('base64')
  );
};
let server, url;
beforeAll(async () => {
  const app = express();
  app.use(
    HUAWEI_PUSH_RECEIPT_PATH,
    createHuaweiPushReceiptRouter({ db: { fixture: true }, env, now: () => now }),
  );
  app.use((req, res) => res.status(401).json({ code: 'ACCOUNT_AUTH_REQUIRED' }));
  const proxy = express();
  // Exercise the public URL through the same /api stripping used by Vite/Nginx.
  proxy.use('/api', app);
  server = createServer(proxy);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/api/notification/huawei/receipt`;
});
afterAll(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(() => {
  vi.clearAllMocks();
  recordHuaweiReceipts.mockResolvedValue({ recorded: 1, ignored: 0 });
});
const post = (payload, signature = header()) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-HUAWEI-CALLBACK-ID': signature } : {}) },
    body: JSON.stringify(payload),
  });

describe('Huawei public authenticated receipt route', () => {
  it('uses provider authentication independently of user sessions and responds with the provider acknowledgement', async () => {
    const response = await post(body());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: '0', message: 'success' });
    expect(recordHuaweiReceipts).toHaveBeenCalledWith({ fixture: true }, [
      expect.objectContaining({ attemptId, result: 0 }),
    ]);
    expect(JSON.stringify(recordHuaweiReceipts.mock.calls)).not.toContain(token);
  });
  it('rejects a missing signature before parsing a body or querying the database', async () => {
    const response = await post(body(), null);
    expect(response.status).toBe(401);
    expect(recordHuaweiReceipts).not.toHaveBeenCalled();
  });
  it('rejects an altered signature', async () => {
    const response = await post(body(), header().replace('timestamp=', 'timestamp=9'));
    expect(response.status).toBe(401);
    expect(recordHuaweiReceipts).not.toHaveBeenCalled();
  });
  it('allows exact provider retries and rejects reuse of a signed nonce with another body', async () => {
    const auth = header();
    expect((await post(body(), auth)).status).toBe(200);
    expect((await post(body(), auth)).status).toBe(200);
    const changed = body();
    changed.statuses[0].deliveryStatus.result = 256;
    expect((await post(changed, auth)).status).toBe(401);
    expect(recordHuaweiReceipts).toHaveBeenCalledTimes(2);
  });
  it('acknowledges a signed fixed setup probe without treating it as device delivery', async () => {
    const probe = body();
    probe.statuses[0].biTag = 'provider_fixed_test';
    expect((await post(probe)).status).toBe(200);
    expect(recordHuaweiReceipts).toHaveBeenCalledWith({ fixture: true }, []);
  });
  it('reserves a nonce before storage completes and canonicalizes header whitespace', async () => {
    let release;
    const entered = new Promise((resolve) => {
      recordHuaweiReceipts.mockImplementationOnce(
        () =>
          new Promise((done) => {
            release = () => done({ recorded: 1 });
            resolve();
          }),
      );
    });
    const auth = header();
    const first = post(body(), auth);
    await entered;
    try {
      const changed = body();
      changed.statuses[0].deliveryStatus.result = 6;
      expect((await post(changed, auth.replaceAll(';', '; '))).status).toBe(401);
      expect(recordHuaweiReceipts).toHaveBeenCalledOnce();
    } finally {
      release();
    }
    expect((await first).status).toBe(200);
  });
  it('rejects malformed or oversized batches without returning their contents', async () => {
    let response = await post({ statuses: [{ token }] });
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain(token);
    response = await post({ statuses: [{ token: 'x'.repeat(270000) }] });
    expect(response.status).toBe(413);
    expect(recordHuaweiReceipts).not.toHaveBeenCalled();
  });
  it('returns a retryable failure on a storage error and never discloses the raw exception', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      recordHuaweiReceipts.mockRejectedValueOnce(new Error(token));
      const response = await post(body());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        code: 'HUAWEI_RECEIPT_STORE_FAILED',
        message: 'HUAWEI_RECEIPT_STORE_FAILED',
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    } finally {
      log.mockRestore();
    }
  });
});
