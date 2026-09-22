import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import yauzl from 'yauzl';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ pool: null }));
vi.mock('../../db/index.js', () => ({
  default: { query: (...a) => state.pool.query(...a), getConnection: (...a) => state.pool.getConnection(...a) },
}));
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
    await state.pool.query("CREATE TABLE user (id VARCHAR(128) PRIMARY KEY,role VARCHAR(24) DEFAULT 'user',del_flag INT DEFAULT 0)");
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
    service = await import('./service.js');
    worker = await import('./worker.js');
    storage = await import('./storage.js');
  });
  beforeEach(async () => {
    await state.pool.query("UPDATE user SET role='user',del_flag=0");
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
