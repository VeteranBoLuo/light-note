import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Execute the production SQL against intentionally mixed legacy collations.
// Explicit temporary local socket only; never load application credentials.
const socketPath = process.env.Q01_TEST_MYSQL_SOCKET;
const source = readFileSync(new URL('./workbenchHandle.js', import.meta.url), 'utf8');
const sql = source.slice(source.indexOf('async function queryRecentNotes(')).match(/`([\s\S]*?)`/)[1];
const schema = `q01_recent_test_${randomUUID().replaceAll('-', '')}`;
let db;
let created = false;
describe.skipIf(!socketPath)('最近笔记真实 SQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    db = await mysql.createConnection({ socketPath, user: 'root' });
    await db.query(`CREATE DATABASE ${schema}`);
    created = true;
    await db.query(`USE ${schema}`);
    await db.query(`CREATE TABLE note (
      id VARCHAR(255) PRIMARY KEY, title VARCHAR(255), create_by VARCHAR(255),
      del_flag INT DEFAULT 0, sort INT DEFAULT 0, create_time DATETIME, update_time DATETIME,
      KEY owner_active (create_by,del_flag,update_time)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await db.query(`CREATE TABLE resource_tag_relations (
      tag_id VARCHAR(255), resource_type VARCHAR(32), resource_id VARCHAR(255),
      PRIMARY KEY(tag_id,resource_type,resource_id), KEY idx_resource(resource_type,resource_id)
    ) CHARACTER SET utf8 COLLATE utf8_general_ci`);
    const notes = Array.from({ length: 12 }, (_, i) => [
      `note-${String(i).padStart(2, '0')}`,
      `资料${i}`,
      'owner',
      0,
      100 - i,
      '2026-01-01 00:00:00',
      '2026-02-01 00:00:00',
    ]);
    notes.push(['new-null', '创建时间回退', 'owner', 0, 999, '2026-03-01 00:00:00', null]);
    notes.push(['deleted', '删除', 'owner', 1, 0, '2026-04-01 00:00:00', null]);
    notes.push(['other', '别人的资料', 'other', 0, 0, '2026-05-01 00:00:00', null]);
    await db.query('INSERT INTO note VALUES ?', [notes]);
    await db.query('INSERT INTO resource_tag_relations VALUES ?', [
      [
        ['tag-a', 'note', 'note-11'],
        ['tag-b', 'note', 'note-11'],
        ['tag-c', 'file', 'note-11'],
        ['tag-a', 'note', 'note-00'],
      ],
    ]);
  });
  afterAll(async () => {
    if (created) await db.query(`DROP DATABASE ${schema}`);
    await db?.end();
  });
  it('先选最新十篇，按 ID 稳定打破同时间并列，保留零标签并排除删除及其他账号', async () => {
    const [rows] = await db.query(sql, ['owner']);
    expect(rows.map((r) => r.id)).toEqual([
      'new-null',
      ...Array.from({ length: 9 }, (_, i) => `note-${String(11 - i).padStart(2, '0')}`),
    ]);
    expect(rows.map((r) => Number(r.tagCount))).toEqual([0, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rows[0].title).toBe('创建时间回退');
  });
  it('无资料账号返回空结果', async () => {
    expect((await db.query(sql, ['empty']))[0]).toEqual([]);
  });
});
