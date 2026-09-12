import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// common.js 会导入整个路由图；这里只隔离响应工具，排序与事务使用真实实现。
vi.mock('../util/common.js', async () => ({
  ...(await import('../util/agent/data.js')),
  L: (_req, zh) => zh,
  mergeExistingProperties: (value) => value,
}));
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/index.js', () => ({
  default: { query: (...args) => state.db.query(...args), getConnection: () => state.db.getConnection() },
}));
const { updateNoteSort } = await import('./noteLibraryHandle.js');
const socketPath = process.env.API_SORT_MYSQL_SOCKET;

describe.skipIf(!socketPath)('笔记批量排序（隔离 MySQL）', () => {
  const schema = `api_sort_test_${randomUUID().replaceAll('-', '')}`;
  let admin;
  let created = false;
  beforeAll(async () => {
    if (!socketPath.startsWith('/tmp/') && !socketPath.startsWith('/private/tmp/')) {
      throw new Error('Temporary local MySQL socket required');
    }
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    state.db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 2 });
    await state.db.query(`CREATE TABLE note (
      id varchar(255) COLLATE utf8mb4_unicode_ci PRIMARY KEY, create_by varchar(255), parent_id varchar(255),
      del_flag varchar(255), sort int NOT NULL, update_time datetime, revision bigint, title varchar(255), content text
    )`);
  });
  afterAll(async () => {
    await state.db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    await state.db.query('DELETE FROM note');
    await state.db.query(`INSERT INTO note VALUES
      ('a','owner',NULL,'0',0,'2026-09-01 12:00:00',3,'A','body A'),
      ('b','owner',NULL,'0',0,'2026-09-01 12:00:00',4,'B','body B'),
      ('child','owner','a','0',0,'2026-09-01 12:00:00',5,'Child','body C'),
      ('foreign','other',NULL,'0',0,'2026-09-01 12:00:00',6,'Other','body D')`);
  });
  const read = async () => (await state.db.query('SELECT * FROM note ORDER BY id'))[0];
  async function call(body) {
    const res = { send: vi.fn() };
    await updateNoteSort({ user: { id: 'owner', role: 'user' }, body, headers: {} }, res);
    return res.send.mock.calls.at(-1)[0];
  }
  it('同目录批量排序仅改变指定行的 sort，正文、时间与版本完全保留', async () => {
    const before = await read();
    expect((await call({ notes: [{ id: 'a', sort: 8 }, { id: 'b', sort: 2 }] })).status).toBe(200);
    expect(await read()).toEqual(before.map((row) => ({ ...row, sort: row.id === 'a' ? 8 : row.id === 'b' ? 2 : 0 })));
  });
  it.each([
    [[{ id: 'a', sort: 1 }, { id: 'foreign', sort: 2 }], 404],
    [[{ id: 'a', sort: 1 }, { id: 'child', sort: 2 }], 409],
    [[{ id: 'a', sort: 1 }, { id: 'a', sort: 2 }], 400],
  ])('拒绝不合法范围且整表不变 %#', async (notes, status) => {
    const before = await read();
    expect((await call({ notes })).status).toBe(status);
    expect(await read()).toEqual(before);
  });
  it('写入溢出时完整回滚，不能只保存部分排序', async () => {
    const before = await read();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await call({ notes: [{ id: 'a', sort: 1 }, { id: 'b', sort: 2147483648 }] })).status).toBe(500);
      expect(await read()).toEqual(before);
    } finally {
      log.mockRestore();
    }
  });
});
