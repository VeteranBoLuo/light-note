import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createReadOnlyPool } from '../readOnlyDatabase.js';
import { generateCoreUsageReport, normalizeCoreUsageOptions, buildCoreUsageQueries } from './coreUsageReport.js';
const socketPath = process.env.M02_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('核心使用报告真实 SQL（独立 Socket 测试库）', () => {
  let admin,
    pool,
    db,
    created = false;
  const schema = 'm02_test_' + randomUUID().replaceAll('-', '');
  const options = {
    storageOffset: '+08:00',
    asOf: '2026-10-10T12:00:00+08:00',
    growthCoverageStart: '2026-01-01T00:00:00+08:00',
    conversionCoverageStart: '2026-01-01T00:00:00+08:00',
  };
  beforeAll(async () => {
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query('CREATE DATABASE ' + schema);
    created = true;
    await admin.query('USE ' + schema);
    for (const ddl of [
      'user(id VARCHAR(64) PRIMARY KEY,role VARCHAR(20),del_flag INT,create_time DATETIME,KEY idx_created(del_flag,create_time,id))',
      'growth_events(user_id VARCHAR(64),source VARCHAR(32),status VARCHAR(16),ref_id VARCHAR(128),amount INT,create_time DATETIME,KEY idx_activity(user_id,source,status,create_time))',
      'conversion_events(user_id VARCHAR(64),event VARCHAR(64),create_time DATETIME,KEY idx_event(user_id,event,create_time))',
      'user_activity_daily(user_id VARCHAR(64),activity_date DATE,first_active_at DATETIME,KEY idx_date(user_id,activity_date))',
      'user_activity_metadata(id INT,started_at DATETIME)',
    ])
      await admin.query('CREATE TABLE ' + ddl);
    pool = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 1 });
    pool.on('connection', (c) => c.query("SET SESSION time_zone='+08:00'"));
    db = createReadOnlyPool(pool);
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query('DROP DATABASE ' + schema);
    await admin?.end();
  });
  beforeEach(async () => {
    for (const table of ['user', 'growth_events', 'conversion_events', 'user_activity_daily', 'user_activity_metadata'])
      await admin.query('DELETE FROM ' + table);
    await admin.query(
      "INSERT INTO user VALUES ('A','user',0,'2026-10-01 12:00:00'),('B','user',0,'2026-10-01 12:00:00'),('C','user',0,'2026-10-01 12:00:00'),('D','user',0,'2026-10-08 12:00:00'),('internal','root',0,'2026-10-01 12:00:00'),('disabled','user',1,'2026-10-01 12:00:00')",
    );
    await admin.query(
      "INSERT INTO growth_events VALUES ('A','activity_note','granted','same',0,'2026-10-01 12:00:00'),('A','activity_note','granted','same',0,'2026-10-01 12:00:00'),('A','activity_file','granted','second',0,'2026-10-02 12:00:00'),('B','todo_create','granted','todo',0,'2026-10-01 12:00:00'),('B','todo_complete','granted','todo',0,'2026-10-01 14:00:00'),('C','activity_note','granted','late',0,'2026-10-08 12:00:00'),('C','activity_note','revoked','revoked',10,'2026-10-01 13:00:00'),('D','activity_note','granted','immature',0,'2026-10-08 13:00:00'),('internal','activity_note','granted','internal',0,'2026-10-01 13:00:00'),('disabled','activity_note','granted','disabled',0,'2026-10-01 13:00:00')",
    );
    await admin.query(
      "INSERT INTO conversion_events VALUES ('A','first_own_resource','2026-10-01 12:00:00'),('A','first_own_resource','2026-10-01 12:00:00'),('C','first_own_resource','2026-10-08 12:00:00')",
    );
    await admin.query("INSERT INTO user_activity_metadata VALUES (1,'2026-01-01 00:00:00')");
    await admin.query(
      "INSERT INTO user_activity_daily VALUES ('A','2026-10-01','2026-10-01 12:00:00'),('A','2026-10-02','2026-10-02 12:00:00'),('C','2026-10-08','2026-10-08 12:00:00')",
    );
  });
  it('确定性样例：成熟分母、边界、重复、零经验、撤销和角色过滤', async () => {
    const r = await generateCoreUsageReport(db, options);
    expect(r.cohort).toEqual({ registered: 4, eligible: 3, immature: 1 });
    expect(r.metrics.a7Resources.value).toBe(33.33);
    expect(r.metrics.a7Overall.value).toBe(66.67);
    expect(r.metrics.r7Core.value).toBe(33.33);
    expect(r.metrics.a7ResourcesLegacy.value).toBe(33.33);
    expect(r.metrics.r7InteractionProxy.value).toBe(33.33);
  });
  it('未成熟和空队列比例为 null', async () => {
    await admin.query('DELETE FROM user');
    let r = await generateCoreUsageReport(db, options);
    expect(r.metrics.a7Overall).toMatchObject({ eligible: 0, observed: 0, value: null, status: 'no_mature_cohort' });
    await admin.query("INSERT INTO user VALUES ('new','user',0,'2026-10-09 12:00:00')");
    r = await generateCoreUsageReport(db, options);
    expect(r.cohort.immature).toBe(1);
    expect(r.metrics.r7Core.value).toBeNull();
  });
  it('成长索引缺失跳过该源，其他来源仍可查询', async () => {
    await admin.query('ALTER TABLE growth_events DROP INDEX idx_activity');
    try {
      const r = await generateCoreUsageReport(db, options);
      expect(r.metrics.a7Overall.reasons).toEqual(['required_index_missing']);
      expect(r.metrics.a7ResourcesLegacy.value).toBe(33.33);
    } finally {
      await admin.query('ALTER TABLE growth_events ADD INDEX idx_activity(user_id,source,status,create_time)');
    }
  });
  it('UTC 存储在东八区午夜两侧算两个日期，不能直接 DATE(UTC)', async () => {
    await admin.query('DELETE FROM growth_events');
    await admin.query(
      "INSERT INTO growth_events VALUES ('A','activity_note','granted','one',0,'2026-10-01 15:59:59'),('A','activity_note','granted','two',0,'2026-10-01 16:00:00')",
    );
    const q = buildCoreUsageQueries(normalizeCoreUsageOptions({ ...options, storageOffset: '+00:00' })).growth;
    const [rows] = await admin.query(q.sql, q.params);
    expect(Number(rows[0].returning_count)).toBe(1);
  });
  it('HTTP 共享连接不遗留会话只读，报告事务仍拒绝写入', async () => {
    const shared = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 1 });
    const raw = await shared.getConnection();
    const safe = createReadOnlyPool({ getConnection: async () => raw }, { transactionOnly: true });
    const c = await safe.getConnection();
    try {
      await c.beginTransaction();
      // Raw checkout bypasses the SQL allowlist to prove the database transaction itself is read-only.
      await expect(raw.query("INSERT INTO user VALUES ('forbidden','user',0,NOW())")).rejects.toMatchObject({
        code: 'ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION',
      });
      await c.rollback();
    } finally {
      c.release();
    }
    try {
      await shared.query("INSERT INTO user VALUES ('normal-write','user',0,NOW())");
      expect((await shared.query("SELECT COUNT(*) AS n FROM user WHERE id='normal-write'"))[0][0].n).toBe(1);
    } finally {
      await shared.end();
    }
  });
  it('数据库事务与 SQL 白名单双重只读', async () => {
    const c = await db.getConnection();
    try {
      expect(() => c.query('DELETE FROM user')).toThrow('当前数据库连接仅允许只读检查');
      const [rows] = await c.query('SELECT @@session.transaction_read_only AS readOnly');
      expect(Number(rows[0].readOnly)).toBe(1);
    } finally {
      c.release();
    }
  });
});
