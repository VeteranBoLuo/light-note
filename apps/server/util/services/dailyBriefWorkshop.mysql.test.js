import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { compileWorkshopBriefFacts } from './dailyBriefWorkshop.js';
import { dailyBriefServiceInternals } from './dailyBriefService.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('简报工坊待处理状态 SQL（隔离 MySQL）', () => {
  const schema = `brief_workshop_${randomUUID().replaceAll('-', '')}`;
  let admin,
    db,
    created = false;
  const calendar = { date: '2026-10-22', yesterdayStart: '2026-10-21', locale: 'zh-CN' };
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Disposable socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[row]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(row.isolated) !== 1) throw new Error('Disposable MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4`);
    created = true;
    db = await mysql.createConnection({ socketPath, user: 'root', database: schema, dateStrings: true });
    await db.query(
      `CREATE TABLE toolbox_jobs(id VARCHAR(64) PRIMARY KEY,user_id VARCHAR(64),tool_id VARCHAR(64),status VARCHAR(32),save_status VARCHAR(32),artifact_id VARCHAR(64),options_json JSON,updated_at DATETIME)`,
    );
    await db.query(
      `CREATE TABLE toolbox_artifacts(id VARCHAR(64) PRIMARY KEY,job_id VARCHAR(64),user_id VARCHAR(64),tool_id VARCHAR(64),title VARCHAR(255),artifact_version INT DEFAULT 1,content TEXT,coverage_json JSON,status VARCHAR(32),expires_at DATETIME,create_time DATETIME)`,
    );
    await db.query(`CREATE TABLE toolbox_job_inputs(job_id VARCHAR(64),input_index INT,input_type VARCHAR(32),resource_type VARCHAR(16),resource_id VARCHAR(64),document_source_id VARCHAR(64))`);
  });
  beforeEach(async () => {
    await db.query('DELETE FROM toolbox_artifacts');
    await db.query('DELETE FROM toolbox_jobs');
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
