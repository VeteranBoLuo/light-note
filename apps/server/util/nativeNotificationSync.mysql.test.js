import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { COMMUNITY_CHAT_TABLE_SQL } from './communityChatSchema.js';
import * as feedSchema from './communityFeed/schema.js';
import { browserPushTableSql } from './browserPushSchema.js';
import { ensureHuaweiPushDeliverySchema } from './huaweiPushDeliverySchema.js';
import {
  bindHuaweiSubscription,
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
      const [[attempt]] = await db.query('SELECT send_status,provider_request_id FROM huawei_push_delivery_attempts WHERE id=?', [attemptId]);
      expect(attempt).toMatchObject({ send_status: 'sending', provider_request_id: null });
      return { requestId: 'provider-' + payload.notificationId };
    });
    expect((await processNextPush({ db, env, send })).status).toBe('accepted');
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1].notificationId).toBe(n);
    expect((await processNextPush({ db, env, send })).status).toBe('accepted');
    expect(send.mock.calls[1][1].huawei.category).toBe('MARKETING');
    const [attempts] = await db.query('SELECT category,send_status,provider_request_id,delivered_at FROM huawei_push_delivery_attempts ORDER BY job_id');
    expect(attempts).toEqual([
      { category: 'WORK', send_status: 'accepted', provider_request_id: 'provider-' + n, delivered_at: null },
      { category: 'MARKETING', send_status: 'accepted', provider_request_id: 'provider-' + send.mock.calls[1][1].notificationId, delivered_at: null },
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
