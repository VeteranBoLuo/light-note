import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ARCHIVE_JOB_SCHEMA, getBookmarkArchiveStatus } from './bookmarkArchiveJobs.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('书签正文恢复入口真实 MySQL', () => {
  const schema = `archive_status_${randomUUID().replaceAll('-', '')}`;
  let db,
    created = false;
  const read = (id = 'b', user = 'owner') => getBookmarkArchiveStatus(user, id, { db });
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    db = await mysql.createConnection({ socketPath, user: 'root' });
    const [[server]] = await db.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
    await db.query(`CREATE DATABASE ${schema}`);
    created = true;
    await db.query(`USE ${schema}`);
    // Match the legacy bookmark charset and the newer archive-job charset.
    await db.query(`CREATE TABLE bookmark (
      id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), url VARCHAR(2048), del_flag INT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`);
    await db.query(ARCHIVE_JOB_SCHEMA);
  });
  afterAll(async () => {
    if (created) await db.query(`DROP DATABASE ${schema}`);
    await db?.end();
  });
  beforeEach(async () => {
    await db.query('DELETE FROM bookmark_archive_jobs');
    await db.query('DELETE FROM bookmark');
    await db.query(`INSERT INTO bookmark VALUES
      ('b','owner','https://example.com/article',0),
      ('foreign','other','https://example.com/private',0),
      ('deleted','owner','https://example.com/deleted',1)`);
  });
  it('没有存档或任务时仍返回当前书签网址', async () => {
    expect(await read()).toEqual({ bookmarkUrl: 'https://example.com/article', archiveTask: null, failedCount: 0 });
  });
  it('不同字符集正确关联失败任务，并返回稳定原因与重试分类', async () => {
    await db.query(`INSERT INTO bookmark_archive_jobs (bookmark_id,user_id,url,status,attempts,reason_code)
      VALUES ('b','owner','https://example.com/article','failed',3,'TIMEOUT')`);
    expect(await read()).toMatchObject({
      bookmarkUrl: 'https://example.com/article',
      failedCount: 1,
      archiveTask: { status: 'failed', attempts: 3, reason_code: 'TIMEOUT', retryable: true },
    });
    await db.query("UPDATE bookmark_archive_jobs SET reason_code='AUTH_REQUIRED'");
    expect((await read()).archiveTask).toMatchObject({ reason_code: 'AUTH_REQUIRED', retryable: false });
  });
  it('网址变更后不展示旧网址任务，但保留当前网址（路径大小写敏感）', async () => {
    await db.query(`INSERT INTO bookmark_archive_jobs (bookmark_id,user_id,url,status,reason_code)
      VALUES ('b','owner','https://example.com/Article','failed','ACCESS_DENIED')`);
    expect(await read()).toMatchObject({ bookmarkUrl: 'https://example.com/article', archiveTask: null });
    await db.query("UPDATE bookmark SET url='https://example.com/new' WHERE id='b'");
    expect(await read()).toMatchObject({ bookmarkUrl: 'https://example.com/new', archiveTask: null });
  });
  it('不存在、他人和已删除书签均不返回网址或任务', async () => {
    await db.query(`INSERT INTO bookmark_archive_jobs (bookmark_id,user_id,url,status,reason_code)
      VALUES ('deleted','owner','https://example.com/deleted','failed','TIMEOUT'),
      ('foreign','other','https://example.com/private','failed','AUTH_REQUIRED')`);
    for (const id of ['missing', 'foreign', 'deleted'])
      expect(await read(id)).toEqual({ bookmarkUrl: null, archiveTask: null, failedCount: 0 });
    expect(await read('b', 'other')).toMatchObject({ bookmarkUrl: null, archiveTask: null });
  });
});
