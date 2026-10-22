import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { browserPushTableSql } from './browserPushSchema.js';
import { ensureHuaweiPushDeliverySchema } from './huaweiPushDeliverySchema.js';
import { beginHuaweiPushAttempt, finishHuaweiPushAttempt, recordHuaweiReceipts } from './huaweiPushDelivery.js';
import { huaweiReceiptTokenHash, parseHuaweiReceipts } from './huaweiPushReceiptPolicy.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = 'huawei_delivery_' + randomUUID().replaceAll('-', '');
const token = 'fixture-token-'.repeat(8);
const time = Date.parse('2026-10-22T03:00:00Z');
const env = { HUAWEI_PUSH_APP_ID: '123' };
let admin, db;

describe.skipIf(!socketPath)('Huawei delivery evidence real SQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema}`);
    db = mysql.createPool({ socketPath, user: 'root', database: schema, timezone: 'Z' });
    for (const sql of browserPushTableSql) await db.query(sql);
    await ensureHuaweiPushDeliverySchema(db);
    await ensureHuaweiPushDeliverySchema(db);
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE ${schema}`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await db.query('DELETE FROM browser_push_jobs');
    await db.query('DELETE FROM browser_push_subscriptions');
  });

  async function attempt() {
    const subscription = { id: randomUUID(), generation: randomUUID(), endpoint: 'huawei:' + token };
    await db.query(
      `INSERT INTO browser_push_subscriptions
      (id,user_id,generation,endpoint,endpoint_hash,p256dh,auth,active) VALUES (?,'fixture',?,?,?,'','',1)`,
      [subscription.id, subscription.generation, subscription.endpoint, huaweiReceiptTokenHash(token)],
    );
    const [job] = await db.query(
      `INSERT INTO browser_push_jobs
      (notification_id,subscription_id,generation,status,expires_at) VALUES (?,?,?,'accepted',DATE_ADD(NOW(),INTERVAL 1 DAY))`,
      [randomUUID(), subscription.id, subscription.generation],
    );
    const id = randomUUID();
    await beginHuaweiPushAttempt(db, id, { id: job.insertId }, subscription, 'SUBSCRIPTION', 'community_chat');
    return { id, subscription, jobId: job.insertId };
  }
  const receipt = (id, result = 0, offset = 0, overrides = {}) =>
    parseHuaweiReceipts(
      {
        statuses: [
          {
            token,
            biTag: 'ln:' + id,
            requestId: 'provider-request',
            appPackageName: 'top.boluo66.lightnote',
            deliveryStatus: { result, timestamp: time + offset },
            ...overrides,
          },
        ],
      },
      env,
    )[0];
  const row = async (id) => (await db.query('SELECT * FROM huawei_push_delivery_attempts WHERE id=?', [id]))[0][0];

  it('stores provider acceptance separately from actual delivery', async () => {
    const { id } = await attempt();
    await finishHuaweiPushAttempt(db, id, 'accepted', null, 'provider-request');
    expect(await row(id)).toMatchObject({
      category: 'SUBSCRIPTION',
      notification_type: 'community_chat',
      provider_request_id: 'provider-request',
      send_status: 'accepted',
      receipt_result: null,
      delivered_at: null,
    });
    expect((await row(id)).accepted_at).toBeInstanceOf(Date);
  });
  it('accepts an early receipt and preserves it when the send response arrives later', async () => {
    const { id } = await attempt();
    expect(await recordHuaweiReceipts(db, [receipt(id)])).toEqual({ recorded: 1, ignored: 0 });
    await finishHuaweiPushAttempt(db, id, 'accepted', null, 'provider-request');
    expect(await row(id)).toMatchObject({
      provider_request_id: 'provider-request',
      send_status: 'accepted',
      receipt_result: 0,
    });
    expect((await row(id)).delivered_at.getTime()).toBe(time);
  });
  it('deduplicates concurrent provider retries and keeps delivery evidence across out-of-order statuses', async () => {
    const { id } = await attempt();
    await Promise.all([recordHuaweiReceipts(db, [receipt(id)]), recordHuaweiReceipts(db, [receipt(id)])]);
    await recordHuaweiReceipts(db, [receipt(id, 256, -1000), receipt(id, 6, 1000)]);
    const latest = await row(id);
    expect(latest.receipt_result).toBe(6);
    expect(latest.receipt_at.getTime()).toBe(time + 1000);
    expect(latest.delivered_at.getTime()).toBe(time);
    expect((await db.query('SELECT COUNT(*) n FROM huawei_push_delivery_receipts'))[0][0].n).toBe(3);
  });
  it('ignores a mismatched token, provider request, application and unknown attempt', async () => {
    const { id } = await attempt();
    await finishHuaweiPushAttempt(db, id, 'accepted', null, 'provider-request');
    const wrongApp = parseHuaweiReceipts(
      {
        statuses: [
          {
            token,
            biTag: 'ln:' + id,
            requestId: 'provider-request',
            appPackageName: 'another.application',
            deliveryStatus: { result: 0, timestamp: time },
          },
        ],
      },
      env,
    );
    expect(wrongApp).toEqual([]);
    expect(
      await recordHuaweiReceipts(db, [
        receipt(id, 0, 0, { token: 'other-token' }),
        receipt(id, 0, 0, { requestId: 'other-request' }),
        receipt(randomUUID()),
      ]),
    ).toEqual({ recorded: 0, ignored: 3 });
    expect((await row(id)).delivered_at).toBeNull();
  });
  it.each([2, 5])('retires only the provider-confirmed invalid binding generation (%s)', async (result) => {
    const { id, subscription } = await attempt();
    await db.query(
      `INSERT INTO browser_push_jobs
      (notification_id,subscription_id,generation,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))`,
      [randomUUID(), subscription.id, subscription.generation],
    );
    await recordHuaweiReceipts(db, [receipt(id, result)]);
    expect(
      (await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [subscription.id]))[0][0].active,
    ).toBe(3);
    const [jobs] = await db.query('SELECT status FROM browser_push_jobs ORDER BY id');
    expect(jobs.map((job) => job.status)).toEqual(['accepted', 'cancelled']);
  });
  it('never invalidates a newer generation after token re-registration', async () => {
    const { id, subscription } = await attempt();
    const generation = randomUUID();
    await db.query('UPDATE browser_push_subscriptions SET generation=? WHERE id=?', [generation, subscription.id]);
    await db.query(
      `INSERT INTO browser_push_jobs
      (notification_id,subscription_id,generation,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))`,
      [randomUUID(), subscription.id, generation],
    );
    await recordHuaweiReceipts(db, [receipt(id, 5)]);
    expect(
      (await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [subscription.id]))[0][0].active,
    ).toBe(1);
    expect((await db.query('SELECT status FROM browser_push_jobs WHERE generation=?', [generation]))[0][0].status).toBe(
      'pending',
    );
  });
  it.each([6, 256])(
    'keeps a valid binding when notification permissions or marketing policy block it (%s)',
    async (result) => {
      const { id, subscription } = await attempt();
      await recordHuaweiReceipts(db, [receipt(id, result)]);
      expect(
        (await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [subscription.id]))[0][0].active,
      ).toBe(1);
      expect((await row(id)).delivered_at).toBeNull();
    },
  );
  it('handles V1 invalid-token substatus without treating a provider-controlled status as delivered', async () => {
    const { id, subscription } = await attempt();
    const records = parseHuaweiReceipts(
      {
        statuses: [
          {
            token,
            biTag: 'ln:' + id,
            requestId: 'provider-request',
            clientId: '123',
            status: 201,
            subStatus: 5,
            timestamp: time,
          },
        ],
      },
      env,
    );
    await recordHuaweiReceipts(db, records);
    expect((await row(id)).delivered_at).toBeNull();
    expect(
      (await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [subscription.id]))[0][0].active,
    ).toBe(3);
  });
  it('rolls back a partially stored batch on database failure', async () => {
    const { id } = await attempt();
    const failedDb = {
      getConnection: async () => {
        const conn = await db.getConnection();
        return {
          beginTransaction: () => conn.beginTransaction(),
          commit: () => conn.commit(),
          rollback: () => conn.rollback(),
          release: () => conn.release(),
          query: (sql, params) => {
            if (sql.includes('INSERT IGNORE') && params[3] === 6) throw new Error('fixture storage failure');
            return conn.query(sql, params);
          },
        };
      },
    };
    await expect(recordHuaweiReceipts(failedDb, [receipt(id), receipt(id, 6, 1000)])).rejects.toThrow(
      'fixture storage failure',
    );
    expect((await row(id)).delivered_at).toBeNull();
    expect((await db.query('SELECT COUNT(*) n FROM huawei_push_delivery_receipts'))[0][0].n).toBe(0);
  });
  it('cascades job retention and account deletion to attempts and receipts', async () => {
    const { id, jobId } = await attempt();
    await recordHuaweiReceipts(db, [receipt(id)]);
    await db.query('DELETE FROM browser_push_jobs WHERE id=?', [jobId]);
    expect(await row(id)).toBeUndefined();
    expect((await db.query('SELECT COUNT(*) n FROM huawei_push_delivery_receipts'))[0][0].n).toBe(0);
  });
  it('checks column types, ordered indexes and deletion cascades using the production Schema assertions', async () => {
    const source = await readFile(new URL('../migrations/schema-assertions.sql', import.meta.url), 'utf8');
    const sql = source
      .split('-- Huawei delivery evidence contract (begin).')[1]
      .split('-- Huawei delivery evidence contract (end).')[0]
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const check = async () => {
      const failures = [];
      for (const statement of sql) failures.push(...(await db.query(statement))[0]);
      return failures;
    };
    expect(await check()).toEqual([]);
    await db.query('ALTER TABLE huawei_push_delivery_attempts DROP INDEX idx_huawei_attempt_subscription');
    expect(await check()).toContainEqual({
      check_name: 'huawei_delivery_index',
      detail: 'huawei_push_delivery_attempts.idx_huawei_attempt_subscription',
    });
    await db.query(
      'ALTER TABLE huawei_push_delivery_attempts ADD INDEX idx_huawei_attempt_subscription(subscription_id,created_at)',
    );
    await db.query('ALTER TABLE huawei_push_delivery_receipts DROP FOREIGN KEY fk_huawei_receipt_attempt');
    expect(await check()).toContainEqual({
      check_name: 'huawei_delivery_cascade',
      detail: 'huawei_push_delivery_receipts.fk_huawei_receipt_attempt',
    });
    await db.query(
      'ALTER TABLE huawei_push_delivery_receipts ADD CONSTRAINT fk_huawei_receipt_attempt FOREIGN KEY (attempt_id) REFERENCES huawei_push_delivery_attempts(id) ON DELETE CASCADE',
    );
    expect(await check()).toEqual([]);
  });
});
