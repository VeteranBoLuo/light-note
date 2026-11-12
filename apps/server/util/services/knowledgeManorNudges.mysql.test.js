import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../notificationRealtimeEvents.js', () => ({ queueNotificationChange: vi.fn() }));
import { createManor, executeManorCommand, manorModel as M } from '@lightnote/shared/manor';
import { createKnowledgeManorService } from './knowledgeManorService.js';
import { createManorNudgeService } from './knowledgeManorNudges.js';
import { manorNudgeCalendar, MANOR_RECENT_MS } from './knowledgeManorNudgePolicy.js';
import { migrateKnowledgeManorSchema } from './knowledgeManorSchema.js';
import { migrateKnowledgeManorAdminSchema } from './knowledgeManorAdminSchema.js';
import { ensureBrowserPushTables } from '../browserPushSchema.js';
import { expandPushOutbox, processNextPush } from '../browserPushService.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `manor_nudges_${randomUUID().replaceAll('-', '')}`;
const env = { KNOWLEDGE_MANOR_ENABLED: 'true', KNOWLEDGE_MANOR_AUDIENCE: 'all' };
describe.skipIf(!socketPath)('庄园提醒的真实来源去重与投递（隔离 MySQL）', () => {
  let admin,
    db,
    created = false,
    clock,
    timezone,
    facts,
    service;
  const loadCalendar = async (userId, now) => {
    const [[prefs]] = await db.query('SELECT timezone FROM user_growth_preferences WHERE user_id=?', [userId]);
    return manorNudgeCalendar(now, prefs);
  };
  const makeService = () => {
    const attention = createKnowledgeManorService({
      db,
      now: () => clock,
      context: async (_conn, userId, now) => ({
        now,
        points: 60,
        calendar: await loadCalendar(userId, now),
        dailyDone: facts[userId] || [true, false, false],
      }),
    }).attention;
    return createManorNudgeService({ db, now: () => clock, env, attention, logger: { warn: vi.fn(), log: vi.fn() } });
  };
  const seed = async (id = 'owner', options = {}) => {
    const updatedAtMs = options.updatedAtMs ?? clock.getTime() - 24 * 3600000;
    const adoptedAt = new Date(clock.getTime() - 24 * 3600000),
      calendar = manorNudgeCalendar(adoptedAt, { timezone });
    let state = createManor({ now: adoptedAt, calendar, points: 60 });
    if (options.adopted !== false)
      state = executeManorCommand(
        state,
        { action: 'adopt', args: [] },
        { now: adoptedAt, calendar, points: 60, dailyDone: [false, false, false], random: () => 0 },
      ).state;
    if (state.adopted) {
      M.plant(state, 0, 'radish');
      M.water(state, [0]);
      state.plots[0].next = state.now - 1;
    }
    delete state.wallet;
    await db.query('INSERT INTO user (id,role,del_flag,preferences) VALUES (?,?,?,?)', [
      id,
      options.role || 'user',
      options.del_flag || '0',
      JSON.stringify({ notifyManor: true, ...options.preferences }),
    ]);
    await db.query('INSERT INTO user_growth_preferences (user_id,timezone) VALUES (?,?)', [id, timezone]);
    await db.query(
      'INSERT INTO knowledge_manors (user_id,revision,state_json,updated_at) VALUES (?,1,?,FROM_UNIXTIME(?))',
      [id, JSON.stringify(state), updatedAtMs / 1000],
    );
    facts[id] = options.dailyDone || [true, false, false];
  };
  const notices = async () => (await db.query('SELECT * FROM notification ORDER BY id'))[0];
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Disposable socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 8 });
    // Preserve historical user charset and varchar status; no cross-domain join converts an indexed owner.
    await db.query(
      'CREATE TABLE user (id CHAR(36) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY,role VARCHAR(32),del_flag VARCHAR(1),preferences JSON) ENGINE=InnoDB',
    );
    await db.query(
      'CREATE TABLE user_growth_preferences (user_id CHAR(36) PRIMARY KEY,timezone VARCHAR(64),utc_offset_minutes INT DEFAULT 480) ENGINE=InnoDB',
    );
    await migrateKnowledgeManorSchema(db);
    await migrateKnowledgeManorAdminSchema(db);
    await db.query(`CREATE TABLE notification (
      id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,type VARCHAR(32) NOT NULL,title VARCHAR(255) NOT NULL,content TEXT,link VARCHAR(255),meta JSON,
      batch_id CHAR(36),source_type VARCHAR(32),source_id VARCHAR(64),is_read TINYINT DEFAULT 0,del_flag TINYINT DEFAULT 0,recalled TINYINT DEFAULT 0,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,browser_push_pending TINYINT DEFAULT 0,browser_push_created_at DATETIME(6),
      UNIQUE KEY uk_notification_source(user_id,source_type,source_id),KEY idx_notification_push(browser_push_pending,browser_push_created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await ensureBrowserPushTables(db);
    // Shared notification visibility references chat sources even for unrelated types.
    // Empty source tables keep that real SQL intact without seeding chat business data.
    for (const statement of [
      'CREATE TABLE community_chat_messages (id BIGINT PRIMARY KEY,room_id CHAR(36),user_id CHAR(36),public_id CHAR(36),status VARCHAR(16))',
      'CREATE TABLE community_chat_rooms (id CHAR(36) PRIMARY KEY,status VARCHAR(16))',
      'CREATE TABLE community_chat_members (user_id CHAR(36) PRIMARY KEY,status VARCHAR(16))',
      'CREATE TABLE community_chat_blocks (user_id CHAR(36),blocked_user_id CHAR(36))',
      'CREATE TABLE community_chat_message_deletions (message_id BIGINT,user_id CHAR(36))',
      'CREATE TABLE community_chat_user_settings (user_id CHAR(36) PRIMARY KEY,root_all_messages_enabled TINYINT,global_notification_enabled TINYINT)',
    ])
      await db.query(statement);
  });
  afterAll(async () => {
    await db?.end();
    try {
      if (created) await admin.query(`DROP DATABASE ${schema}`);
    } finally {
      await admin?.end();
    }
  });
  beforeEach(async () => {
    for (const table of [
      'browser_push_jobs',
      'browser_push_subscriptions',
      'notification',
      'knowledge_manor_operations',
      'knowledge_manors',
      'user_growth_preferences',
      'user',
    ])
      await db.query(`DELETE FROM ${table}`);
    await db.query("UPDATE knowledge_manor_runtime SET mode='open' WHERE id=1");
    const [[time]] = await db.query('SELECT UNIX_TIMESTAMP(NOW())*1000 AS currentMs');
    clock = new Date(Number(time.currentMs));
    let offset = 21 - clock.getUTCHours();
    if (offset > 11) offset -= 24;
    timezone = offset === 0 ? 'UTC' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
    facts = {};
    service = makeService();
  });
  it('多个生成实例并发只写一条，且读取不修改存档或操作时间', async () => {
    await seed();
    const [[before]] = await db.query(
      'SELECT revision,state_json,UNIX_TIMESTAMP(updated_at) AS updated FROM knowledge_manors WHERE user_id=?',
      ['owner'],
    );
    const results = await Promise.all(Array.from({ length: 4 }, () => makeService().runBatch()));
    expect(results.reduce((n, r) => n + r.sent, 0)).toBe(1);
    const saved = await notices();
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe('manor_water_expiring');
    expect(saved[0].source_id).toBe(`owner:${manorNudgeCalendar(clock, { timezone }).dayKey}`);
    const [[after]] = await db.query(
      'SELECT revision,state_json,UNIX_TIMESTAMP(updated_at) AS updated FROM knowledge_manors WHERE user_id=?',
      ['owner'],
    );
    expect(after).toEqual(before);
  });
  it('未主动开启的旧账号默认不生成，明确开启后才生成', async () => {
    await seed('default-off', { preferences: { notifyManor: undefined } });
    expect((await service.runBatch()).sent).toBe(0);
    expect(await notices()).toHaveLength(0);
    await db.query('UPDATE user SET preferences=? WHERE id=?', [JSON.stringify({ notifyManor: true }), 'default-off']);
    expect((await service.runBatch()).sent).toBe(1);
    expect(await notices()).toHaveLength(1);
  });
  it('软删除、重跑、两类切换后来源键仍阻止第二条', async () => {
    await seed();
    await service.runBatch();
    await db.query('UPDATE notification SET del_flag=1');
    await db.query('UPDATE user SET preferences=? WHERE id=?', [
      JSON.stringify({ notifyManor: true, notifyManorWater: false }),
      'owner',
    ]);
    expect((await makeService().runBatch()).sent).toBe(0);
    expect(await notices()).toHaveLength(1);
  });
  it('真实范围查询和游标保留 14 天边界，排除未来、未领见面礼与停用账号', async () => {
    await seed('old-boundary', { updatedAtMs: clock.getTime() - MANOR_RECENT_MS });
    await seed('fresh');
    await seed('too-old', { updatedAtMs: clock.getTime() - MANOR_RECENT_MS - 1000 });
    await seed('future', { updatedAtMs: clock.getTime() + 1000 });
    await seed('not-adopted', { adopted: false });
    await seed('disabled', { del_flag: '1' });
    let after = null,
      sent = 0;
    do {
      const result = await service.runBatch({ after, limit: 1 });
      after = result.nextCursor;
      sent += result.sent;
    } while (after);
    expect(sent).toBe(2);
    expect((await notices()).map((row) => row.user_id).sort()).toEqual(['fresh', 'old-boundary']);
  });
  it('真实 outbox 裁剪时效、按唯一设备展开；领取后取消，取消任务不复活', async () => {
    await seed();
    await service.runBatch();
    await db.query('UPDATE notification SET browser_push_pending=1');
    await db.query(
      `INSERT INTO browser_push_subscriptions (id,user_id,endpoint_hash,endpoint,p256dh,auth,generation,active,enabled_at)
      VALUES ('subscription','owner',?,'https://fcm.googleapis.com/fcm/send/fixture','key','auth','generation',1,DATE_SUB(NOW(6),INTERVAL 1 DAY))`,
      ['1'.repeat(64)],
    );
    const pushEnv = {
      ...env,
      LIGHTNOTE_RUNTIME_ENV: 'production',
      BROWSER_PUSH_ENABLED: 'true',
      BROWSER_PUSH_ORIGIN: 'https://fixture.test',
      BROWSER_PUSH_VAPID_PUBLIC_KEY: 'fixture-public',
      BROWSER_PUSH_VAPID_PRIVATE_KEY: 'fixture-private',
      BROWSER_PUSH_VAPID_SUBJECT: 'mailto:fixture@example.com',
    };
    await expandPushOutbox(db, pushEnv, clock);
    await expandPushOutbox(db, pushEnv, clock);
    const [jobs] = await db.query('SELECT *,UNIX_TIMESTAMP(expires_at)*1000 AS expiresMs FROM browser_push_jobs');
    expect(jobs).toHaveLength(1);
    const raw = (await notices())[0],
      meta = typeof raw.meta === 'string' ? JSON.parse(raw.meta) : raw.meta;
    expect(Number(jobs[0].expiresMs)).toBe(new Date(meta.manor.expiresAt).getTime());
    facts.owner = [false, false, false];
    const send = vi.fn();
    const options = { db, env: pushEnv, send, now: () => clock, manorNudges: service };
    expect((await processNextPush(options)).status).toBe('cancelled');
    expect(send).not.toHaveBeenCalled();
    facts.owner = [true, false, false];
    expect(await processNextPush(options)).toBeNull();
    expect(await notices()).toHaveLength(1);
  });
});
