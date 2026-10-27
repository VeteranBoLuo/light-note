import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { compileWorkshopBriefFacts } from './dailyBriefWorkshop.js';
import { dailyBriefServiceInternals } from './dailyBriefService.js';
import { compileBriefActivityFacts, compileBriefOnboardingFact } from './dailyBriefFacts.js';
import { compileBriefTodoFacts } from './dailyBriefTodoFacts.js';
import { listInboxResources } from '../resourceInbox.js';
import { summarizeUntaggedResources } from './resourceInventoryService.js';
import { summarizePendingOrganizeReview } from './organizeReviewSummary.js';
import { adviceContext } from './dailyBriefAdvice.js';
import { EXTRACTION_SCHEMA } from '../extraction/schema.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('简报工坊待处理状态 SQL（隔离 MySQL）', () => {
  const schema = `brief_workshop_${randomUUID().replaceAll('-', '')}`;
  let admin,
    db,
    created = false;
  const calendar = {
    date: '2026-10-22',
    todayStart: '2026-10-22 00:00:00',
    todayEnd: '2026-10-23 00:00:00',
    yesterdayStart: '2026-10-21',
    locale: 'zh-CN',
  };
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Disposable socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[row]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(row.isolated) !== 1) throw new Error('Disposable MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = await mysql.createConnection({ socketPath, user: 'root', database: schema, dateStrings: true });
    await db.query(
      `CREATE TABLE toolbox_jobs(id VARCHAR(64) PRIMARY KEY,user_id VARCHAR(64),tool_id VARCHAR(64),status VARCHAR(32),save_status VARCHAR(32),artifact_id VARCHAR(64),options_json JSON,updated_at DATETIME)`,
    );
    await db.query(
      `CREATE TABLE toolbox_artifacts(id VARCHAR(64) PRIMARY KEY,job_id VARCHAR(64),user_id VARCHAR(64),tool_id VARCHAR(64),title VARCHAR(255),artifact_version INT DEFAULT 1,content TEXT,coverage_json JSON,status VARCHAR(32),expires_at DATETIME,create_time DATETIME)`,
    );
    await db.query(
      `CREATE TABLE toolbox_job_inputs(job_id VARCHAR(64),input_index INT,input_type VARCHAR(32),resource_type VARCHAR(16),resource_id VARCHAR(64),document_source_id VARCHAR(64))`,
    );
    await db.query(`CREATE TABLE onboarding_seed_resources(user_id VARBINARY(255),resource_type VARCHAR(32),resource_id VARBINARY(255),
      PRIMARY KEY(user_id,resource_type,resource_id))`);
    for (const [table, owner] of [
      ['bookmark', 'user_id'],
      ['note', 'create_by'],
      ['files', 'create_by'],
    ])
      await db.query(
        `CREATE TABLE ${table}(id VARCHAR(64) PRIMARY KEY,${owner} VARCHAR(64),create_time DATETIME,update_time DATETIME,del_flag INT DEFAULT 0, name VARCHAR(255),title VARCHAR(255),description TEXT,content TEXT,url TEXT,type VARCHAR(32),file_name VARCHAR(255),file_type VARCHAR(32),folder_id INT)`,
      );
    await db.query(`CREATE TABLE todo_items(id VARCHAR(64),user_id VARCHAR(64),del_flag INT DEFAULT 0,title VARCHAR(255),priority INT DEFAULT 1,
      due_at DATETIME,start_at DATETIME,occurrence_date DATE,status VARCHAR(16) DEFAULT 'pending',instance_state VARCHAR(16),series_id VARCHAR(64),recurrence_rule TEXT)`);
    await db.query(
      'CREATE TABLE todo_reminder_jobs(todo_id VARCHAR(64),user_id VARCHAR(64),scheduled_at_utc DATETIME,status VARCHAR(16))',
    );
    await db.query(
      'CREATE TABLE todo_reminders(todo_id VARCHAR(64),user_id VARCHAR(64),scheduled_at DATETIME,status VARCHAR(16))',
    );
    await db.query(
      'CREATE TABLE resource_inbox(id VARCHAR(64),user_id VARCHAR(64),resource_type VARCHAR(16),resource_id VARCHAR(64),status VARCHAR(16),source VARCHAR(32),create_time DATETIME)',
    );
    await db.query('CREATE TABLE tag(id VARCHAR(64),user_id VARCHAR(64),name VARCHAR(255),del_flag INT DEFAULT 0)');
    await db.query(
      'CREATE TABLE resource_tag_relations(user_id VARCHAR(64),resource_type VARCHAR(16),resource_id VARCHAR(64),tag_id VARCHAR(64))',
    );
    await db.query(
      'CREATE TABLE organize_issue_suppressions(user_id VARCHAR(64),issue_type VARCHAR(32),subject_key VARCHAR(128))',
    );
    await db.query(
      'CREATE TABLE organize_suggestion_runs(id VARCHAR(64),user_id VARCHAR(64),status VARCHAR(32),started_at DATETIME,created_at DATETIME)',
    );
    await db.query(
      'CREATE TABLE organize_suggestion_items(id VARCHAR(64),user_id VARCHAR(64),run_id VARCHAR(64),resource_type VARCHAR(16),resource_id VARCHAR(64))',
    );
    await db.query(
      'CREATE TABLE organize_suggestions(id VARCHAR(64),user_id VARCHAR(64),run_id VARCHAR(64),item_id VARCHAR(64),status VARCHAR(32),kind VARCHAR(32),payload_json JSON)',
    );
    await db.query('CREATE TABLE toolbox_workspaces(id VARCHAR(64),user_id VARCHAR(64))');
    for (const sql of EXTRACTION_SCHEMA) await db.query(sql);
  });
  beforeEach(async () => {
    await db.query('DELETE FROM toolbox_artifacts');
    await db.query('DELETE FROM toolbox_jobs');
    for (const table of [
      'bookmark',
      'note',
      'files',
      'todo_items',
      'toolbox_workspaces',
      'toolbox_extractions',
      'onboarding_seed_resources',
      'resource_inbox',
      'organize_suggestion_runs',
      'organize_suggestion_items',
      'organize_suggestions',
    ])
      await db.query(`DELETE FROM ${table}`);
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  // 项目到期由 itemDetails.mysql 覆盖；这里真实执行成果与失败任务查询。
  const read = () =>
    compileWorkshopBriefFacts(
      {
        query: (sql, params) =>
          sql.includes('FROM toolbox_workspaces') ? Promise.resolve([[]]) : db.query(sql, params),
      },
      'owner',
      calendar,
    );
  const job = async (id, values = {}) =>
    db.query('INSERT INTO toolbox_jobs SET ?', {
      id,
      user_id: 'owner',
      tool_id: 'research_brief',
      status: 'succeeded',
      save_status: 'unsaved',
      updated_at: '2026-10-10 12:00:00',
      ...values,
    });
  const artifact = async (id, values = {}) => {
    await db.query('INSERT INTO toolbox_artifacts SET ?', {
      id,
      job_id: id,
      user_id: 'owner',
      tool_id: 'research_brief',
      title: '研究报告',
      content: '## 结论\n这是从指定资料中提取的可靠结论，应结合原成果查看具体来源和完整依据。',
      coverage_json: '{"complete":true}',
      status: 'ready',
      expires_at: '2099-01-01',
      create_time: '2026-10-10',
      ...values,
    });
  };
  it('注册赠送的三类资料、待办与整理关系不触发建议；用户新增同名资料后正常切换', async () => {
    const personalCalendar = dailyBriefServiceInternals.resolveCalendar(
      { timezone: 'Asia/Shanghai', locale: 'zh-CN' },
      new Date('2026-10-22T02:00:00Z'),
    );
    for (const [table, owner, type] of [
      ['bookmark', 'user_id', 'bookmark'],
      ['note', 'create_by', 'note'],
      ['files', 'create_by', 'file'],
    ]) {
      await db.query(
        `INSERT INTO ${table} SET id='seed',${owner}='owner',create_time='2026-10-22',title='示例',name='示例',file_name='示例'`,
      );
      await db.query('INSERT INTO onboarding_seed_resources VALUES (?,?,?)', ['owner', type, 'seed']);
      await db.query("INSERT INTO resource_inbox VALUES (?,'owner',?,'seed','pending','manual','2026-10-22')", [
        type,
        type,
      ]);
    }
    await db.query(
      "INSERT INTO todo_items SET id='seed-todo',user_id='owner',title='默认待办',due_at='2026-10-22 12:00:00'",
    );
    await db.query("INSERT INTO onboarding_seed_resources VALUES ('owner','todo','seed-todo')");
    await db.query("INSERT INTO organize_suggestion_runs VALUES ('run','owner','completed','2026-10-22','2026-10-22')");
    await db.query("INSERT INTO organize_suggestion_items VALUES ('item','owner','run','note','seed')");
    await db.query(
      `INSERT INTO organize_suggestions VALUES ('suggestion','owner','run','item','pending','title','{}')`,
    );
    const activity = await compileBriefActivityFacts(db, 'owner', personalCalendar);
    expect(activity.map((item) => item.count)).toEqual([0, 0, 0]);
    expect(activity.every((item) => item.inventoryEmpty === true)).toBe(true);
    const todos = await compileBriefTodoFacts(db, 'owner', personalCalendar, [
      ['todo_overdue'],
      ['todo_due_today'],
      ['todo_scheduled_today'],
    ]);
    expect(todos.every((item) => item.count === 0)).toBe(true);
    const onboarding = await compileBriefOnboardingFact(db, 'owner', activity, todos);
    const guide = dailyBriefServiceInternals.buildBrief(personalCalendar, [...activity, ...todos, onboarding]);
    expect(guide.recommendationFactIds).toEqual(['onboarding_empty']);
    expect(adviceContext([...activity, ...todos, onboarding], personalCalendar.locale).signals).toEqual([]);
    const options = { userId: 'owner', excludeOnboardingSeeds: true };
    expect((await listInboxResources(db, { ...options, view: 'summary', includeCounts: false })).total).toBe(0);
    expect((await summarizeUntaggedResources(db, options)).total).toBe(0);
    expect((await summarizePendingOrganizeReview(db, 'owner', options)).total).toBe(0);
    // 原资料与整理页仍可显示示例，过滤仅作用于简报读模型。
    expect((await listInboxResources(db, { userId: 'owner', view: 'summary', includeCounts: false })).total).toBe(3);
    expect((await summarizeUntaggedResources(db, { userId: 'owner' })).total).toBe(3);
    expect((await summarizePendingOrganizeReview(db, 'owner')).total).toBe(1);
    await db.query("INSERT INTO note SET id='mine',create_by='owner',title='示例',create_time='2026-10-22'");
    // 其他账号同 ID 的来源记录不能排除当前用户的个人资料。
    await db.query("INSERT INTO onboarding_seed_resources VALUES ('other','note','mine')");
    const changed = await compileBriefActivityFacts(db, 'owner', personalCalendar);
    expect(changed.map((item) => item.count)).toEqual([0, 1, 0]);
    expect((await compileBriefOnboardingFact(db, 'owner', changed)).count).toBe(0);
    expect(adviceContext(changed, personalCalendar.locale).signals.map((item) => item.id)).toContain(
      'note_created_today',
    );
    expect((await summarizeUntaggedResources(db, options)).total).toBe(1);
    await db.query(
      "INSERT INTO todo_items SET id='mine-todo',user_id='owner',title='默认待办',due_at='2026-10-22 12:00:00'",
    );
    expect(
      (
        await compileBriefTodoFacts(db, 'owner', personalCalendar, [
          ['todo_overdue'],
          ['todo_due_today'],
          ['todo_scheduled_today'],
        ])
      )[1].entries[0].id,
    ).toBe('mine-todo');
  });
  it('全空引导隔离账号，零新增但有旧资料时不显示；已删除资料不阻挡引导', async () => {
    await db.query("INSERT INTO note SET id='foreign',create_by='other',create_time='2000-01-01'");
    let activity = await compileBriefActivityFacts(db, 'owner', calendar);
    expect(activity.every((item) => item.inventoryEmpty === true)).toBe(true);
    expect(await compileBriefOnboardingFact(db, 'owner', activity)).toMatchObject({ count: 1 });
    await db.query("INSERT INTO note SET id='old',create_by='owner',create_time='2000-01-01'");
    activity = await compileBriefActivityFacts(db, 'owner', calendar);
    expect(activity.every((item) => item.count === 0)).toBe(true);
    expect(await compileBriefOnboardingFact(db, 'owner', activity)).toMatchObject({ count: 0 });
    await db.query("UPDATE note SET del_flag=1 WHERE id='old'");
    expect(
      await compileBriefOnboardingFact(db, 'owner', await compileBriefActivityFacts(db, 'owner', calendar)),
    ).toMatchObject({ count: 1 });
  });
  it('未进入今日重点的待办和暂停提取表也属于已有数据', async () => {
    const activity = await compileBriefActivityFacts(db, 'owner', calendar);
    await db.query("INSERT INTO todo_items SET id='future',user_id='owner'");
    expect(await compileBriefOnboardingFact(db, 'owner', activity)).toMatchObject({ count: 0 });
    await db.query('DELETE FROM todo_items');
    await db.query('INSERT INTO toolbox_extractions SET id=?,user_id=?,request_id=?,input_digest=?,title=?,status=?', [
      randomUUID(),
      'owner',
      randomUUID(),
      '0'.repeat(64),
      '提取表',
      'paused',
    ]);
    expect(await compileBriefOnboardingFact(db, 'owner', activity)).toMatchObject({ count: 0 });
  });
  it('较早生成但仍有效未保存的成果保留；排除已保存、已过期及其他账号', async () => {
    await job('old', { artifact_id: 'old' });
    await artifact('old');
    await job('saved', { save_status: 'saved' });
    await artifact('saved');
    await job('expired');
    await artifact('expired', { expires_at: '2000-01-01' });
    await job('foreign', { user_id: 'other' });
    await artifact('foreign', { user_id: 'other' });
    const facts = await read();
    expect(facts[0]).toMatchObject({ count: 1, sources: [{ type: 'toolbox_task', id: 'old' }] });
    await db.query("UPDATE toolbox_jobs SET save_status='saved' WHERE id='old'");
    expect((await read())[0].count).toBe(0);
  });
  it('失败提醒排除已移除、翻译和其他账号；完成或移除后立即消失', async () => {
    await job('shown', { status: 'failed' });
    await job('dismissed', { status: 'failed', options_json: '{"homeDismissed":true}', updated_at: '2026-10-22' });
    await job('translation', { status: 'failed', tool_id: 'translation', updated_at: '2026-10-22' });
    await job('foreign', { status: 'failed', user_id: 'other', updated_at: '2026-10-22' });
    const facts = await read();
    expect(facts[3]).toMatchObject({ count: 1, sources: [{ type: 'toolbox_task', id: 'shown' }] });
    expect(dailyBriefServiceInternals.buildBrief(calendar, facts).insights).toHaveLength(1);
    await db.query('UPDATE toolbox_jobs SET options_json=? WHERE id=?', [
      JSON.stringify({ homeDismissed: true }),
      'shown',
    ]);
    expect((await read())[3].count).toBe(0);
  });
  it('保存失败保持独立语义，普通暂停不作为异常', async () => {
    await job('save-failed', { save_status: 'save_failed', artifact_id: 'save-failed' });
    await artifact('save-failed');
    await job('paused', { status: 'paused', updated_at: '2026-10-22' });
    const facts = await read();
    expect(facts[0].count).toBe(0);
    expect(facts[3]).toMatchObject({ count: 1, samples: ['工坊成果保存失败：研究报告'] });
    await db.query("UPDATE toolbox_jobs SET save_status='saved' WHERE id='save-failed'");
    expect((await read())[3].count).toBe(0);
  });
});
