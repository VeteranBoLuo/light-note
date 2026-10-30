import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FREQUENT_BOOKMARKS_SQL } from './frequentBookmarkService.js';

// 生产 SQL 跑在与线上一致的混合字符集上：日志列为 utf8，书签名为 utf8mb4。
// Explicit temporary local socket only; never load application credentials.
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `frequent_bookmarks_test_${randomUUID().replaceAll('-', '')}`;
let db;
let created = false;

const clicks = (user, operation, times) => Array.from({ length: times }, () => [randomUUID(), user, operation]);

describe.skipIf(!socketPath)('高频书签真实 SQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    db = await mysql.createConnection({ socketPath, user: 'root' });
    await db.query(`CREATE DATABASE ${schema}`);
    created = true;
    await db.query(`USE ${schema}`);
    await db.query(`CREATE TABLE bookmark (
      id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY,
      user_id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci,
      name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
      url VARCHAR(1024), del_flag INT DEFAULT 0, KEY fk_bookmark_user_id (user_id)
    )`);
    await db.query(`CREATE TABLE operation_logs (
      id VARCHAR(255) PRIMARY KEY, create_by VARCHAR(255), operation VARCHAR(255)
    ) CHARACTER SET utf8 COLLATE utf8_general_ci`);
    await db.query('INSERT INTO bookmark (id, user_id, name, url, del_flag) VALUES ?', [
      [
        ['b-new', 'owner', '轻笺', 'https://boluo66.top', 0],
        ['b-inner', 'owner', '【教程】Vue', 'https://vuejs.org', 0],
        ['b-legacy', 'owner', 'Github', 'https://github.com', 0],
        ['b-deleted', 'owner', '旧站', 'https://old.example', 1],
        ['b-other', 'other', '轻笺', 'https://other.example', 0],
      ],
    ]);
    await db.query('INSERT INTO operation_logs (id, create_by, operation) VALUES ?', [
      [
        ...clicks('owner', '点击书签卡片【轻笺】', 5),
        ...clicks('owner', '点击书签卡片【【教程】Vue】', 4),
        ...clicks('owner', '点击书签卡片Github', 2),
        ...clicks('owner', '点击书签卡片【Github】', 1),
        ...clicks('owner', '点击书签卡片【旧站】', 9),
        ...clicks('owner', '点击书签卡片【改名前】', 7),
        ...clicks('owner', '查看近期笔记【轻笺】', 6),
        ...clicks('other', '点击书签卡片【Github】', 8),
      ],
    ]);
  });
  afterAll(async () => {
    if (created) await db.query(`DROP DATABASE ${schema}`);
    await db?.end();
  });

  it('兼容新旧日志格式，只剥外层括号，并合并同一书签的两种记录', async () => {
    const [rows] = await db.query(FREQUENT_BOOKMARKS_SQL, ['owner', 'owner']);
    expect(rows.map((row) => [row.id, row.name, row.url, Number(row.count)])).toEqual([
      ['b-new', '轻笺', 'https://boluo66.top', 5],
      ['b-inner', '【教程】Vue', 'https://vuejs.org', 4],
      ['b-legacy', 'Github', 'https://github.com', 3],
    ]);
  });

  it('已删除、改名后对不上的书签和其他账号的点击都不计入', async () => {
    const [rows] = await db.query(FREQUENT_BOOKMARKS_SQL, ['other', 'other']);
    expect(rows).toEqual([]);
    const [owner] = await db.query(FREQUENT_BOOKMARKS_SQL, ['owner', 'owner']);
    expect(owner.map((row) => row.id)).not.toContain('b-deleted');
    expect(owner.map((row) => row.id)).not.toContain('b-other');
  });
});
