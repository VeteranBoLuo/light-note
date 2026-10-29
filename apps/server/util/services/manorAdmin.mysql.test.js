import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { migrateKnowledgeManorSchema } from './knowledgeManorSchema.js';
import { migrateKnowledgeManorAdminSchema, knowledgeManorAdminSchemaReady } from './knowledgeManorAdminSchema.js';
import { createKnowledgeManorService } from './knowledgeManorService.js';
import { createManorAdminService } from './manorAdminService.js';
import { MANOR_VERSION } from '@lightnote/shared/manor';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `manor_admin_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socketPath)('庄园后台只读、维护并发与统计（隔离 MySQL）', () => {
  let root,
    db,
    game,
    admin,
    created = false,
    auditFailure = false;
  const clock = new Date('2026-10-29T02:00:00Z');
  const calendar = { dayKey: '20261029', weekKey: '202644', utcOffsetMinutes: 480 };
  const request = (revision, action, args = []) => ({
    revision,
    action,
    args,
    version: MANOR_VERSION,
    requestId: randomUUID(),
  });
  const setting = (expectedRevision, mode) => ({
    user: { id: 'root', role: 'root' },
    body: { expectedRevision, mode, message: '测试维护说明', reason: '隔离环境验收测试', confirmed: true },
  });
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Disposable socket required');
    root = await mysql.createConnection({ socketPath, user: 'root' });
    const [[state]] = await root.query('SELECT @@global.skip_networking AS isolated');
    if (Number(state.isolated) !== 1) throw new Error('Isolated MySQL required');
    await root.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 8, timezone: '+08:00' });
    await db.query(
      'CREATE TABLE user (id VARCHAR(64) PRIMARY KEY,alias VARCHAR(64),role VARCHAR(16),del_flag INT DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
    );
    await db.query('CREATE TABLE user_growth (user_id VARCHAR(64) PRIMARY KEY,points INT DEFAULT 0) ENGINE=InnoDB');
    await db.query(
      'CREATE TABLE points_log (id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id VARCHAR(64),delta INT,reason VARCHAR(32),ref VARCHAR(64),policy_version VARCHAR(32),meta JSON,create_time DATETIME DEFAULT CURRENT_TIMESTAMP,KEY owner_reason(user_id,reason,ref)) ENGINE=InnoDB',
    );
    await db.query('CREATE TABLE audit_fixture (id INT AUTO_INCREMENT PRIMARY KEY,outcome VARCHAR(20)) ENGINE=InnoDB');
    await migrateKnowledgeManorSchema(db);
    await migrateKnowledgeManorAdminSchema(db);
    await migrateKnowledgeManorAdminSchema(db);
  });
  afterAll(async () => {
    await db?.end();
    try {
      if (created) await root.query(`DROP DATABASE ${schema}`);
    } finally {
      await root?.end();
    }
  });
  beforeEach(async () => {
    for (const table of [
      'knowledge_manor_operations',
      'knowledge_manors',
      'points_log',
      'user_growth',
      'user',
      'audit_fixture',
    ])
      await db.query(`DELETE FROM ${table}`);
    await db.query(
      "UPDATE knowledge_manor_runtime SET mode='open',revision=0,message='',coverage_started_at='2026-10-29 10:00:00' WHERE id=1",
    );
    await db.query(
      "INSERT INTO user VALUES ('a','春风','user',0),('root','站长','root',0),('empty','未开通','user',0),('disabled','停用','user',1)",
    );
    await db.query("INSERT INTO user_growth VALUES ('a',60),('root',60),('empty',0),('disabled',0)");
    game = createKnowledgeManorService({
      db,
      now: () => clock,
      context: async (conn, id) => {
        const [[r]] = await conn.query('SELECT points FROM user_growth WHERE user_id=?', [id]);
        return { now: clock, calendar, points: r.points, dailyDone: [true, true, true] };
      },
      rng: () => 0,
    });
    auditFailure = false;
    admin = createManorAdminService({
      db,
      now: () => clock,
      calendar: async () => calendar,
      beginAudit: async () => ({}),
      finishAudit: async (_ctx, { outcome, db: conn }) => {
        if (outcome === 'succeeded' && auditFailure) throw new Error('audit unavailable');
        await (conn || db).query('INSERT INTO audit_fixture (outcome) VALUES (?)', [outcome]);
      },
    });
  });
  it('加法安装可重入，覆盖起点不由安装自动推断', async () => {
    expect(await knowledgeManorAdminSchemaReady(db)).toBe(true);
    await db.query('UPDATE knowledge_manor_runtime SET coverage_started_at=NULL WHERE id=1');
    await migrateKnowledgeManorAdminSchema(db);
    expect((await admin.status()).coverageStartedAt).toBeNull();
  });
  it('未开通账号的后台查看不创建存档或资产，已开通详情只读', async () => {
    expect(await admin.player('empty')).toMatchObject({ state: null, points: 0 });
    expect((await db.query('SELECT * FROM knowledge_manors'))[0]).toEqual([]);
    await game.execute('a', request(0, 'adopt'));
    const [[before]] = await db.query("SELECT revision,state_json FROM knowledge_manors WHERE user_id='a'");
    const detail = await admin.player('a');
    expect(detail.state.water).toBe(30);
    const [[after]] = await db.query("SELECT revision,state_json FROM knowledge_manors WHERE user_id='a'");
    expect(after).toEqual(before);
    await expect(admin.player('disabled')).rejects.toMatchObject({ code: 'MANOR_ADMIN_USER_NOT_FOUND' });
  });
  it('收据摘要、资源、余额同事务；重放不增加记录，后台默认排除内部账号', async () => {
    await game.execute('a', request(0, 'adopt'));
    await game.execute('root', request(0, 'adopt'));
    const buy = request(1, 'buySeed', ['radish', 2]);
    await game.execute('a', buy);
    await game.execute('a', buy);
    const items = (await admin.operations({ hideInternal: true })).items;
    expect(items).toHaveLength(2);
    expect(items.find((r) => r.action === 'buySeed')).toMatchObject({
      effectful: true,
      pointsDelta: -4,
      deltas: [{ key: 'seeds:radish', delta: 2 }],
    });
    expect((await admin.players({ hideInternal: true })).total).toBe(1);
    const report = await admin.overview();
    expect(report.opened).toBe(1);
    expect(report.finances.spent).toBe(4);
    expect(report.activity.all).toBe(1);
    const [plan] =
      await db.query(`EXPLAIN SELECT o.request_id FROM knowledge_manor_operations o JOIN user u ON u.id=o.user_id
      WHERE u.del_flag=0 AND u.role IN ('user','test','root') AND o.created_at>='2026-10-23' AND o.created_at<'2026-10-30'
      ORDER BY o.created_at DESC,o.user_id DESC,o.request_id DESC LIMIT 21`);
    const operationPlan = plan.find((r) => r.table === 'o');
    expect(operationPlan.possible_keys).toMatch(/idx_manor_ops_(time|user_time)/);
  });
  it('维护拒绝新操作，但已结算收据和已有钓鱼可恢复', async () => {
    const adopt = request(0, 'adopt');
    await game.execute('a', adopt);
    const cast = await game.execute('a', request(1, 'beginCast', ['bait']));
    await admin.updateRuntime(setting(0, 'maintenance'));
    expect(await game.execute('a', adopt)).toMatchObject({ replayed: true, runtime: { mode: 'maintenance' } });
    expect((await game.get('a')).runtime.mode).toBe('maintenance');
    await expect(game.execute('a', request(2, 'buySeed', ['radish', 1]))).rejects.toMatchObject({
      code: 'MANOR_MAINTENANCE',
    });
    const caught = await game.execute('a', request(2, 'resolveCast', [cast.state.castId]));
    expect(caught.result.fish).toBeTruthy();
  });
  it('旧修订不能覆盖设置，成功审计失败会回滚运行模式', async () => {
    await admin.updateRuntime(setting(0, 'maintenance'));
    await expect(admin.updateRuntime(setting(0, 'open'))).rejects.toMatchObject({ code: 'MANOR_RUNTIME_CONFLICT' });
    auditFailure = true;
    await expect(admin.updateRuntime(setting(1, 'open'))).rejects.toThrow('audit unavailable');
    expect(await admin.status()).toMatchObject({ mode: 'maintenance', revision: 1 });
  });
  it('连接获取失败也为运行设置留下失败审计', async () => {
    const finish = vi.fn();
    const unavailable = createManorAdminService({
      db: {
        getConnection: async () => {
          throw new Error('connection unavailable');
        },
      },
      beginAudit: async () => ({ id: 'intent' }),
      finishAudit: finish,
    });
    await expect(unavailable.updateRuntime(setting(0, 'maintenance'))).rejects.toThrow('connection unavailable');
    expect(finish).toHaveBeenCalledWith({ id: 'intent' }, expect.objectContaining({ outcome: 'failed' }));
  });
  it('操作游标绑定筛选，旧元数据保持未知，不能伪造历史类型', async () => {
    await game.execute('a', request(0, 'adopt'));
    await game.execute('a', request(1, 'buySeed', ['radish', 1]));
    await db.query(
      'UPDATE knowledge_manor_operations SET action=NULL,effectful=NULL,resource_delta_json=NULL WHERE revision=1',
    );
    const first = await admin.operations({ limit: 1 });
    expect(first.nextCursor).toBeTruthy();
    const second = await admin.operations({ limit: 1, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((r) => r.requestId)).size).toBe(2);
    const all = [...first.items, ...second.items];
    expect(all.find((r) => r.revision === 1)).toMatchObject({ action: null, effectful: null, deltas: [] });
    await expect(admin.operations({ limit: 1, cursor: first.nextCursor, userId: 'root' })).rejects.toMatchObject({
      code: 'MANOR_ADMIN_CURSOR_INVALID',
    });
  });
  it('维护切换等待已获准事务完成，返回后不能穿透执行新动作', async () => {
    await game.execute('a', request(0, 'adopt'));
    const reader = await db.getConnection();
    await reader.beginTransaction();
    await reader.query('SELECT mode FROM knowledge_manor_runtime WHERE id=1 LOCK IN SHARE MODE');
    let finished = false;
    const changing = admin.updateRuntime(setting(0, 'maintenance')).then(() => {
      finished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(finished).toBe(false);
    await reader.commit();
    reader.release();
    await changing;
    await expect(game.execute('a', request(1, 'pickPoop'))).rejects.toMatchObject({ code: 'MANOR_MAINTENANCE' });
  });
});
