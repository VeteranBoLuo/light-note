import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import yauzl from 'yauzl';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ pool: null, notify: vi.fn() }));
vi.mock('../../db/index.js', () => ({
  default: { query: (...a) => state.pool.query(...a), getConnection: (...a) => state.pool.getConnection(...a) },
}));
vi.mock('../notification.js', () => ({ createNotification: (...a) => state.notify(...a) }));
vi.mock('../notificationSchedulerPolicy.js', () => ({ notificationSchedulerEnabled: () => true }));
const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = 'ln_export_' + randomUUID().replaceAll('-', '');
let admin, dir, service, worker, storage;
const opts = () => ({ types: ['notes'], noteFormat: 'html', includeImages: false, requestId: randomUUID() });
describe.skipIf(!socket)('export jobs on isolated MySQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(await fs.realpath(socket))) throw new Error('Disposable socket required');
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-export-db-'));
    process.env.DATA_EXPORT_STORAGE_DIR = dir;
    process.env.LIGHT_NOTE_IMAGE_DIR = path.join(dir, 'images');
    await fs.mkdir(process.env.LIGHT_NOTE_IMAGE_DIR);
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    state.pool = mysql.createPool({ socketPath: socket, user: 'root', database: schema, connectionLimit: 5 });
    const migration = await fs.readFile(new URL('../../migrations/20260921_data_export.sql', import.meta.url), 'utf8');
    for (const sql of migration
      .replace(/^--.*$/gm, '')
      .split(';')
      .filter((s) => s.trim()))
      await state.pool.query(sql);
    await state.pool.query("CREATE TABLE user (id VARCHAR(128) PRIMARY KEY,role VARCHAR(24) DEFAULT 'user',del_flag INT DEFAULT 0,preferences JSON NULL)");
    await state.pool.query('CREATE TABLE bookmark (id VARCHAR(128) PRIMARY KEY,user_id VARCHAR(128),del_flag INT DEFAULT 0)');
    await state.pool.query(
      'CREATE TABLE onboarding_seed_resources (user_id VARCHAR(128),resource_type VARCHAR(24),resource_id VARCHAR(128))',
    );
    await state.pool.query('CREATE TABLE notification (id VARCHAR(64) PRIMARY KEY,user_id VARCHAR(128))');
    await state.pool.query("INSERT INTO user (id) VALUES ('u'),('other')");
    await state.pool.query(
      'CREATE TABLE note (id VARCHAR(128) PRIMARY KEY,title VARCHAR(255),content LONGTEXT,type VARCHAR(24),parent_id VARCHAR(128),sort INT DEFAULT 0,revision INT DEFAULT 1,create_by VARCHAR(128),del_flag INT DEFAULT 0)',
    );
    await state.pool.query(
      'CREATE TABLE folders (id INT PRIMARY KEY,name VARCHAR(255),parent_id INT,sort INT DEFAULT 0,create_by VARCHAR(128),del_flag INT DEFAULT 0)',
    );
    await state.pool.query(
      'CREATE TABLE files (id INT PRIMARY KEY,file_name VARCHAR(255),file_size BIGINT,obs_key VARCHAR(500),directory VARCHAR(255),folder_id INT,create_by VARCHAR(128),del_flag INT DEFAULT 0)',
    );
    const {ensureExtractionSchema}=await import('../extraction/schema.js');
    await ensureExtractionSchema(state.pool);
    service = await import('./service.js');
    worker = await import('./worker.js');
    storage = await import('./storage.js');
  });
  beforeEach(async () => {
    await state.pool.query("UPDATE user SET role='user',del_flag=0,preferences=NULL");
    for (const table of ['bookmark', 'onboarding_seed_resources', 'notification']) await state.pool.query(`DELETE FROM ${table}`);
    state.notify.mockReset().mockImplementation(async (userId, payload) => {
      await state.pool.query('INSERT IGNORE INTO notification (id,user_id) VALUES (?,?)', [payload.id, userId]);
    });
    for(const table of ['toolbox_extraction_records','toolbox_extraction_sources','toolbox_extraction_receipts','toolbox_extractions']) await state.pool.query(`DELETE FROM ${table}`);
    await state.pool.query('DELETE FROM data_export_items');
    await state.pool.query('DELETE FROM data_export_tasks');
    await state.pool.query('DELETE FROM files');
    await state.pool.query('DELETE FROM folders');
    await state.pool.query('DELETE FROM note');
    await state.pool.query(
      "INSERT INTO note (id,title,content,type,create_by) VALUES ('n','标题','<p>正文</p>','html','u'),('private','秘密','secret','html','other')",
    );
  });
  afterAll(async () => {
    await state.pool?.end();
    if (admin) {
      await admin.query(`DROP DATABASE ${schema}`);
      await admin.end();
    }
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });
  it('serializes duplicate creation and enforces ownership', async () => {
    const input = opts();
    const [a, b] = await Promise.all([service.createTask('u', input), service.createTask('u', input)]);
    expect(a.id).toBe(b.id);
    expect(a.total).toBe(1);
    expect((await service.createTask('u', opts())).id).toBe(a.id);
    await expect(service.ownedTask('other', a.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.createTask('u', { ...input, noteFormat: 'markdown' })).rejects.toMatchObject({
      code: 'DATA_EXPORT_CONFLICT',
    });
  });
  it('creates a downloadable ZIP from a real job', async () => {
    const task = await service.createTask('u', opts());
    expect(await worker.processTask()).toBe(true);
    const result = await service.latestTask('u');
    expect(result.status).toBe('completed');
    expect(result.canDownload).toBe(true);
    expect(result.completed).toBe(1);
    const zip = await fs.readFile(path.join(storage.taskDirectory(task.id), 'export.zip'));
    expect(zip.subarray(0, 2).toString()).toBe('PK');
  });
  it('reports changed and missing resources without false success', async () => {
    const task = await service.createTask('u', opts());
    await state.pool.query("UPDATE note SET content='changed',revision=2 WHERE id='n'");
    await worker.processTask();
    expect((await service.latestTask('u')).status).toBe('failed');
    expect((await service.failurePage('u', task.id))[0].code).toBe('DATA_EXPORT_SOURCE_CHANGED');
  });
  it('delivers partial results and expires downloads', async () => {
    await state.pool.query(
      "INSERT INTO note (id,title,content,type,create_by) VALUES ('bad','Bad','<iframe></iframe>','html','u')",
    );
    const task = await service.createTask('u', opts());
    await worker.processTask();
    expect((await service.latestTask('u')).status).toBe('partial');
    await state.pool.query('UPDATE data_export_tasks SET expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?', [
      task.id,
    ]);
    await service.cleanup();
    expect((await service.latestTask('u')).canDownload).toBe(false);
    await expect(fs.access(storage.taskDirectory(task.id))).rejects.toThrow();
  });
  it('cancels queued tasks and reclaims expired leases only on this host', async () => {
    let task = await service.createTask('u', opts());
    await service.cancelTask('u', task.id);
    expect(await worker.processTask()).toBe(false);
    task = await service.createTask('u', opts());
    await state.pool.query(
      "UPDATE data_export_tasks SET status='running',lease_token='stale',lease_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?",
      [task.id],
    );
    await worker.processTask();
    expect((await service.latestTask('u')).status).toBe('completed');
  });
  it('preserves original file bytes and folder names in the final ZIP', async () => {
    const bytes = Buffer.alloc(8 * 1024 * 1024, 37);
    await fs.writeFile(path.join(process.env.LIGHT_NOTE_IMAGE_DIR, '原件.bin'), bytes);
    await state.pool.query("INSERT INTO folders(id,name,create_by) VALUES (1,'资料','u')");
    await state.pool.query("INSERT INTO files VALUES (1,'原件.bin',?,NULL,'/uploads/',1,'u',0)", [bytes.length]);
    const task = await service.createTask('u', { ...opts(), types: ['files'] });
    await worker.processTask();
    expect((await service.latestTask('u')).status).toBe('completed');
    const entries = await readZip(path.join(storage.taskDirectory(task.id), 'export.zip'));
    const actual = entries.get('文件/资料/原件.bin');
    expect(createHash('sha256').update(actual).digest('hex')).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
  it('exports owned extraction originals, empty overrides and excluded records without temporary materials', async()=>{
    const id=randomUUID(),sourceId=randomUUID();
    await state.pool.query("INSERT INTO toolbox_extractions(id,user_id,request_id,input_digest,title,status,phase,plan_json) VALUES (?,'u',?,'test','产品表','completed','extract',?)",[id,randomUUID(),JSON.stringify({recordDefinition:'产品',fields:[{id:'f1',label:'名称'}]})]);
    await state.pool.query("INSERT INTO toolbox_extraction_sources(id,extraction_id,user_id,position,resource_type,resource_id,resource_version,title,status,source_json,expires_at) VALUES (?,?,'u',0,'note','n','v1','资料','completed','temporary body',NOW())",[sourceId,id]);
    const payload={id:'r',sourceId,cells:[{fieldId:'f1',originalValue:'相机',status:'found',evidence:[{quote:'相机',sourceVersion:'v1'}]}]};
    await state.pool.query("INSERT INTO toolbox_extraction_records(id,extraction_id,user_id,source_id,payload_json,reviews_json,published,excluded) VALUES ('r',?,'u',?,?,?,1,1)",[id,sourceId,JSON.stringify(payload),JSON.stringify({f1:{value:'',overridden:true,checked:true}})]);
    const task=await service.createTask('u',{...opts(),types:['extractions']});
    expect(task.total).toBe(1);await worker.processTask();
    expect((await service.latestTask('u')).status).toBe('completed');
    const entries=await readZip(path.join(storage.taskDirectory(task.id),'export.zip'));
    const file=[...entries.entries()].find(([name])=>name === '资料提取/'+id+'.json');
    const saved=JSON.parse(file[1].toString());
    expect(saved.records[0]).toMatchObject({excluded:true,reviews:{f1:{value:'',overridden:true}},cells:[{originalValue:'相机',evidence:[{quote:'相机'}]}]});
    expect(file[1].toString()).not.toContain('temporary body');
    expect(saved.table.dataVersion).toBe(1);
  });
  it('does not consume jobs assigned to another host', async () => {
    const task = await service.createTask('u', opts());
    await state.pool.query('UPDATE data_export_tasks SET host_key=? WHERE id=?', ['0'.repeat(64), task.id]);
    expect(await worker.processTask()).toBe(false);
  });
  it('returns the original receipt even when a newer task is active', async () => {
    const input = opts(),
      first = await service.createTask('u', input);
    await service.cancelTask('u', first.id);
    const next = await service.createTask('u', opts());
    expect(next.id).not.toBe(first.id);
    expect((await service.createTask('u', input)).id).toBe(first.id);
  });
  it('passes the additive schema assertions', async () => {
    const source = await fs.readFile(new URL('../../migrations/schema-assertions.sql', import.meta.url), 'utf8');
    const assertions = source
      .replace(/^--.*$/gm, '')
      .split(';')
      .filter((s) => /^\s*SELECT\s+'data_export_[^']+'\s+AS\s+check_name/i.test(s));
    expect(assertions.length).toBeGreaterThan(0);
    for (const sql of assertions) expect((await state.pool.query(sql))[0]).toEqual([]);
  });
  it('rejects creation when account deletion won the row lock', async () => {
    await state.pool.query("UPDATE user SET role='deleted',del_flag=1 WHERE id='u'");
    await expect(service.createTask('u',opts())).rejects.toMatchObject({code:'DATA_EXPORT_ACCOUNT_UNAVAILABLE'});
  });
  it('does not create empty archives', async () => {
    await state.pool.query("DELETE FROM note WHERE create_by='u'");
    expect(await service.createTask('u', opts())).toEqual({ empty: true });
  });
  it('summarizes only the owner\'s live resources in export scope', async () => {
    await state.pool.query(
      "INSERT INTO bookmark (id,user_id,del_flag) VALUES ('b1','u',0),('b2','u',1),('b3','other',0)",
    );
    await state.pool.query(
      "INSERT INTO files (id,file_name,file_size,create_by,del_flag) VALUES (1,'a.pdf',1000,'u',0),(2,'b.pdf',500,'u',1),(3,'c.pdf',9,'other',0)",
    );
    expect(await service.exportSummary('u')).toEqual({
      notes: 1,
      bookmarks: 1,
      files: 1,
      fileBytes: 1000,
      lastBackup: null,
    });
  });
  it('records each successful backup and notifies once per outcome', async () => {
    const outcome = await import('./outcome.js');
    const first = await service.createTask('u', opts());
    await worker.processTask();
    const latest = await service.latestTask('u');
    expect(latest.archiveBytes).toBeGreaterThan(0);
    let summary = await service.exportSummary('u');
    expect(summary.lastBackup).toMatchObject({ total: 1, types: ['notes'], status: 'completed', count: 1 });
    expect(state.notify).toHaveBeenCalledTimes(1);
    expect(state.notify.mock.calls[0][1]).toMatchObject({
      id: outcome.exportOutcomeNoticeId(first.id, 'completed'),
      type: 'system',
      link: '/settings?section=export',
    });
    await service.createTask('u', opts());
    await worker.processTask();
    summary = await service.exportSummary('u');
    expect(summary.lastBackup.count).toBe(2);
    const [[row]] = await state.pool.query("SELECT JSON_EXTRACT(preferences,'$.dataBackup.count') AS count FROM user WHERE id='u'");
    expect(Number(row.count)).toBe(2);
  });
  it('sends one backup reminder to accounts with enough of their own records and no backup', async () => {
    const nudge = await import('./nudge.js');
    for (let i = 0; i < 49; i++)
      await state.pool.query("INSERT INTO note (id,title,content,type,create_by) VALUES (?, 't', '', 'html', 'u')", ['extra-' + i]);
    // 新手示例不计入门槛：只有 49 + 1 条自己的笔记时恰好达到 50。
    await state.pool.query("INSERT INTO bookmark (id,user_id) VALUES ('seed-b','u')");
    await state.pool.query("INSERT INTO onboarding_seed_resources VALUES ('u','bookmark','seed-b')");
    expect(await nudge.sendDataBackupNudges()).toBe(1);
    expect(state.notify.mock.calls[0][0]).toBe('u');
    expect(state.notify.mock.calls[0][1]).toMatchObject({ id: nudge.dataBackupNudgeId('u'), title: '给你的 51 条资料做个备份' });
    expect(await nudge.sendDataBackupNudges()).toBe(0);

    await state.pool.query("DELETE FROM notification");
    await state.pool.query("DELETE FROM note WHERE id='extra-0'");
    expect(await nudge.sendDataBackupNudges()).toBe(0);
  });
  it('skips reminders after a backup or when in-app notifications are off', async () => {
    const nudge = await import('./nudge.js');
    for (let i = 0; i < 60; i++)
      await state.pool.query("INSERT INTO note (id,title,content,type,create_by) VALUES (?, 't', '', 'html', 'u')", ['many-' + i]);
    await state.pool.query(`UPDATE user SET preferences='{"notificationsInApp": false}' WHERE id='u'`);
    expect(await nudge.sendDataBackupNudges()).toBe(0);
    await state.pool.query(`UPDATE user SET preferences='{"dataBackup": {"at": "2026-10-30T00:00:00.000Z"}}' WHERE id='u'`);
    expect(await nudge.sendDataBackupNudges()).toBe(0);
  });
});

function readZip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = new Map();
      zip.on('error', reject);
      zip.on('end', () => resolve(entries));
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => {
          if (e) return reject(e);
          const chunks = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('error', reject);
          stream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}
