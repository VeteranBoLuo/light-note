import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { compileBriefTodoFacts } from './dailyBriefTodoFacts.js';
import { DAILY_BRIEF_FACT_DEFINITIONS, compileBriefActivityFacts } from './dailyBriefFacts.js';
import { dailyBriefServiceInternals } from './dailyBriefService.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const calendar = dailyBriefServiceInternals.resolveCalendar(
  { timezone: 'Asia/Shanghai', locale: 'zh-CN' },
  new Date('2026-10-22T02:00:00Z'),
);
const definitions = DAILY_BRIEF_FACT_DEFINITIONS.slice(0, 3);
describe.skipIf(!socketPath)('日报待办与今日新增 SQL（隔离 MySQL）', () => {
  const schema = `brief_${randomUUID().replaceAll('-', '')}`;
  let admin,
    db,
    created = false;
  beforeAll(async () => {
    if (!socketPath.startsWith('/tmp/') && !socketPath.startsWith('/private/tmp/'))
      throw new Error('Disposable socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[row]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(row.isolated) !== 1) throw new Error('Disposable MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = await mysql.createConnection({ socketPath, user: 'root', database: schema, dateStrings: true });
    await db.query(`CREATE TABLE todo_items(id VARCHAR(64) PRIMARY KEY,user_id VARCHAR(64),title VARCHAR(255),priority INT DEFAULT 1,
   due_at DATETIME,start_at DATETIME,occurrence_date DATE,del_flag INT DEFAULT 0,status VARCHAR(16) DEFAULT 'pending',
   instance_state VARCHAR(16) DEFAULT 'normal',series_id VARCHAR(64),recurrence_rule TEXT)`);
    await db.query(
      `CREATE TABLE todo_reminder_jobs(id VARCHAR(64) PRIMARY KEY,todo_id VARCHAR(64),user_id VARCHAR(64),scheduled_at_utc DATETIME,status VARCHAR(16))`,
    );
    await db.query(
      `CREATE TABLE todo_reminders(id VARCHAR(64) PRIMARY KEY,todo_id VARCHAR(64),user_id VARCHAR(64),scheduled_at DATETIME,status VARCHAR(16))`,
    );
    await db.query(`CREATE TABLE onboarding_seed_resources(user_id VARBINARY(255),resource_type VARCHAR(32),resource_id VARBINARY(255),
      PRIMARY KEY(user_id,resource_type,resource_id))`);
    for (const [table, owner] of [
      ['bookmark', 'user_id'],
      ['note', 'create_by'],
      ['files', 'create_by'],
    ])
      await db.query(
        `CREATE TABLE ${table}(id VARCHAR(64) PRIMARY KEY,${owner} VARCHAR(64),create_time DATETIME,del_flag INT DEFAULT 0)`,
      );
  });
  beforeEach(async () => {
    for (const table of [
      'todo_reminders',
      'todo_reminder_jobs',
      'todo_items',
      'bookmark',
      'note',
      'files',
      'onboarding_seed_resources',
    ])
      await db.query(`DELETE FROM ${table}`);
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  const add = async (id, values = {}) => {
    const row = { id, user_id: 'owner', title: id, ...values };
    await db.query('INSERT INTO todo_items SET ?', row);
  };
  const read = (c = calendar) => compileBriefTodoFacts(db, 'owner', c, definitions);
  const entries = (facts) => facts.flatMap((f) => f.entries);
  it('今日新增按账号自然日统计，排除软删除、其他账号和次日数据', async () => {
    for (const [table, owner] of [
      ['bookmark', 'user_id'],
      ['note', 'create_by'],
      ['files', 'create_by'],
    ])
      await db.query(`INSERT INTO ${table}(id,${owner},create_time,del_flag) VALUES
        ('today','owner','2026-10-22 00:00:00',0),('yesterday','owner','2026-10-21 23:59:59',0),
        ('tomorrow','owner','2026-10-23 00:00:00',0),('deleted','owner','2026-10-22 10:00:00',1),
        ('foreign','other','2026-10-22 10:00:00',0)`);
    const facts = await compileBriefActivityFacts(db, 'owner', calendar);
    expect(facts.map((fact) => fact.count)).toEqual([1, 1, 1]);
    expect(dailyBriefServiceInternals.buildBrief(calendar, facts).headline).toBe(
      '今天新增 1 条书签、1 篇笔记和1 个文件',
    );
    await db.query("UPDATE note SET del_flag=1 WHERE id='today'");
    expect((await compileBriefActivityFacts(db, 'owner', calendar)).map((fact) => fact.count)).toEqual([1, 0, 1]);
  });
  it('非东八区和夏令时日的新增概览复用账号日界，不使用数据库 CURDATE', async () => {
    const c = dailyBriefServiceInternals.resolveCalendar(
      { timezone: 'America/Los_Angeles', locale: 'en-US' },
      new Date('2026-11-01T08:00:00Z'),
    );
    await db.query(`INSERT INTO files VALUES
      ('before','owner','2026-11-01 14:59:59',0),('start','owner','2026-11-01 15:00:00',0),
      ('end','owner','2026-11-02 15:59:59',0),('next','owner','2026-11-02 16:00:00',0)`);
    expect((await compileBriefActivityFacts(db, 'owner', c)).map((fact) => fact.count)).toEqual([0, 0, 2]);
  });
  it('大量重复任务不挤掉单次任务；兼容旧重复规则和新系列', async () => {
    for (let i = 0; i < 35; i++)
      await add(`repeat-${i}`, {
        due_at: '2026-10-22 09:00:00',
        priority: 2,
        ...(i % 2 ? { series_id: 'daily' } : { recurrence_rule: '{"frequency":"daily"}' }),
      });
    await add('single', { due_at: '2026-10-22 15:00:00', priority: 0 });
    const facts = await read();
    expect(facts.map((f) => f.count)).toEqual([0, 1, 0]);
    expect(entries(facts).map((e) => e.id)).toEqual(['single']);
  });
  it('从完整候选中选择最重要的一项，不做全量统计', async () => {
    for (let i = 0; i < 6; i++)
      await add(`one-${i}`, { due_at: `2026-10-22 ${12 + i}:00:00`, priority: i === 5 ? 2 : 0 });
    await add('overdue', { due_at: '2026-10-21 18:00:00', priority: 0 });
    const facts = await read();
    expect(facts.map((f) => f.count)).toEqual([0, 1, 0]);
    expect(entries(facts).map((e) => e.id)).toEqual(['one-5']);
  });
  it('已完成、删除、跳过、其他账号、未来和无日期普通任务不混入', async () => {
    await add('done', { due_at: '2026-10-22 15:00:00', status: 'completed' });
    await add('deleted', { due_at: '2026-10-22 15:00:00', del_flag: 1 });
    await add('skipped', { due_at: '2026-10-22 15:00:00', instance_state: 'skipped' });
    await add('foreign', { due_at: '2026-10-22 15:00:00', user_id: 'other' });
    await add('future', { due_at: '2026-10-23 15:00:00' });
    await add('undated', { priority: 2 });
    expect((await read()).every((f) => f.count === 0)).toBe(true);
  });
  it('开始日期和无截止的计划日准确保留各自语义', async () => {
    await add('starts', { start_at: '2026-10-22 11:00:00', due_at: '2026-10-25 15:00:00' });
    await add('planned', { occurrence_date: '2026-10-22' });
    expect(entries(await read())).toEqual([{ id: 'starts', title: 'starts', reason: 'start', at: '2026-10-22T11:00' }]);
    await db.query("UPDATE todo_items SET status='completed' WHERE id='starts'");
    expect(entries(await read())).toEqual([{ id: 'planned', title: 'planned', reason: 'plan', at: '2026-10-22' }]);
  });
  it('单次任务可以多次催办，提醒投递后仍可处理，取消和越权提醒不算', async () => {
    await add('reminder');
    await add('cancelled');
    await add('foreign-job');
    for (const [id, at, status] of [
      ['a', '2026-10-22 02:00:00', 'sent'],
      ['b', '2026-10-22 03:00:00', 'pending'],
      ['c', '2026-10-23 03:00:00', 'pending'],
    ])
      await db.query('INSERT INTO todo_reminder_jobs VALUES (?,?,?,?,?)', [id, 'reminder', 'owner', at, status]);
    await db.query('INSERT INTO todo_reminder_jobs VALUES (?,?,?,?,?)', [
      'cancel',
      'cancelled',
      'owner',
      '2026-10-22 03:00:00',
      'cancelled',
    ]);
    await db.query('INSERT INTO todo_reminder_jobs VALUES (?,?,?,?,?)', [
      'foreign',
      'foreign-job',
      'other',
      '2026-10-22 03:00:00',
      'pending',
    ]);
    const facts = await read();
    expect(facts[2].count).toBe(1);
    expect(entries(facts)).toEqual([{ id: 'reminder', title: 'reminder', at: '2026-10-22T11:00', reason: 'reminder' }]);
  });
  it('稍后提醒使用当前 Job 时间，延期到明天立即退出今日范围；旧提醒兼容', async () => {
    await add('new');
    await add('legacy');
    await db.query('INSERT INTO todo_reminder_jobs VALUES (?,?,?,?,?)', [
      'j',
      'new',
      'owner',
      '2026-10-22 03:00:00',
      'pending',
    ]);
    await db.query('INSERT INTO todo_reminders VALUES (?,?,?,?,?)', [
      'r',
      'legacy',
      'owner',
      '2026-10-22 13:00:00',
      'pending',
    ]);
    expect(entries(await read()).map((e) => e.id)).toEqual(['new']);
    await db.query("UPDATE todo_reminder_jobs SET scheduled_at_utc='2026-10-23 03:00:00' WHERE id='j'");
    expect(entries(await read()).map((e) => e.id)).toEqual(['legacy']);
  });
  it('完成、截止延期和同数量替换均改变权威事实', async () => {
    await add('one', { due_at: '2026-10-22 15:00:00' });
    const before = await read();
    await db.query("UPDATE todo_items SET title='新标题',priority=2 WHERE id='one'");
    const edited = await read();
    expect(edited[1].count).toBe(1);
    expect(edited[1].revision).not.toBe(before[1].revision);
    await db.query("UPDATE todo_items SET due_at='2026-10-23 15:00:00' WHERE id='one'");
    expect(entries(await read())).toEqual([]);
    await db.query("UPDATE todo_items SET due_at='2026-10-22 15:00:00',status='completed' WHERE id='one'");
    expect(entries(await read())).toEqual([]);
  });
  it('同重要性优先下一次临近事项，普通过时提醒不挤掉未来事项', async () => {
    await add('past', { start_at: '2026-10-22 09:00:00' });
    await add('next', { start_at: '2026-10-22 11:00:00' });
    await add('later', { start_at: '2026-10-22 18:00:00' });
    expect(entries(await read()).map((e) => e.id)).toEqual(['next']);
  });
  it('账号时区和 DST 的25小时自然日正确包含提醒，展示账号本地时间', async () => {
    const c = dailyBriefServiceInternals.resolveCalendar(
      { timezone: 'America/Los_Angeles', locale: 'en-US' },
      new Date('2026-11-01T08:00:00Z'),
    );
    await add('late-evening');
    await add('tomorrow');
    await db.query('INSERT INTO todo_reminder_jobs VALUES (?,?,?,?,?)', [
      'late',
      'late-evening',
      'owner',
      '2026-11-02 07:30:00',
      'pending',
    ]);
    await db.query('INSERT INTO todo_reminder_jobs VALUES (?,?,?,?,?)', [
      'tomorrow',
      'tomorrow',
      'owner',
      '2026-11-02 08:30:00',
      'pending',
    ]);
    expect(entries(await read(c))).toEqual([
      { id: 'late-evening', title: 'late-evening', at: '2026-11-01T23:30', reason: 'reminder' },
    ]);
  });
});
