import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { COMMUNITY_CHAT_TABLE_SQL } from '../communityChatSchema.js';
import { browserPushTableSql } from '../browserPushSchema.js';
import {
  deliverCommunityChatMessageNotifications,
  getCommunityChatNotificationSettings,
  updateCommunityChatNotificationSettings,
} from './communityChatNotificationService.js';
import {
  COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL,
  COMMUNITY_CHAT_DELIVERY_NOTIFICATION_SQL,
} from '../notificationVisibility.js';
import {
  bindPushSubscription,
  bindHuaweiSubscription,
  activatePushSubscription,
  expandPushOutbox,
  processNextPush,
} from '../browserPushService.js';
import { readCommunityChatPushPresentations } from '../communityChatPushPresentation.js';
import { readNativeNotifications } from '../nativeNotificationSync.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = 'root_chat_' + randomUUID().replaceAll('-', '');
const env = {
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_CHAT_MESSAGING_ENABLED: 'true',
  LIGHTNOTE_RUNTIME_ENV: 'production',
  HUAWEI_PUSH_ENABLED: 'true',
  HUAWEI_PUSH_APP_ID: '1',
  HUAWEI_PUSH_PROJECT_ID: '2',
  HUAWEI_PUSH_APP_SECRET: 'fixture',
  HUAWEI_PUSH_ORIGIN: 'https://test.invalid',
  HUAWEI_PUSH_APPROVED_CATEGORIES: 'SUBSCRIPTION',
};
const root = { id: 'root', role: 'root' };
let db, admin, room;
async function migrate() {
  const sql = await readFile(new URL('../../migrations/20261012_root_chat_subscription.sql', import.meta.url), 'utf8');
  const conn = await db.getConnection();
  try {
    for (const statement of sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await conn.query(statement);
  } finally {
    conn.release();
  }
}
async function message({ sender = 'alice', mentions = [], reply, content = '测试新消息', kind = 'text' } = {}) {
  const id = randomUUID();
  const [row] = await db.query(
    'INSERT INTO community_chat_messages(public_id,room_id,user_id,client_request_id,content,reply_to_id,message_kind) VALUES (?,?,?,?,?,?,?)',
    [id, room, sender, randomUUID(), content, reply || null, kind],
  );
  for (const recipient of mentions)
    await db.query('INSERT INTO community_chat_message_mentions(message_id,mentioned_user_id) VALUES (?,?)', [
      row.insertId,
      recipient,
    ]);
  return { publicId: id, id: row.insertId };
}
const deliver = (msg) => deliverCommunityChatMessageNotifications({ messagePublicId: msg.publicId, db, env });
const settings = (rootAllMessages, enabled = true) =>
  updateCommunityChatNotificationSettings({ user: root, rootAllMessages, enabled, level: 'official', db });
const rows = async (where = COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL) =>
  (await db.query(`SELECT * FROM notification WHERE user_id = 'root' AND ${where}`))[0];
describe.skipIf(!socketPath)('root chat subscription real SQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (!Number(runtime.isolated)) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = mysql.createPool({ socketPath, user: 'root', database: schema });
    await db.query(
      "CREATE TABLE user (id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY, alias varchar(80), role varchar(20) DEFAULT 'user', del_flag tinyint DEFAULT 0, preferences json)",
    );
    for (const sql of COMMUNITY_CHAT_TABLE_SQL) await db.query(sql);
    for (const sql of browserPushTableSql) await db.query(sql);
    await db.query(`CREATE TABLE notification (id char(36) PRIMARY KEY, user_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
      type varchar(32), title varchar(255), content text, link varchar(255), meta json, source_type varchar(40), source_id varchar(64),
      is_read tinyint DEFAULT 0, read_time datetime, del_flag tinyint DEFAULT 0, recalled tinyint DEFAULT 0,
      create_time datetime DEFAULT CURRENT_TIMESTAMP, browser_push_created_at datetime(6), browser_push_pending tinyint DEFAULT 0,
      UNIQUE KEY uk_source(user_id,source_type,source_id))`);
    await db.query("INSERT INTO community_chat_rooms(slug,name_zh,name_en) VALUES ('general','客厅','General')");
    [[{ id: room }]] = await db.query('SELECT id FROM community_chat_rooms LIMIT 1');
  });
  beforeEach(async () => {
    for (const table of [
      'notification',
      'browser_push_jobs',
      'browser_push_subscriptions',
      'community_chat_user_settings',
      'community_chat_message_mentions',
      'community_chat_message_deletions',
      'community_chat_blocks',
      'community_chat_members',
      'community_chat_messages',
      'community_chat_user_identities',
      'user',
    ])
      await db.query(`DELETE FROM ${table}`);
    await db.query(
      "INSERT INTO user(id,alias,role) VALUES ('root','管理员','root'),('alice','发送者','user'),('bob','普通用户','user')",
    );
    for (const uid of ['alice', 'bob'])
      await db.query('INSERT INTO community_chat_user_identities(user_id,public_id,community_id) VALUES (?,?,?)', [
        uid,
        randomUUID(),
        uid,
      ]);
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE ${schema}`);
      await admin.end();
    }
  });
  it('migrates twice without resetting a saved opt-out; rejects non-root writes and preserves old-client saves', async () => {
    await db.query('ALTER TABLE community_chat_user_settings DROP COLUMN root_all_messages_enabled');
    await migrate();
    expect((await getCommunityChatNotificationSettings({ user: root, db })).rootAllMessages).toBe(true);
    await settings(false);
    await migrate();
    expect((await settings(undefined)).rootAllMessages).toBe(false);
    await expect(
      updateCommunityChatNotificationSettings({
        user: { id: 'alice', role: 'user' },
        enabled: true,
        level: 'all',
        rootAllMessages: true,
        db,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE user SET role='user' WHERE id='root'");
    await expect(settings(true)).rejects.toMatchObject({ status: 403 });
  });
  it('defaults on without an identity, overrides the badge level, and deduplicates replies and mentions', async () => {
    await settings(true);
    const first = await message();
    expect((await deliver(first)).delivered).toBe(1);
    await deliver(first);
    expect(await rows()).toHaveLength(1);
    expect(JSON.parse(JSON.stringify((await rows())[0].meta)).kind).toBe('subscription');
    const own = await message({ sender: 'root' });
    expect((await deliver(own)).delivered).toBe(0);
    const targeted = await message({ reply: own.id, mentions: ['bob', 'root'] });
    await deliver(targeted);
    expect((await rows()).filter((n) => n.source_id === targeted.publicId)).toHaveLength(1);
    expect((await rows()).find((n) => n.source_id === targeted.publicId).meta.kind).toBe('reply');
    const mention = await message({ mentions: ['bob', 'root'] });
    await deliver(mention);
    expect((await rows()).find((n) => n.source_id === mention.publicId).meta.kind).toBe('mention');
    const [[ordinary]] = await db.query("SELECT COUNT(*) total FROM notification WHERE user_id='bob'");
    expect(ordinary.total).toBe(2);
  });
  it('cancels unsent alerts permanently while retaining inbox history and keeping new messages off', async () => {
    const binding = await bindHuaweiSubscription('root', 'a'.repeat(100), null, db);
    await activatePushSubscription('root', binding.id, binding.generation, db);
    await deliver(await message());
    await expandPushOutbox(db, env);
    await settings(false);
    expect(await rows()).toHaveLength(1);
    expect(await rows(COMMUNITY_CHAT_DELIVERY_NOTIFICATION_SQL)).toHaveLength(0);
    const [[job]] = await db.query('SELECT status FROM browser_push_jobs LIMIT 1');
    expect(job.status).toBe('cancelled');
    expect((await deliver(await message())).delivered).toBe(0);
    await settings(true);
    expect(await rows(COMMUNITY_CHAT_DELIVERY_NOTIFICATION_SQL)).toHaveLength(0);
    expect(await rows()).toHaveLength(1);
    await deliver(await message());
    expect(await rows(COMMUNITY_CHAT_DELIVERY_NOTIFICATION_SQL)).toHaveLength(1);
  });
  it('applies source visibility to list/count/read queries and never exposes stale chat content', async () => {
    const msg = await message();
    await deliver(msg);
    const n = (await rows())[0];
    const preview = () => readCommunityChatPushPresentations(db, 'root', [n], env);
    expect((await preview()).get(n.id)).toMatchObject({
      title: '发送者发来新消息',
      body: '测试新消息',
      visibility: 'SECRET',
    });
    await db.query(
      "UPDATE notification SET is_read=1 WHERE user_id='root' AND " + COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL,
    );
    const scenarios = [
      ["UPDATE community_chat_messages SET status='recalled'", "UPDATE community_chat_messages SET status='active'"],
      [
        "INSERT INTO community_chat_blocks(id,user_id,blocked_user_id) VALUES (UUID(),'root','alice')",
        'DELETE FROM community_chat_blocks',
      ],
      [
        `INSERT INTO community_chat_message_deletions(message_id,user_id) VALUES (${msg.id},'root')`,
        'DELETE FROM community_chat_message_deletions',
      ],
      ["UPDATE user SET role='user' WHERE id='root'", "UPDATE user SET role='root' WHERE id='root'"],
      [
        "INSERT INTO community_chat_members(user_id,status) VALUES ('root','banned')",
        'DELETE FROM community_chat_members',
      ],
    ];
    for (const [deny, restore] of scenarios) {
      await db.query(deny);
      expect(await rows()).toHaveLength(0);
      expect((await preview()).size).toBe(0);
      await db.query(restore);
    }
  });
  it('delivers browser and native subscription previews and suppresses native replay after opt-out', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    try {
      const { since } = await readNativeNotifications(db, 'root');
      const browserEnv = {
        ...env,
        BROWSER_PUSH_ENABLED: 'true',
        BROWSER_PUSH_ORIGIN: 'https://test.invalid',
        BROWSER_PUSH_VAPID_PUBLIC_KEY: 'test',
        BROWSER_PUSH_VAPID_PRIVATE_KEY: 'test',
        BROWSER_PUSH_VAPID_SUBJECT: 'mailto:test@example.com',
      };
      const binding = await bindPushSubscription(
        'root',
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/root-test',
          keys: {
            p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url'),
            auth: Buffer.alloc(16, 1).toString('base64url'),
          },
        },
        'zh-CN',
        db,
      );
      await activatePushSubscription('root', binding.id, binding.generation, db);
      await deliver(await message({ content: '', kind: 'sticker' }));
      const native = await readNativeNotifications(db, 'root', { since });
      expect(native.items).toHaveLength(1);
      expect(native.items[0]).toMatchObject({ chat: true, body: '[表情]', visibility: 'SECRET' });
      await expandPushOutbox(db, browserEnv);
      const send = vi.fn();
      expect((await processNextPush({ db, env: browserEnv, send })).status).toBe('accepted');
      expect(send.mock.calls[0][1]).toMatchObject({ title: '发送者发来新消息', body: '[表情]' });
      await settings(false);
      await settings(true);
      expect((await readNativeNotifications(db, 'root', { since })).items).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('uses SUBSCRIPTION and current content through the actual worker, and observes master switches', async () => {
    const binding = await bindHuaweiSubscription('root', 'b'.repeat(100), null, db);
    await activatePushSubscription('root', binding.id, binding.generation, db);
    await deliver(await message({ kind: 'poll', content: '要参加吗？' }));
    await expandPushOutbox(db, env);
    const send = vi.fn();
    expect((await processNextPush({ db, env, send })).status).toBe('accepted');
    expect(send.mock.calls[0][1].huawei).toMatchObject({
      category: 'SUBSCRIPTION',
      title: '发送者发来新消息',
      body: '[投票] 要参加吗？',
      visibility: 'SECRET',
    });
    await db.query("UPDATE user SET preferences=JSON_OBJECT('notificationsInApp',false) WHERE id='root'");
    expect((await deliver(await message())).delivered).toBe(0);
    await db.query("UPDATE user SET preferences=NULL WHERE id='root'");
    await settings(true, false);
    expect((await deliver(await message())).delivered).toBe(0);
  });
});
