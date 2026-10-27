import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EXTRACTION_SCHEMA } from '../extraction/schema.js';
import { listToolboxTaskPage } from './taskList.js';
import { dismissToolboxJob, getToolboxJob, listToolboxHomeTasks } from './service.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('task list across domains (isolated MySQL)', () => {
  const schema = `task_list_${randomUUID().replaceAll('-', '')}`;
  let admin, database;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Disposable socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[state]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(state.isolated) !== 1) throw new Error('Disposable MySQL required');
    // Production's legacy toolbox tables use general_ci; extraction installs unicode_ci explicitly.
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    database = mysql.createPool({ socketPath, user: 'root', database: schema, dateStrings: true });
    await database.query(
      `CREATE TABLE toolbox_jobs(id VARCHAR(64) PRIMARY KEY,user_id VARCHAR(64),tool_id VARCHAR(64),status VARCHAR(32),stage VARCHAR(32),error_code VARCHAR(64),error_message VARCHAR(255),external_cost_committed INT DEFAULT 0,started_at DATETIME,completed_at DATETIME,save_status VARCHAR(32),artifact_id VARCHAR(64),options_json JSON,billing_medium VARCHAR(16),billing_status VARCHAR(24),quoted_points INT DEFAULT 0,actual_points INT DEFAULT 0,updated_at DATETIME,create_time DATETIME) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
    );
    await database.query(
      `CREATE TABLE toolbox_artifacts(id VARCHAR(64) PRIMARY KEY,user_id VARCHAR(64),artifact_type VARCHAR(64),title VARCHAR(255),content_type VARCHAR(32),artifact_version INT,status VARCHAR(32),expires_at DATETIME)`,
    );
    await database.query(
      `CREATE TABLE toolbox_job_inputs(job_id VARCHAR(64),input_index INT,input_type VARCHAR(32),resource_type VARCHAR(16),resource_id VARCHAR(64),document_source_id VARCHAR(64))`,
    );
    await database.query(
      `CREATE TABLE note(id VARCHAR(64),create_by VARCHAR(64),title VARCHAR(255),update_time DATETIME,del_flag INT)`,
    );
    for (const sql of EXTRACTION_SCHEMA) await database.query(sql);
  });
  beforeEach(async () => {
    for (const table of [
      'toolbox_jobs',
      'toolbox_artifacts',
      'toolbox_job_inputs',
      'note',
      'toolbox_extractions',
      'toolbox_extraction_sources',
    ])
      await database.query(`DELETE FROM ${table}`);
  });
  afterAll(async () => {
    await database?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
  });
  const job = (id, values = {}) =>
    database.query('INSERT INTO toolbox_jobs SET ?', {
      id,
      user_id: 'owner',
      tool_id: 'material_to_note',
      status: 'failed',
      save_status: 'unsaved',
      options_json: JSON.stringify({ taskMaterials: [{ type: 'note', id: 'n', title: '阅读摘记' }] }),
      updated_at: '2026-08-29 10:48:00',
      create_time: '2026-08-29 10:42:00',
      ...values,
    });
  const extraction = (id, values = {}) =>
    database.query('INSERT INTO toolbox_extractions SET ?', {
      id,
      user_id: 'owner',
      request_id: randomUUID(),
      input_digest: '0'.repeat(64),
      title: '提取表',
      status: 'paused',
      updated_at: '2026-10-14 10:00:00',
      ...values,
    });
  it('includes an old failed task after recent paused extraction tasks, with stable global paging and owner isolation', async () => {
    await job('old-failure');
    await job('foreign', { user_id: 'other', updated_at: '2026-10-26' });
    await job('hidden', { options_json: '{"homeDismissed":true}', updated_at: '2026-10-26' });
    await job('translation', { tool_id: 'translation', updated_at: '2026-10-26' });
    await extraction('new-b');
    await extraction('new-a');
    const first = await listToolboxTaskPage({ userId: 'owner', limit: 1, database });
    expect(first.items.map((item) => item.id)).toEqual(['new-b']);
    const second = await listToolboxTaskPage({ userId: 'owner', limit: 1, cursor: first.nextCursor, database });
    expect(second.items.map((item) => item.id)).toEqual(['new-a']);
    const third = await listToolboxTaskPage({ userId: 'owner', limit: 1, cursor: second.nextCursor, database });
    expect(third.items).toMatchObject([{ id: 'old-failure', title: '阅读摘记', status: 'failed' }]);
    expect(third.nextCursor).toBeNull();
    expect(
      (await listToolboxTaskPage({ userId: 'owner', filter: 'failed', database })).items.map((item) => item.id),
    ).toEqual(['old-failure']);
    expect((await listToolboxTaskPage({ userId: 'owner', filter: 'paused', database })).items).toHaveLength(2);
  });
  it('keeps old failures in the home attention queue even beyond the recent scan window', async () => {
    await job('old');
    for (let index = 0; index < 53; index++)
      await job(`new-${index}`, { status: 'succeeded', updated_at: '2026-10-26' });
    await extraction('paused');
    const home = await listToolboxHomeTasks({ userId: 'owner', database });
    expect(home.recent.some((item) => item.id === 'old')).toBe(false);
    expect(home.attention).toMatchObject([{ id: 'old', title: '阅读摘记' }]);
  });
  it('pages tied identities across legacy general and extraction unicode collations', async () => {
    await job('same-id', { updated_at: '2026-10-14 10:00:00' });
    await extraction('same-id');
    const first = await listToolboxTaskPage({ userId: 'owner', limit: 1, database });
    expect(first.items[0]).toMatchObject({ id: 'same-id', toolId: 'material_to_note' });
    const second = await listToolboxTaskPage({ userId: 'owner', limit: 1, cursor: first.nextCursor, database });
    expect(second.items[0]).toMatchObject({ id: 'same-id', toolId: 'extraction' });
    expect(second.nextCursor).toBeNull();
  });
  it('dismisses from visible lists without changing billing or deleting the retained task', async () => {
    await job('failed', { billing_status: 'released' });
    await dismissToolboxJob({ userId: 'owner', jobId: 'failed', database });
    expect((await listToolboxTaskPage({ userId: 'owner', filter: 'failed', database })).items).toEqual([]);
    const [[retained]] = await database.query("SELECT billing_status FROM toolbox_jobs WHERE id='failed'");
    expect(retained.billing_status).toBe('released');
    await expect(dismissToolboxJob({ userId: 'other', jobId: 'failed', database })).rejects.toMatchObject({
      code: 'TOOLBOX_JOB_NOT_FOUND',
    });
  });
  it('recovers legacy identity from owned materials and retains the saved name when material becomes unavailable', async () => {
    await job('legacy', { options_json: '{"question":"提炼主张和依据"}' });
    await database.query(
      "INSERT INTO toolbox_job_inputs SET job_id='legacy',input_index=0,input_type='resource',resource_type='note',resource_id='n'",
    );
    await database.query("INSERT INTO note SET id='n',create_by='owner',title='现有摘记',update_time=NOW(),del_flag=0");
    expect((await getToolboxJob({ userId: 'owner', jobId: 'legacy', database })).title).toBe('现有摘记');
    await database.query("UPDATE toolbox_jobs SET options_json=? WHERE id='legacy'", [
      JSON.stringify({ taskMaterials: [{ type: 'note', id: 'n', title: '创建时名称' }] }),
    ]);
    await database.query("UPDATE note SET del_flag=1 WHERE id='n'");
    const result = await getToolboxJob({ userId: 'owner', jobId: 'legacy', database });
    expect(result).toMatchObject({
      title: '创建时名称',
      input: { materials: [{ title: '创建时名称', available: false }] },
    });
  });
  it('rejects invalid cursor and unknown filter without accepting arbitrary SQL fragments', async () => {
    await expect(listToolboxTaskPage({ userId: 'owner', filter: 'untrusted', database })).rejects.toMatchObject({
      code: 'TOOLBOX_FILTER_INVALID',
    });
    await expect(listToolboxTaskPage({ userId: 'owner', cursor: 'bad', database })).rejects.toMatchObject({
      code: 'TOOLBOX_CURSOR_INVALID',
    });
  });
});
