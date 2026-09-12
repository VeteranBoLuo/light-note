import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../common.js', async () => ({ ...(await import('../agent/data.js')), L: (_req, zh) => zh }));
const { moveOwnedNoteNode, moveOwnedNoteNodes } = await import('./noteTreeService.js');
const socketPath = process.env.API_SORT_MYSQL_SOCKET;

describe.skipIf(!socketPath)('笔记移动分块重排（隔离 MySQL）', () => {
  const schema = `api_move_test_${randomUUID().replaceAll('-', '')}`;
  let admin, db;
  let created = false;
  beforeAll(async () => {
    if (!socketPath.startsWith('/tmp/') && !socketPath.startsWith('/private/tmp/')) throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 2 });
    await db.query(`CREATE TABLE note (id varchar(64) PRIMARY KEY,create_by varchar(64),parent_id varchar(64),
      title varchar(64),type varchar(20),revision bigint,sort int,is_top int,del_flag int,update_time datetime,
      tree_delete_batch_id varchar(64),content text)`);
    await db.query('CREATE TABLE fixture_fault (id varchar(64))');
    await db.query(`CREATE TRIGGER fail_sort BEFORE UPDATE ON note FOR EACH ROW BEGIN
      IF NEW.sort<>OLD.sort AND EXISTS (SELECT 1 FROM fixture_fault WHERE id=NEW.id)
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'; END IF; END`);
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    await db.query('DELETE FROM fixture_fault');
    await db.query('DELETE FROM note');
    const row = (id, parent, sort, owner = 'owner') => [id, owner, parent, id, 'html', 7, sort, 0, 0, '2026-09-01 12:00:00', null, 'Body '+id];
    const rows = Array.from({ length: 650 }, (_, i) => row(`g${i}`, 'parent', i));
    rows.push(row('parent', null, 0), row('nested', 'g649', 0), row('foreign', null, 0, 'other'));
    await db.query('INSERT INTO note VALUES ?', [rows]);
  });
  const read = async () => (await db.query('SELECT * FROM note ORDER BY id'))[0];
  async function move(multiple = false) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const result = multiple
        ? await moveOwnedNoteNodes(connection, { userId: 'owner', ids: ['g0', 'g1'], parentId: 'parent' })
        : await moveOwnedNoteNode(connection, { userId: 'owner', id: 'g649', parentId: 'parent', nextId: 'g0' });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  it('650个兄弟分两块重排，返回准确数量且不修改正文、版本、更新时间和后代', async () => {
    const before = await read();
    expect(await move()).toMatchObject({ moved: true, updatedCount: 650, parentId: 'parent' });
    expect(await read()).toEqual(before.map((row) => ({ ...row,
      sort: row.id === 'g649' ? 0 : /^g\d+$/.test(row.id) ? row.sort + 1 : row.sort,
    })));
  });
  it('第二块发生写入错误时，已移动节点及第一块排序全部回滚', async () => {
    const before = await read();
    await db.query("INSERT INTO fixture_fault VALUES ('g600')");
    await expect(move()).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
    expect(await read()).toEqual(before);
  });
  it('多选移动批量收口兄弟间隙，保留请求顺序、返回计数与全部非排序字段', async () => {
    const before = await read();
    expect(await move(true)).toMatchObject({
      requestedCount: 2, rootCount: 2, movedCount: 2, affectedCount: 2, updatedCount: 650,
      items: [{ id: 'g0', sort: 648 }, { id: 'g1', sort: 649 }],
    });
    expect(await read()).toEqual(before.map((row) => ({ ...row,
      sort: row.id === 'g0' ? 648 : row.id === 'g1' ? 649 : /^g\d+$/.test(row.id) ? row.sort - 2 : row.sort,
    })));
  });
  it('多选移动第二块失败时，所有兄弟排序与移动根节点均保持原状', async () => {
    const before = await read();
    await db.query("INSERT INTO fixture_fault VALUES ('g600')");
    await expect(move(true)).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
    expect(await read()).toEqual(before);
  });

});
