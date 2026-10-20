import { CARD_IMAGE_PROFILE } from '@lightnote/shared';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAsyncJobSummary } from './adminAsyncJobHealth.js';
import { archiveHistoricalAsyncJobs, planHistoricalAsyncJobArchive } from './adminAsyncJobArchive.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('异步健康与历史归档（隔离 MySQL）', () => {
  const schema = `async_health_${randomUUID().replaceAll('-', '')}`;
  let admin,
    db,
    created = false;
  const jobTables = {
    ai_document_jobs: 'source_id VARCHAR(36)',
    bookmark_icon_jobs: 'bookmark_id VARCHAR(255),user_id VARCHAR(255)',
    todo_reminder_jobs: 'scheduled_at_utc DATETIME,lease_until DATETIME,sent_at DATETIME',
    account_deletion_requests: 'processing_started_at DATETIME,requested_at DATETIME,completed_at DATETIME',
    email_delivery_logs: 'business_type VARCHAR(50),business_id VARCHAR(255),accepted_at DATETIME',
    file_preview_jobs: 'artifact_id BIGINT',
    resource_cleanup_jobs: 'lease_expires_at DATETIME,finished_at DATETIME',
  };
  const resourceTables = {
    bookmark: 'id VARCHAR(255) PRIMARY KEY,user_id VARCHAR(255),del_flag INT',
    files: 'id BIGINT PRIMARY KEY,create_by VARCHAR(255),del_flag INT',
    ai_document_sources:
      'id VARCHAR(36) PRIMARY KEY,file_id BIGINT,user_id VARCHAR(255),source_type VARCHAR(20),expires_at DATETIME',
    file_preview_artifacts:
      'id BIGINT PRIMARY KEY,file_id BIGINT,owner_user_id VARCHAR(255),source_type VARCHAR(32),strategy_version INT,source_revision VARCHAR(64),strategy VARCHAR(32)',
    image_assets: 'id BIGINT PRIMARY KEY,status VARCHAR(30),source_version VARCHAR(64)',
    admin_operation_audit:
      'id CHAR(36) PRIMARY KEY,actor_user_id VARCHAR(255),action VARCHAR(64),target_type VARCHAR(64),target_id VARCHAR(255),outcome VARCHAR(16),reason VARCHAR(500),request_id VARCHAR(64),ip_masked VARCHAR(64),metadata JSON',
  };
  const tables = [...Object.keys(jobTables), ...Object.keys(resourceTables), 'admin_async_job_archives'];
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[server]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 3 });
    for (const [table, extra] of Object.entries(jobTables)) {
      await db.query(`CREATE TABLE ${table} (id VARCHAR(255) PRIMARY KEY,status VARCHAR(32),attempts INT DEFAULT 0,
        error_code VARCHAR(64),locked_at DATETIME,create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,${extra})`);
    }
    for (const [table, columns] of Object.entries(resourceTables)) await db.query(`CREATE TABLE ${table} (${columns})`);
    const sql = await readFile(new URL('../migrations/20261015_admin_async_job_archives.sql', import.meta.url), 'utf8');
    await db.query(sql);
    await db.query(sql);
  });
  beforeEach(async () => {
    for (const table of tables) await db.query(`DELETE FROM ${table}`);
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  const summary = async (source) => (await loadAsyncJobSummary(source, { db }))[0][0];
  const addIcon = async (id, status = 'failed', old = true) => {
    await db.query('INSERT INTO bookmark VALUES (?, ?, 0)', [id, 'owner']);
    await db.query(
      `INSERT INTO bookmark_icon_jobs (id,bookmark_id,user_id,status,update_time)
      VALUES (?,?,'owner',?,${old ? 'DATE_SUB(NOW(),INTERVAL 2 DAY)' : 'NOW()'})`,
      [id, id, status],
    );
  };

  it('七类空队列均返回完整零计数', async () => {
    for (const source of [
      'ai_document',
      'bookmark_icon',
      'todo_reminder',
      'account_deletion',
      'email_delivery',
      'file_preview',
      'resource_cleanup',
    ]) {
      const s = await summary(source);
      expect(Number(s.attention)).toBe(0);
      expect(Number(s.sla_total)).toBe(0);
      expect(Number(s.overdue)).toBe(0);
    }
  });

  it('SLA 按全部当前任务统计，排除失效书签且不受 60 条明细限制', async () => {
    for (let i = 0; i < 85; i++) await addIcon(`icon-${i}`);
    await db.query("UPDATE bookmark SET del_flag=1 WHERE id='icon-0'");
    const s = await summary('bookmark_icon');
    expect(Number(s.attention)).toBe(84);
    expect(Number(s.overdue)).toBe(84);
    expect(Number(s.sla_total)).toBe(84);
  });

  it('未来提醒以 UTC 计划时间起算，不因旧更新时间产生虚假超时', async () => {
    await db.query(`INSERT INTO todo_reminder_jobs (id,status,scheduled_at_utc,update_time)
      VALUES ('future','pending',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),DATE_SUB(NOW(),INTERVAL 20 DAY)),
        ('late','pending',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 20 MINUTE),DATE_SUB(NOW(),INTERVAL 2 DAY))`);
    const s = await summary('todo_reminder');
    expect(Number(s.waiting)).toBe(1);
    expect(Number(s.attention)).toBe(1);
    expect(Number(s.overdue)).toBe(1);
  });

  it('历史 utf8 资源与 utf8mb4 队列比较不丢失身份，也不把四字节字符降级匹配为问号', async () => {
    await db.query('ALTER TABLE bookmark CONVERT TO CHARACTER SET utf8 COLLATE utf8_general_ci');
    await db.query("INSERT INTO bookmark VALUES ('中文','owner',0),('?','owner',0)");
    await db.query(
      "INSERT INTO bookmark_icon_jobs (id,bookmark_id,user_id,status) VALUES ('valid','中文','owner','failed'),('invalid','😀','owner','failed')",
    );
    expect(Number((await summary('bookmark_icon')).attention)).toBe(1);
    await db.query('ALTER TABLE bookmark CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  });

  it('同一提醒邮件只统计一次，归档不修改未知投递状态或发起重试', async () => {
    await db.query(
      "INSERT INTO todo_reminder_jobs (id,status,update_time) VALUES ('reminder','unknown',DATE_SUB(NOW(),INTERVAL 2 DAY))",
    );
    await db.query(`INSERT INTO email_delivery_logs (id,status,business_type,business_id,update_time)
      VALUES ('mail','sending','todo_reminder_job','reminder',DATE_SUB(NOW(),INTERVAL 2 DAY))`);
    expect(Number((await summary('todo_reminder')).attention)).toBe(1);
    expect(Number((await summary('email_delivery')).attention)).toBe(0);
    const plan = await planHistoricalAsyncJobArchive({ db });
    expect(plan.total).toBe(2);
    await archiveHistoricalAsyncJobs({
      db,
      expectedTotal: plan.total,
      expectedDigest: plan.digest,
      actorUserId: 'root-test',
      reason: '核查历史结果未知邮件，仅归档不重发',
    });
    expect(Number((await summary('todo_reminder')).attention)).toBe(0);
    expect((await db.query('SELECT status FROM todo_reminder_jobs'))[0][0].status).toBe('unknown');
    expect((await db.query('SELECT status FROM email_delivery_logs'))[0][0].status).toBe('sending');
    expect((await planHistoricalAsyncJobArchive({ db })).total).toBe(0);
  });

  it('归档保留原失败；同一任务发生新的失败会重新进入健康统计', async () => {
    await addIcon('old');
    await addIcon('recent', 'failed', false);
    await addIcon('pending', 'queued');
    const plan = await planHistoricalAsyncJobArchive({ db });
    expect(plan.entries.map((e) => e.id)).toEqual(['old']);
    await archiveHistoricalAsyncJobs({
      db,
      expectedTotal: 1,
      expectedDigest: plan.digest,
      actorUserId: 'root-test',
      reason: '用户确认归档历史失败，不恢复任务',
    });
    expect(Number((await summary('bookmark_icon')).attention)).toBe(1);
    expect((await db.query("SELECT status FROM bookmark_icon_jobs WHERE id='old'"))[0][0].status).toBe('failed');
    await db.query("UPDATE bookmark_icon_jobs SET update_time=NOW() WHERE id='old'");
    expect(Number((await summary('bookmark_icon')).attention)).toBe(2);
  });

  it('快照变化时整批回滚，不吞掉新增故障', async () => {
    await addIcon('changed');
    const plan = await planHistoricalAsyncJobArchive({ db });
    await db.query("UPDATE bookmark_icon_jobs SET status='queued' WHERE id='changed'");
    await expect(
      archiveHistoricalAsyncJobs({
        db,
        expectedTotal: plan.total,
        expectedDigest: plan.digest,
        actorUserId: 'root-test',
        reason: '仅允许核对过的历史任务归档',
      }),
    ).rejects.toMatchObject({ code: 'ASYNC_ARCHIVE_SCOPE_CHANGED' });
    expect(Number((await db.query('SELECT COUNT(*) n FROM admin_async_job_archives'))[0][0].n)).toBe(0);
    expect((await db.query("SELECT status FROM bookmark_icon_jobs WHERE id='changed'"))[0][0].status).toBe('queued');
  });

  it('旧策略、待删除资源和失效云文件不计入当前预览或解析异常', async () => {
    await db.query("INSERT INTO image_assets VALUES (1,'active','v'),(2,'pending_delete','v')");
    await db.query(`INSERT INTO file_preview_artifacts (id,file_id,owner_user_id,source_type,strategy_version,source_revision) VALUES (1,1,'owner','image_asset',1,'v'),
      (2,2,'owner','image_asset',${CARD_IMAGE_PROFILE.version},'v'),(3,1,'owner','image_asset',${CARD_IMAGE_PROFILE.version},'v')`);
    await db.query(
      "INSERT INTO file_preview_jobs (id,status,artifact_id) VALUES ('old','failed',1),('deleted','failed',2),('current','failed',3)",
    );
    expect(Number((await summary('file_preview')).attention)).toBe(1);
    await db.query("INSERT INTO files VALUES (1,'owner',1),(2,'owner',0)");
    await db.query(`INSERT INTO ai_document_sources VALUES ('gone',1,'owner','cloud',NULL),('live',2,'owner','cloud',NULL),
      ('expired',NULL,'owner','temporary',DATE_SUB(NOW(),INTERVAL 1 DAY))`);
    await db.query(
      "INSERT INTO ai_document_jobs (id,status,source_id) VALUES ('gone','failed','gone'),('live','failed','live'),('expired','failed','expired')",
    );
    expect(Number((await summary('ai_document')).attention)).toBe(1);
  });

  it('旧预览版本即使被访问刷新过时间也可归档，最近失败的当前版本仍保留', async () => {
    await db.query(`INSERT INTO file_preview_artifacts
      (id,file_id,owner_user_id,source_type,strategy_version,source_revision,strategy)
      VALUES (1,1,'owner','image_asset',1,'v','image_thumbnail'),(2,1,'owner','image_asset',${CARD_IMAGE_PROFILE.version},'v','image_thumbnail')`);
    await db.query(`INSERT INTO file_preview_jobs (id,status,artifact_id,create_time,update_time)
      VALUES ('retired','failed',1,DATE_SUB(NOW(),INTERVAL 2 DAY),NOW()),
        ('current','failed',2,DATE_SUB(NOW(),INTERVAL 2 DAY),NOW())`);
    const plan = await planHistoricalAsyncJobArchive({ db });
    expect(plan.entries.map((e) => e.id)).toEqual(['retired']);
  });
});
