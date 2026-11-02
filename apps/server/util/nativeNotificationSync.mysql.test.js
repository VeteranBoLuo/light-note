import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { COMMUNITY_CHAT_TABLE_SQL } from './communityChatSchema.js';
import * as feedSchema from './communityFeed/schema.js';
import { browserPushTableSql } from './browserPushSchema.js';
import { ensureHuaweiPushDeliverySchema } from './huaweiPushDeliverySchema.js';
import {
  installHuaweiPushInstallationSchema,
  assertHuaweiPushInstallationSchema,
} from './huaweiPushInstallationSchema.js';
import { bindHuaweiInstallation, bindLegacyHuaweiInstallation } from './huaweiPushInstallations.js';
import {
  previewLegacyHuaweiCleanup,
  applyLegacyHuaweiCleanup,
  pruneInactivePushSubscriptions,
  reconcileLegacyHuaweiCleanup,
} from './huaweiPushMaintenance.js';
import {
  bindHuaweiSubscription,
  bindPushSubscription,
  activatePushSubscription,
  unbindPushSubscription,
  expandPushOutbox,
  processNextPush,
} from './browserPushService.js';
import { randomUUID } from 'node:crypto';
import { readNativeNotifications, validateNativeCursor } from './nativeNotificationSync.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = 'native_notification_' + randomUUID().replaceAll('-', '');
let db, admin;
describe('native cursor validation', () => {
  it('rejects malformed and non-string cursor values', () => {
    for (const value of [{ since: [] }, { since: 'invalid' }, { cursor: {} }, { cursor: 'bad' }])
      expect(() => validateNativeCursor(value)).toThrow();
  });
});
describe('automatic legacy cleanup approval', () => {
  it('rejects missing, empty or duplicated approval snapshots before borrowing a connection', async () => {
    const getConnection = vi.fn();
    const row = { id: randomUUID(), generation: randomUUID(), endpointHash: 'a'.repeat(64) };
    const plan = {
      version: 1,
      userId: 'alice',
      providerAppId: '123',
      packageName: 'top.boluo66.lightnote',
      notBefore: '2000-01-01 00:00:00.000000',
      legacy: [row],
    };
    for (const invalid of [
      undefined,
      {},
      { ...plan, legacy: [] },
      { ...plan, legacy: [row, row] },
      { ...plan, legacy: [{ ...row, endpointHash: 'invalid' }] },
    ])
      await expect(reconcileLegacyHuaweiCleanup({ getConnection }, invalid, { apply: true })).rejects.toMatchObject({
        code: 'HUAWEI_CLEANUP_PLAN_INVALID',
      });
    expect(getConnection).not.toHaveBeenCalled();
  });
});
describe.skipIf(!socketPath)('native notification real SQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (!Number(runtime.isolated)) throw new Error('Isolated MySQL required');
    // 历史通知/账号与推送表故意采用不同排序规则，不能依赖服务器默认值。
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = mysql.createPool({ socketPath, user: 'root', database: schema });
    for (const sql of COMMUNITY_CHAT_TABLE_SQL) await db.query(sql);
    for (const sql of browserPushTableSql) await db.query(sql);
    await installHuaweiPushInstallationSchema(db);
    await ensureHuaweiPushDeliverySchema(db);
    await db.query(
      "CREATE TABLE user (id char(36) PRIMARY KEY, del_flag tinyint DEFAULT 0, role varchar(20) DEFAULT 'user', preferences json)",
    );
    await db.query(
      "CREATE TABLE todo_items (id char(36) PRIMARY KEY, user_id char(36), title varchar(255), description text, del_flag tinyint DEFAULT 0, status varchar(20) DEFAULT 'pending')",
    );
    await db.query(
      'CREATE TABLE todo_reminder_jobs (id varchar(64) PRIMARY KEY, todo_id char(36), user_id char(36), channel varchar(20), status varchar(20))',
    );
    await db.query(`CREATE TABLE notification (
      id char(36) PRIMARY KEY, user_id char(36), type varchar(32), source_type varchar(40), source_id varchar(64),
      title varchar(255), content text, browser_push_pending tinyint DEFAULT 0, meta json, del_flag tinyint DEFAULT 0, recalled tinyint DEFAULT 0,
      create_time datetime DEFAULT CURRENT_TIMESTAMP, browser_push_created_at datetime(6),
      KEY idx_user_time(user_id,create_time))`);
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE ${schema}`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    vi.unstubAllEnvs();
    await db.query('DELETE FROM notification');
    await db.query('DELETE FROM browser_push_subscriptions');
    await db.query('DELETE FROM huawei_push_installations');
    await db.query('DELETE FROM browser_push_jobs');
    await db.query('DELETE FROM user');
    await db.query('DELETE FROM todo_items');
    await db.query('DELETE FROM todo_reminder_jobs');
  });
  async function add(values = {}, connection = db) {
    const row = { id: randomUUID(), user_id: 'alice', type: 'system', ...values };
    await connection.query('INSERT INTO notification SET ?,browser_push_created_at=NOW(6)', [row]);
    return row.id;
  }
  const managedEnv = {
    HUAWEI_PUSH_INSTALLATION_V2_ENABLED: 'true',
    HUAWEI_PUSH_APP_ID: '123',
    HUAWEI_PUSH_PACKAGE_NAME: 'top.boluo66.lightnote',
  };
  const installation = (values = {}) => ({
    id: randomUUID(),
    key: 'a'.repeat(64),
    revision: 1,
    packageName: 'top.boluo66.lightnote',
    pushAppId: '123',
    deviceLabel: 'test-device',
    identityKind: 'scoped',
    ...values,
  });
  const managedBind = async (token, identity, owner = 'alice', connection = db) => {
    try {
      return await bindHuaweiInstallation(owner, token.repeat(100), identity, connection, managedEnv);
    } catch (error) {
      if (error.code !== 'PUSH_INSTALLATION_CHALLENGE_REQUIRED') throw error;
      return bindHuaweiInstallation(
        owner,
        token.repeat(100),
        { ...identity, expectedCurrentId: error.currentInstallationId },
        connection,
        managedEnv,
      );
    }
  };
  async function cleanupPlan(owner = 'alice', values = {}) {
    const [rows] = await db.query(
      "SELECT id,generation,endpoint_hash FROM browser_push_subscriptions WHERE user_id=? AND endpoint LIKE 'huawei:%' AND installation_id IS NULL AND active IN(1,2) ORDER BY id",
      [owner],
    );
    return {
      version: 1,
      userId: owner,
      providerAppId: '123',
      packageName: 'top.boluo66.lightnote',
      notBefore: '2000-01-01 00:00:00.000000',
      legacy: rows.map((row) => ({ id: row.id, generation: row.generation, endpointHash: row.endpoint_hash })),
      ...values,
    };
  }

  it('waits for a fresh activated native installation before applying an approved legacy migration', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const old = await bindHuaweiSubscription('alice', 'a'.repeat(100), null, db);
    await activatePushSubscription('alice', old.id, old.generation, db);
    const plan = await cleanupPlan();
    expect(await reconcileLegacyHuaweiCleanup(db, plan, { apply: true })).toMatchObject({
      status: 'waiting',
      reason: 'current_device_not_registered',
    });
    const identity = installation();
    const next = await managedBind('b', identity);
    expect(await reconcileLegacyHuaweiCleanup(db, plan, { apply: true })).toMatchObject({
      status: 'waiting',
      reason: 'current_binding_not_active',
    });
    await activatePushSubscription('alice', next.id, next.generation, db);
    const future = { ...plan, notBefore: '2099-01-01 00:00:00.000000' };
    expect(await reconcileLegacyHuaweiCleanup(db, future, { apply: true })).toMatchObject({
      status: 'waiting',
      reason: 'current_registration_not_refreshed',
    });
    expect(await reconcileLegacyHuaweiCleanup(db, plan)).toMatchObject({
      status: 'ready',
      retireCount: 1,
      retiredCount: 0,
    });
    const [[untouched]] = await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [old.id]);
    expect(untouched.active).toBe(1);
    expect(await reconcileLegacyHuaweiCleanup(db, plan, { apply: true })).toMatchObject({
      status: 'completed',
      retiredCount: 1,
      keptCount: 1,
    });
  });

  it('adopts the current legacy token, cancels only approved history and is idempotent under concurrent cleanup', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice'),('bob')");
    const current = await bindHuaweiSubscription('alice', 'a'.repeat(100), null, db);
    const old = await bindHuaweiSubscription('alice', 'b'.repeat(100), null, db);
    const otherAccount = await bindHuaweiSubscription('bob', 'c'.repeat(100), null, db);
    for (const [owner, binding] of [
      ['alice', current],
      ['alice', old],
      ['bob', otherAccount],
    ])
      await activatePushSubscription(owner, binding.id, binding.generation, db);
    const browserId = randomUUID();
    await db.query(
      "INSERT INTO browser_push_subscriptions (id,user_id,endpoint_hash,endpoint,p256dh,auth,generation,active) VALUES (?,'alice',?,'https://fcm.googleapis.com/fixture','','',?,1)",
      [browserId, 'f'.repeat(64), randomUUID()],
    );
    await db.query(
      'INSERT INTO browser_push_jobs (notification_id,subscription_id,generation,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))',
      [randomUUID(), old.id, old.generation],
    );
    const plan = await cleanupPlan();
    // An installation-only identity still proves the current installation for
    // this explicitly approved one-time account repair; it does not prove
    // cross-reinstall identity for the general registration protocol.
    await managedBind('a', installation({ identityKind: 'installation' }));
    const results = await Promise.all([
      reconcileLegacyHuaweiCleanup(db, plan, { apply: true }),
      reconcileLegacyHuaweiCleanup(db, plan, { apply: true }),
    ]);
    expect(results.map((r) => r.retiredCount).sort()).toEqual([0, 1]);
    const [[retired]] = await db.query(
      'SELECT active,endpoint,retired_reason FROM browser_push_subscriptions WHERE id=?',
      [old.id],
    );
    expect(retired).toEqual({ active: 0, endpoint: 'huawei:retired', retired_reason: 'legacy_cleanup' });
    const [[job]] = await db.query('SELECT status FROM browser_push_jobs WHERE subscription_id=?', [old.id]);
    expect(job.status).toBe('cancelled');
    const [preserved] = await db.query('SELECT id,active FROM browser_push_subscriptions WHERE id IN (?)', [
      [current.id, otherAccount.id, browserId],
    ]);
    expect(preserved).toHaveLength(3);
    expect(preserved.every((row) => row.active === 1)).toBe(true);
  });

  it('refuses unapproved additions or changed generations and waits if another current device exists', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const old = await bindHuaweiSubscription('alice', 'a'.repeat(100), null, db);
    await activatePushSubscription('alice', old.id, old.generation, db);
    const plan = await cleanupPlan();
    const current = await managedBind('b', installation());
    await activatePushSubscription('alice', current.id, current.generation, db);
    await db.query('UPDATE browser_push_subscriptions SET generation=? WHERE id=?', [randomUUID(), old.id]);
    await expect(reconcileLegacyHuaweiCleanup(db, plan, { apply: true })).rejects.toMatchObject({
      code: 'HUAWEI_CLEANUP_STATE_CHANGED',
    });
    const renewedPlan = await cleanupPlan();
    const added = await bindHuaweiSubscription('alice', 'c'.repeat(100), null, db);
    await expect(reconcileLegacyHuaweiCleanup(db, renewedPlan, { apply: true })).rejects.toMatchObject({
      code: 'HUAWEI_CLEANUP_STATE_CHANGED',
    });
    await db.query('UPDATE browser_push_subscriptions SET active=0 WHERE id=?', [added.id]);
    const second = await managedBind('d', installation({ key: 'd'.repeat(64) }));
    await activatePushSubscription('alice', second.id, second.generation, db);
    expect(await reconcileLegacyHuaweiCleanup(db, renewedPlan, { apply: true })).toMatchObject({
      status: 'waiting',
      reason: 'multiple_current_devices',
    });
    const [[untouched]] = await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [old.id]);
    expect(untouched.active).toBe(1);
  });

  it('rolls back the automatic migration if job cancellation fails', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const old = await bindHuaweiSubscription('alice', 'a'.repeat(100), null, db);
    await activatePushSubscription('alice', old.id, old.generation, db);
    const plan = await cleanupPlan();
    const current = await managedBind('b', installation());
    await activatePushSubscription('alice', current.id, current.generation, db);
    const failedDb = {
      getConnection: async () => {
        const connection = await db.getConnection();
        return {
          beginTransaction: () => connection.beginTransaction(),
          commit: () => connection.commit(),
          rollback: () => connection.rollback(),
          release: () => connection.release(),
          query: (sql, args) =>
            sql.startsWith('UPDATE browser_push_jobs')
              ? Promise.reject(new Error('fixture cancellation failure'))
              : connection.query(sql, args),
        };
      },
    };
    await expect(reconcileLegacyHuaweiCleanup(failedDb, plan, { apply: true })).rejects.toThrow(
      'fixture cancellation failure',
    );
    const [[row]] = await db.query('SELECT active,endpoint FROM browser_push_subscriptions WHERE id=?', [old.id]);
    expect(row).toEqual({ active: 1, endpoint: 'huawei:' + 'a'.repeat(100) });
  });
  it('isolates browser capacity from Huawei history while retaining both limits and full-capacity token rotation', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const tokens = Array.from({ length: 20 }, (_, i) => `huawei_history_${i}_` + 'x'.repeat(64));
    for (const token of tokens) {
      const binding = await bindHuaweiSubscription('alice', token, null, db);
      await activatePushSubscription('alice', binding.id, binding.generation, db);
    }
    const browser = (i) => ({
      endpoint: `https://fcm.googleapis.com/fcm/send/browser_${i}`,
      keys: {
        p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url'),
        auth: Buffer.alloc(16, 2).toString('base64url'),
      },
    });
    for (let i = 0; i < 20; i++) await bindPushSubscription('alice', browser(i), 'zh-CN', db);
    await expect(bindPushSubscription('alice', browser(20), 'zh-CN', db)).rejects.toMatchObject({
      code: 'PUSH_DEVICE_LIMIT',
    });
    await expect(bindHuaweiSubscription('alice', 'new_huawei_' + 'y'.repeat(64), null, db)).rejects.toMatchObject({
      code: 'PUSH_DEVICE_LIMIT',
    });
    const identity = installation();
    const enrolled = await bindHuaweiInstallation(
      'alice',
      tokens[0],
      { ...identity, expectedCurrentId: null },
      db,
      managedEnv,
    );
    await activatePushSubscription('alice', enrolled.id, enrolled.generation, db);
    const rotated = await managedBind('r', { ...identity, revision: 2 });
    await activatePushSubscription('alice', rotated.id, rotated.generation, db);
    const [counts] = await db.query(
      "SELECT CASE WHEN endpoint LIKE 'huawei:%' THEN 'huawei' ELSE 'browser' END AS provider,COUNT(*) AS total FROM browser_push_subscriptions WHERE active IN(1,2) GROUP BY provider ORDER BY provider",
    );
    expect(counts).toEqual([
      { provider: 'browser', total: 20 },
      { provider: 'huawei', total: 20 },
    ]);
  });

  it('requires a live round trip and rejects a delayed first-install claim after a newer install connects', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const delayed = installation();
    await expect(bindHuaweiInstallation('alice', 'a'.repeat(100), delayed, db, managedEnv)).rejects.toMatchObject({
      code: 'PUSH_INSTALLATION_CHALLENGE_REQUIRED',
      currentInstallationId: null,
    });
    const [[before]] = await db.query('SELECT COUNT(*) total FROM huawei_push_installations');
    expect(Number(before.total)).toBe(0);
    const current = await managedBind('b', installation());
    await activatePushSubscription('alice', current.id, current.generation, db);
    await expect(
      bindHuaweiInstallation('alice', 'a'.repeat(100), { ...delayed, expectedCurrentId: null }, db, managedEnv),
    ).rejects.toMatchObject({ code: 'PUSH_INSTALLATION_SUPERSEDED' });
    const [[preserved]] = await db.query('SELECT active,generation FROM browser_push_subscriptions WHERE id=?', [
      current.id,
    ]);
    expect(preserved).toEqual({ active: 1, generation: current.generation });
  });

  it('installs and checks the additive installation schema idempotently without changing legacy rows', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const legacy = await bindHuaweiSubscription('alice', 'legacy'.repeat(20), null, db);
    await installHuaweiPushInstallationSchema(db);
    await assertHuaweiPushInstallationSchema(db);
    const [[row]] = await db.query('SELECT installation_id,active FROM browser_push_subscriptions WHERE id=?', [
      legacy.id,
    ]);
    expect(row).toEqual({ installation_id: null, active: 2 });
  });
  it('refuses startup when the device uniqueness constraint or generated predicate is wrong', async () => {
    await db.query('ALTER TABLE huawei_push_installations DROP INDEX uk_huawei_current_device');
    try {
      await expect(assertHuaweiPushInstallationSchema(db)).rejects.toMatchObject({
        code: 'HUAWEI_INSTALLATION_SCHEMA_INVALID',
      });
    } finally {
      await db.query(
        'ALTER TABLE huawei_push_installations ADD UNIQUE KEY uk_huawei_current_device(user_id,provider_app_id,current_device_key)',
      );
    }
    await db.query(
      'ALTER TABLE browser_push_subscriptions MODIFY active_installation_id char(36) GENERATED ALWAYS AS (IF(active=1,installation_id,NULL)) STORED',
    );
    try {
      await expect(assertHuaweiPushInstallationSchema(db)).rejects.toMatchObject({
        code: 'HUAWEI_INSTALLATION_SCHEMA_INVALID',
      });
    } finally {
      await db.query(
        'ALTER TABLE browser_push_subscriptions MODIFY active_installation_id char(36) GENERATED ALWAYS AS (IF(active IN(1,2),installation_id,NULL)) STORED',
      );
    }
    await assertHuaweiPushInstallationSchema(db);
  });
  it('previews cleanup without writes and rejects a changed plan before retiring anything', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const keep = await bindHuaweiSubscription('alice', 'k'.repeat(100), null, db);
    const old = await bindHuaweiSubscription('alice', 'o'.repeat(100), null, db);
    await activatePushSubscription('alice', keep.id, keep.generation, db);
    const plan = await previewLegacyHuaweiCleanup(db, 'alice', [keep.id]);
    expect(plan.candidates.map((row) => row.id)).toEqual([old.id]);
    const [[untouched]] = await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [old.id]);
    expect(untouched.active).toBe(2);
    await activatePushSubscription('alice', old.id, old.generation, db);
    await expect(applyLegacyHuaweiCleanup(db, 'alice', [keep.id], plan.fingerprint)).rejects.toMatchObject({
      code: 'HUAWEI_CLEANUP_STATE_CHANGED',
    });
    await expect(previewLegacyHuaweiCleanup(db, 'alice', [randomUUID()])).rejects.toMatchObject({
      code: 'HUAWEI_CLEANUP_KEEP_INVALID',
    });
    const [[stillActive]] = await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [old.id]);
    expect(stillActive.active).toBe(1);
  });
  it('cleans only selected legacy history, cancels jobs, and keeps tombstones across GC and feature rollback', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice'),('bob')");
    const keep = await managedBind('k', installation());
    const otherPhone = await managedBind('m', installation({ key: 'b'.repeat(64) }));
    const bob = await bindHuaweiSubscription('bob', 'b'.repeat(100), null, db);
    const old = await bindHuaweiSubscription('alice', 'o'.repeat(100), null, db);
    for (const [owner, binding] of [
      ['alice', keep],
      ['alice', otherPhone],
      ['bob', bob],
      ['alice', old],
    ])
      await activatePushSubscription(owner, binding.id, binding.generation, db);
    const browser = randomUUID();
    await db.query(
      "INSERT INTO browser_push_subscriptions (id,user_id,endpoint_hash,endpoint,p256dh,auth,generation,locale,active) VALUES (?,'alice',?,'https://fcm.googleapis.com/test','','',?,'zh-CN',1)",
      [browser, 'c'.repeat(64), randomUUID()],
    );
    await db.query(
      'INSERT INTO browser_push_jobs (notification_id,subscription_id,generation,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))',
      [randomUUID(), old.id, old.generation],
    );
    const plan = await previewLegacyHuaweiCleanup(db, 'alice', [keep.id]);
    expect(plan.candidates.map((row) => row.id)).toEqual([old.id]);
    expect(await applyLegacyHuaweiCleanup(db, 'alice', [keep.id], plan.fingerprint)).toEqual({
      retiredCount: 1,
      keptCount: 1,
    });
    vi.stubEnv('HUAWEI_PUSH_INSTALLATION_V2_ENABLED', 'false');
    await expect(bindHuaweiSubscription('alice', 'o'.repeat(100), null, db)).rejects.toMatchObject({
      code: 'PUSH_SUBSCRIPTION_INVALID',
    });
    await db.query('UPDATE browser_push_subscriptions SET enabled_at=DATE_SUB(NOW(),INTERVAL 8 DAY) WHERE id=?', [
      old.id,
    ]);
    await pruneInactivePushSubscriptions(db);
    const [[retired]] = await db.query(
      'SELECT active,endpoint,retired_reason FROM browser_push_subscriptions WHERE id=?',
      [old.id],
    );
    expect(retired).toEqual({ active: 0, endpoint: 'huawei:retired', retired_reason: 'legacy_cleanup' });
    const [preserved] = await db.query('SELECT id FROM browser_push_subscriptions WHERE active=1');
    expect(preserved.map((row) => row.id).sort()).toEqual([keep.id, otherPhone.id, bob.id, browser].sort());
    const [[job]] = await db.query('SELECT status FROM browser_push_jobs WHERE subscription_id=?', [old.id]);
    expect(job.status).toBe('cancelled');
  });
  it('automatically replaces token rotations and reinstalls at the limit while preserving another device', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const first = installation();
    const old = await managedBind('a', first);
    await activatePushSubscription('alice', old.id, old.generation, db);
    const other = await managedBind('b', installation({ key: 'b'.repeat(64) }));
    await activatePushSubscription('alice', other.id, other.generation, db);
    for (let i = 2; i < 20; i++) {
      const binding = await bindHuaweiSubscription('alice', `legacy_${i}_` + 'x'.repeat(64), null, db);
      await activatePushSubscription('alice', binding.id, binding.generation, db);
    }
    await db.query(
      'INSERT INTO browser_push_jobs (notification_id,subscription_id,generation,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))',
      [randomUUID(), old.id, old.generation],
    );
    const rotated = await managedBind('c', { ...first, revision: 2 });
    await activatePushSubscription('alice', rotated.id, rotated.generation, db);
    const fresh = installation();
    const reinstalled = await managedBind('d', fresh);
    await activatePushSubscription('alice', reinstalled.id, reinstalled.generation, db);
    const [[count]] = await db.query('SELECT COUNT(*) total FROM browser_push_subscriptions WHERE active IN(1,2)');
    expect(Number(count.total)).toBe(20);
    const [[preserved]] = await db.query('SELECT active,generation FROM browser_push_subscriptions WHERE id=?', [
      other.id,
    ]);
    expect(preserved).toEqual({ active: 1, generation: other.generation });
    expect(await activatePushSubscription('alice', old.id, old.generation, db)).toBe(false);
    await expect(managedBind('e', { ...first, revision: 3 })).rejects.toMatchObject({
      code: 'PUSH_INSTALLATION_RETIRED',
    });
    const [[job]] = await db.query('SELECT status FROM browser_push_jobs WHERE subscription_id=?', [old.id]);
    expect(job.status).toBe('cancelled');
  });
  it('reuses an unchanged provider token across reinstalls without losing the retired epoch', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const first = installation();
    const old = await managedBind('a', first);
    await activatePushSubscription('alice', old.id, old.generation, db);
    const fresh = installation();
    const next = await managedBind('a', fresh);
    expect(next.id).toBe(old.id);
    expect(next.generation).not.toBe(old.generation);
    await expect(managedBind('b', first)).rejects.toMatchObject({ code: 'PUSH_INSTALLATION_RETIRED' });
  });
  it('deduplicates concurrent responses, rejects stale revisions, and enforces database uniqueness', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const identity = installation();
    const [a, b] = await Promise.all([managedBind('a', identity), managedBind('a', identity)]);
    expect(a).toEqual(b);
    const next = await managedBind('b', { ...identity, revision: 2 });
    await expect(managedBind('a', identity)).rejects.toMatchObject({ code: 'PUSH_INSTALLATION_SUPERSEDED' });
    await expect(managedBind('c', { ...identity, revision: 2 })).rejects.toMatchObject({
      code: 'PUSH_INSTALLATION_SUPERSEDED',
    });
    await expect(
      db.query(
        "INSERT INTO browser_push_subscriptions (id,user_id,endpoint_hash,endpoint,p256dh,auth,generation,active,installation_id,provider_app_id) VALUES (?,'alice',?,'huawei:fixture','','',?,2,?,'123')",
        [randomUUID(), 'f'.repeat(64), randomUUID(), identity.id],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    expect(await activatePushSubscription('alice', next.id, next.generation, db)).toBe(true);
  });
  it('adopts exact legacy endpoints, gates legacy additions, and never revives provider-invalid endpoints', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice'),('bob')");
    const old = await bindHuaweiSubscription('alice', 'a'.repeat(100), null, db);
    await activatePushSubscription('alice', old.id, old.generation, db);
    const identity = installation();
    expect(await managedBind('a', identity)).toEqual(old);
    expect(await bindLegacyHuaweiInstallation('alice', 'a'.repeat(100), db)).toEqual(old);
    await expect(bindLegacyHuaweiInstallation('alice', 'b'.repeat(100), db)).rejects.toMatchObject({
      code: 'HUAWEI_PUSH_CLIENT_UPGRADE_REQUIRED',
    });
    await expect(managedBind('a', installation({ key: 'c'.repeat(64) }), 'bob')).rejects.toMatchObject({
      code: 'HUAWEI_PUSH_TOKEN_OWNER_MISMATCH',
    });
    await db.query('UPDATE browser_push_subscriptions SET active=3 WHERE id=?', [old.id]);
    await expect(managedBind('a', { ...identity, revision: 2 })).rejects.toMatchObject({
      code: 'PUSH_SUBSCRIPTION_INVALID',
    });
    const renewed = await managedBind('b', { ...identity, revision: 2 });
    expect(renewed.id).not.toBe(old.id);
  });
  it('rolls back an automatic reinstall when the replacement cannot be saved', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const first = installation();
    const old = await managedBind('a', first);
    await activatePushSubscription('alice', old.id, old.generation, db);
    const failing = {
      getConnection: async () => {
        const connection = await db.getConnection();
        return {
          beginTransaction: () => connection.beginTransaction(),
          commit: () => connection.commit(),
          rollback: () => connection.rollback(),
          release: () => connection.release(),
          query: (sql, args) =>
            sql.startsWith('INSERT INTO browser_push_subscriptions')
              ? Promise.reject(new Error('fixture failure'))
              : connection.query(sql, args),
        };
      },
    };
    await expect(managedBind('b', installation(), 'alice', failing)).rejects.toThrow('fixture failure');
    const [[row]] = await db.query('SELECT active,generation FROM browser_push_subscriptions WHERE id=?', [old.id]);
    expect(row).toEqual({ active: 1, generation: old.generation });
    expect(await managedBind('a', first)).toEqual(old);
  });
  it('replaces a rotated Huawei token at the device limit and cancels only the replaced generation', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const old = await bindHuaweiSubscription('alice', 'a'.repeat(100), null, db);
    await activatePushSubscription('alice', old.id, old.generation, db);
    for (let i = 1; i < 20; i++) {
      const device = await bindHuaweiSubscription('alice', `device_${i}_` + 'x'.repeat(64), null, db);
      await activatePushSubscription('alice', device.id, device.generation, db);
    }
    await db.query(
      'INSERT INTO browser_push_jobs (notification_id,subscription_id,generation,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))',
      [randomUUID(), old.id, old.generation],
    );
    await expect(bindHuaweiSubscription('alice', 'b'.repeat(100), null, db)).rejects.toMatchObject({
      code: 'PUSH_DEVICE_LIMIT',
    });
    const replacement = await bindHuaweiSubscription('alice', 'b'.repeat(100), old, db);
    expect(await activatePushSubscription('alice', replacement.id, replacement.generation, db)).toBe(true);
    const [[count]] = await db.query('SELECT COUNT(*) AS total FROM browser_push_subscriptions WHERE active IN(1,2)');
    expect(Number(count.total)).toBe(20);
    const [[previous]] = await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [old.id]);
    expect(previous.active).toBe(0);
    const [[job]] = await db.query('SELECT status FROM browser_push_jobs WHERE subscription_id=?', [old.id]);
    expect(job.status).toBe('cancelled');
    // A lost successful response is safe to replay using the previously persisted receipt.
    expect(await bindHuaweiSubscription('alice', 'b'.repeat(100), old, db)).toEqual(replacement);
  });
  it('rolls back old-token retirement when the replacement cannot be stored', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const old = await bindHuaweiSubscription('alice', 'a'.repeat(100), null, db);
    await activatePushSubscription('alice', old.id, old.generation, db);
    const failing = {
      getConnection: async () => {
        const c = await db.getConnection();
        return {
          beginTransaction: () => c.beginTransaction(),
          commit: () => c.commit(),
          rollback: () => c.rollback(),
          release: () => c.release(),
          query: (sql, params) => {
            if (sql.startsWith('INSERT INTO browser_push_subscriptions')) throw new Error('simulated write failure');
            return c.query(sql, params);
          },
        };
      },
    };
    await expect(bindHuaweiSubscription('alice', 'b'.repeat(100), old, failing)).rejects.toThrow(
      'simulated write failure',
    );
    const [[stored]] = await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [old.id]);
    expect(stored.active).toBe(1);
  });
  it('rejects another account or a stale generation as replacement authority', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice'),('bob')");
    const old = await bindHuaweiSubscription('alice', 'a'.repeat(100), null, db);
    await activatePushSubscription('alice', old.id, old.generation, db);
    for (const [owner, receipt] of [
      ['bob', old],
      ['alice', { ...old, generation: randomUUID() }],
    ]) {
      await expect(bindHuaweiSubscription(owner, 'b'.repeat(100), receipt, db)).rejects.toMatchObject({
        code: 'PUSH_BINDING_EXPIRED',
      });
    }
    const [[stored]] = await db.query('SELECT active FROM browser_push_subscriptions WHERE id=?', [old.id]);
    expect(stored.active).toBe(1);
  });
  it('keeps one active binding when a token refresh is submitted concurrently', async () => {
    await db.query("INSERT INTO user (id) VALUES ('alice')");
    const old = await bindHuaweiSubscription('alice', 'a'.repeat(100), null, db);
    await activatePushSubscription('alice', old.id, old.generation, db);
    const bindings = await Promise.all([
      bindHuaweiSubscription('alice', 'b'.repeat(100), old, db),
      bindHuaweiSubscription('alice', 'b'.repeat(100), old, db),
    ]);
    expect(bindings[0].id).toBe(bindings[1].id);
    const [[count]] = await db.query('SELECT COUNT(*) AS total FROM browser_push_subscriptions WHERE active IN(1,2)');
    expect(Number(count.total)).toBe(1);
  });
  it('reuses the actual queue with activation, WORK source checks, lease and account-generation invalidation', async () => {
    const env = {
      LIGHTNOTE_RUNTIME_ENV: 'production',
      HUAWEI_PUSH_ENABLED: 'true',
      HUAWEI_PUSH_APP_ID: '1',
      HUAWEI_PUSH_PROJECT_ID: '2',
      HUAWEI_PUSH_APP_SECRET: 'test',
      HUAWEI_PUSH_ORIGIN: 'https://test.invalid',
      HUAWEI_PUSH_APPROVED_CATEGORIES: 'WORK',
    };
    await db.query("INSERT INTO user (id) VALUES ('alice'), ('bob')");
    await db.query("INSERT INTO todo_items (id,user_id) VALUES ('t','alice')");
    await db.query("INSERT INTO todo_reminder_jobs VALUES ('j','t','alice','in_app','sent')");
    const token = 'a'.repeat(100);
    const binding = await bindHuaweiSubscription('alice', token, null, db);
    expect(await activatePushSubscription('bob', binding.id, binding.generation, db)).toBe(false);
    expect(await activatePushSubscription('alice', binding.id, binding.generation, db)).toBe(true);
    expect(await bindHuaweiSubscription('alice', token, null, db)).toEqual(binding);
    const n = await add({
      type: 'todo_reminder',
      source_type: 'todo_reminder_job',
      source_id: 'j',
      browser_push_pending: 1,
    });
    await add({ type: 'system', browser_push_pending: 1 });
    expect(await expandPushOutbox(db, env)).toBe(2);
    const [[count]] = await db.query('SELECT COUNT(*) AS total FROM browser_push_jobs');
    expect(count.total).toBe(2);
    const send = vi.fn(async (_subscription, payload) => {
      const attemptId = payload.huawei.biTag.slice(3);
      const [[attempt]] = await db.query(
        'SELECT send_status,provider_request_id FROM huawei_push_delivery_attempts WHERE id=?',
        [attemptId],
      );
      expect(attempt).toMatchObject({ send_status: 'sending', provider_request_id: null });
      return { requestId: 'provider-' + payload.notificationId };
    });
    expect((await processNextPush({ db, env, send })).status).toBe('accepted');
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1].notificationId).toBe(n);
    expect((await processNextPush({ db, env, send })).status).toBe('accepted');
    expect(send.mock.calls[1][1].huawei.category).toBe('MARKETING');
    const [attempts] = await db.query(
      'SELECT category,send_status,provider_request_id,delivered_at FROM huawei_push_delivery_attempts ORDER BY job_id',
    );
    expect(attempts).toEqual([
      { category: 'WORK', send_status: 'accepted', provider_request_id: 'provider-' + n, delivered_at: null },
      {
        category: 'MARKETING',
        send_status: 'accepted',
        provider_request_id: 'provider-' + send.mock.calls[1][1].notificationId,
        delivered_at: null,
      },
    ]);
    expect(await processNextPush({ db, env, send })).toBeNull();
    await add({ type: 'todo_reminder', source_type: 'todo_reminder_job', source_id: 'j', browser_push_pending: 1 });
    await expandPushOutbox(db, env);
    const switched = await bindHuaweiSubscription('bob', token, null, db);
    expect(switched.generation).not.toBe(binding.generation);
    await unbindPushSubscription('alice', binding.id, binding.generation, db);
    expect(await activatePushSubscription('bob', switched.id, switched.generation, db)).toBe(true);
    const [[old]] = await db.query(
      "SELECT COUNT(*) AS total FROM browser_push_jobs WHERE status IN ('pending','sending')",
    );
    expect(old.total).toBe(0);
  });
  it('suppresses all queued types only for this active Huawei generation, preserving badge IDs', async () => {
    for (const [key, value] of Object.entries({
      LIGHTNOTE_RUNTIME_ENV: 'production',
      HUAWEI_PUSH_ENABLED: 'true',
      HUAWEI_PUSH_APP_ID: '1',
      HUAWEI_PUSH_PROJECT_ID: '2',
      HUAWEI_PUSH_APP_SECRET: 'test',
      HUAWEI_PUSH_ORIGIN: 'https://test.invalid',
    }))
      vi.stubEnv(key, value);
    await db.query(
      "INSERT INTO browser_push_subscriptions (id,user_id,endpoint_hash,endpoint,p256dh,auth,generation,active) VALUES ('s','alice','hash','huawei:test','','','g',1)",
    );
    const { since } = await readNativeNotifications(db, 'alice');
    const todo = await add({
      type: 'todo_reminder',
      source_type: 'todo_reminder_job',
      source_id: 'j',
      browser_push_pending: 1,
    });
    const other = await add({ browser_push_pending: 1 });
    const localOnly = await add();
    const binding = { id: 's', generation: 'g' };
    const page = await readNativeNotifications(db, 'alice', { since, huaweiBinding: binding });
    expect(page.items.find((row) => row.id === todo)?.remote).toBe(true);
    expect(page.items.find((row) => row.id === other)?.remote).toBe(true);
    expect(page.items.find((row) => row.id === localOnly)?.remote).toBeUndefined();
    const stale = await readNativeNotifications(db, 'alice', {
      since,
      huaweiBinding: { ...binding, generation: 'old' },
    });
    expect(stale.items.some((row) => row.remote)).toBe(false);
    await db.query("UPDATE browser_push_subscriptions SET user_id='bob' WHERE id='s'");
    const switched = await readNativeNotifications(db, 'alice', { since, huaweiBinding: binding });
    expect(switched.items.some((row) => row.remote)).toBe(false);
    vi.unstubAllEnvs();
  });
  it('checks current community result visibility before sending rather than trusting the queued notification', async () => {
    const schemaSpy = vi.spyOn(feedSchema, 'communityFeedSchemaReady').mockResolvedValue(true);
    const tables = ['community_posts', 'community_comments', 'community_moderation_actions'];
    try {
      await db.query(
        'CREATE TABLE community_posts(id int, public_id varchar(64),author_id char(36),status varchar(32),pending_revision_id int)',
      );
      await db.query(
        'CREATE TABLE community_comments(id int, public_id varchar(64),post_id int,author_id char(36),status varchar(32))',
      );
      await db.query('CREATE TABLE community_moderation_actions(public_id varchar(64),subject_id char(36))');
      await db.query("INSERT INTO user(id) VALUES('alice')");
      await db.query("INSERT INTO community_moderation_actions VALUES('result-1','alice')");
      const binding = await bindHuaweiSubscription('alice', 'b'.repeat(100), null, db);
      await activatePushSubscription('alice', binding.id, binding.generation, db);
      const env = {
        LIGHTNOTE_RUNTIME_ENV: 'production',
        HUAWEI_PUSH_ENABLED: 'true',
        HUAWEI_PUSH_APP_ID: '1',
        HUAWEI_PUSH_PROJECT_ID: '2',
        HUAWEI_PUSH_APP_SECRET: 'test',
        HUAWEI_PUSH_ORIGIN: 'https://test.invalid',
      };
      const send = vi.fn();
      const value = {
        type: 'community_feed',
        source_type: 'community_feed_result',
        source_id: 'result-1',
        meta: '{"kind":"result"}',
        browser_push_pending: 1,
      };
      await add(value);
      await expandPushOutbox(db, env);
      expect((await processNextPush({ db, env, send })).status).toBe('accepted');
      expect(send).toHaveBeenCalledOnce();
      await add(value);
      await expandPushOutbox(db, env);
      await db.query('DELETE FROM community_moderation_actions');
      expect((await processNextPush({ db, env, send })).status).toBe('cancelled');
      expect(send).toHaveBeenCalledOnce();
    } finally {
      schemaSpy.mockRestore();
      for (const table of tables) await db.query(`DROP TABLE IF EXISTS ${table}`);
    }
  });
  it('first activation returns no historical rows; later sweeps are owner-scoped', async () => {
    await add();
    const baseline = await readNativeNotifications(db, 'alice');
    expect(baseline.items).toEqual([]);
    const own = await add();
    await add({ user_id: 'bob' });
    const page = await readNativeNotifications(db, 'alice', { since: baseline.since });
    expect(page.items.map((x) => x.id)).toEqual([own]);
    expect(page.owner).toBe('alice');
  });
  it('邮箱检查提醒只留在站内，不进入原生前台通知同步', async () => {
    const { since } = await readNativeNotifications(db, 'alice');
    await add({ type: 'email_health' });
    await add({ type: 'signup_source_survey' });
    const regular = await add({ type: 'system' });
    expect((await readNativeNotifications(db, 'alice', { since })).items.map((item) => item.id)).toEqual([regular]);
  });
  it('shows current todo details only when the reminder still belongs to the account and is pending', async () => {
    const { since } = await readNativeNotifications(db, 'alice');
    const ownTodoId = randomUUID();
    const otherTodoId = randomUUID();
    await db.query('INSERT INTO todo_items (id,user_id,title,description) VALUES (?,?,?,?),(?,?,?,?)', [
      ownTodoId,
      'alice',
      '整理资料',
      '检查本周资料\n并发送总结',
      otherTodoId,
      'bob',
      '他人的待办',
      '私密说明',
    ]);
    const own = await add({ type: 'todo_reminder', meta: JSON.stringify({ todoId: ownTodoId }) });
    const other = await add({ type: 'todo_reminder', meta: JSON.stringify({ todoId: otherTodoId }) });
    const page = await readNativeNotifications(db, 'alice', { since });
    expect(page.items.find((row) => row.id === own)).toMatchObject({
      todo: true,
      title: '待办：整理资料',
      body: '检查本周资料 并发送总结',
    });
    expect(page.items.find((row) => row.id === other)).toEqual(expect.objectContaining({ id: other }));
    expect(page.items.find((row) => row.id === other)).not.toHaveProperty('body');
    await db.query("UPDATE todo_items SET status = 'completed' WHERE id = ?", [ownTodoId]);
    const afterCompletion = await readNativeNotifications(db, 'alice', { since });
    expect(afterCompletion.items.find((row) => row.id === own)).not.toHaveProperty('body');
  });
  it('filters deleted/recalled/non-targeted chat and unavailable community content', async () => {
    const { since } = await readNativeNotifications(db, 'alice');
    await add({ del_flag: 1 });
    await add({ recalled: 1 });
    await add({ type: 'community_chat', meta: '{"kind":"message"}' });
    await add({ source_type: 'community_chat_message', meta: '{"kind":"message"}' });
    await add({ type: 'community_feed' });
    const reply = await add({ type: 'community_chat', meta: '{"kind":"reply"}' });
    const mention = await add({ type: 'community_chat', meta: '{"kind":"mention"}' });
    expect((await readNativeNotifications(db, 'alice', { since })).items.map((x) => x.id)).toEqual([reply, mention]);
  });
  it('keyset pages share a fixed upper bound; next sweep catches late commits and new arrivals', async () => {
    const { since } = await readNativeNotifications(db, 'alice');
    const held = await db.getConnection();
    await held.beginTransaction();
    try {
      const late = await add({}, held);
      const ids = [];
      for (let i = 0; i < 105; i++) ids.push(await add());
      const first = await readNativeNotifications(db, 'alice', { since });
      expect(first.items).toHaveLength(100);
      const newer = await add();
      await held.commit();
      const second = await readNativeNotifications(db, 'alice', { since, cursor: first.cursor });
      expect(second.items).toHaveLength(5);
      expect(second.cursor).toBeNull();
      expect([...first.items, ...second.items].map((x) => x.id)).toEqual(ids);
      const sweep = await readNativeNotifications(db, 'alice', { since });
      expect(sweep.items[0].id).toBe(late);
      const rest = await readNativeNotifications(db, 'alice', { since, cursor: sweep.cursor });
      expect(rest.items.some((x) => x.id === newer)).toBe(true);
    } finally {
      await held.rollback();
      held.release();
    }
  });
  it('limits catchup to 24 hours and does not expose notification text', async () => {
    const id = await add();
    await db.query('UPDATE notification SET create_time=DATE_SUB(NOW(),INTERVAL 25 HOUR) WHERE id=?', [id]);
    expect((await readNativeNotifications(db, 'alice', { since: '2000-01-01 00:00:00.000000' })).items).toEqual([]);
    await add();
    const page = await readNativeNotifications(db, 'alice', { since: '2000-01-01 00:00:00.000000' });
    expect(Object.keys(page.items[0]).sort()).toEqual(['id', 'time']);
  });
});
