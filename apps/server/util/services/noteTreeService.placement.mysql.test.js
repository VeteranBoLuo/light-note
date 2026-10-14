import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../common.js', async () => ({ ...(await import('../agent/data.js')), L: (_req, zh) => zh }));
const { prepareOwnedNotePlacement, buildNoteTree, getNoteTreeChildren } = await import('./noteTreeService.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;

describe.skipIf(!socketPath)('新建位置与旧笔记保真（隔离 MySQL）', () => {
  const schema = `note_placement_${randomUUID().replaceAll('-', '')}`;
  let admin,
    db,
    created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 4 });
    await db.query('CREATE TABLE user (id varchar(64) PRIMARY KEY, preferences text)');
    await db.query(`CREATE TABLE note (id varchar(64) PRIMARY KEY, create_by varchar(64), parent_id varchar(64),
      title varchar(64), type varchar(20) DEFAULT 'html', revision bigint DEFAULT 7, sort int NOT NULL,
      is_top int DEFAULT 0, del_flag int DEFAULT 0, update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      tree_delete_batch_id varchar(64), content text, INDEX owner_idx(create_by))`);
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
    await db.query('DELETE FROM user');
    await db.query("INSERT INTO user VALUES ('owner',NULL),('other',NULL)");
  });
  const setPreference = (value) => db.query('UPDATE user SET preferences=? WHERE id=?', [value, 'owner']);
  const read = async () => (await db.query('SELECT * FROM note ORDER BY id'))[0];
  const order = async (parent = null, owner = 'owner') =>
    (
      await db.query(
        'SELECT id FROM note WHERE create_by=? AND parent_id <=> ? AND del_flag=0 ORDER BY is_top DESC,sort,update_time DESC,id DESC',
        [owner, parent],
      )
    )[0].map((r) => r.id);
  const seed = async (id, sort, parent = null, pin = 0, owner = 'owner') =>
    db.query(
      "INSERT INTO note (id,create_by,parent_id,title,sort,is_top,content,update_time) VALUES (?,?,?,?,?,?,?,'2026-09-01 12:00:00')",
      [id, owner, parent, id, sort, pin, `Body ${id}`],
    );
  async function create(id, parentId = null, batchNoteIds = []) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const placement = await prepareOwnedNotePlacement(connection, {
        userId: 'owner',
        parentId,
        noteId: id,
        batchNoteIds,
        shareExposureAcknowledged: true,
      });
      await connection.query('INSERT INTO note (id,create_by,parent_id,title,sort) VALUES (?,?,?,?,?)', [
        id,
        'owner',
        placement.parentId,
        id,
        placement.sort,
      ]);
      await connection.commit();
      return placement;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  }
  const withoutSort = (rows) => rows.map(({ sort, ...row }) => row);

  it('修改偏好不动旧笔记，顶部/底部插入仅影响落点；置顶、跨目录及正文时间版本保留', async () => {
    await seed('parent', 0);
    await seed('a', 0, 'parent');
    await seed('b', 1, 'parent');
    await seed('pin', 0, 'parent', 1);
    await seed('foreign', 0, null, 0, 'other');
    const before = await read();
    await setPreference('{"noteCreatePosition":"top"}');
    expect(await read()).toEqual(before);
    await create('d', 'parent');
    expect(await order('parent')).toEqual(['pin', 'd', 'a', 'b']);
    expect(withoutSort((await read()).filter((r) => r.id !== 'd'))).toEqual(withoutSort(before));
    const afterTop = await read();
    await setPreference('{"noteCreatePosition":"bottom"}');
    expect(await read()).toEqual(afterTop);
    await create('e', 'parent');
    expect(await order('parent')).toEqual(['pin', 'd', 'a', 'b', 'e']);
  });
  it.each([null, '{}', '{invalid', '{"noteCreatePosition":"unknown"}'])('缺失或无效偏好默认底部：%s', async (value) => {
    await setPreference(value);
    await seed('a', 3);
    await seed('b', 10);
    const before = await read();
    expect((await create('new')).sort).toBe(11);
    expect((await read()).filter((r) => r.id !== 'new')).toEqual(before);
  });
  it('旧排序有重复值时，顶部插入保持原有相对顺序', async () => {
    await seed('a', 0);
    await seed('b', 0);
    await seed('c', 4);
    const originalOrder = await order();
    await setPreference('{"noteCreatePosition":"top"}');
    await create('new');
    expect(await order()).toEqual(['new', ...originalOrder]);
  });
  it('批次连续创建及失败重试保留顺序，偏好改变不倒置已开始批次', async () => {
    await seed('old', 0);
    await setPreference('{"noteCreatePosition":"top"}');
    const batch = ['first', 'second', 'third'];
    await create('second', null, batch);
    await setPreference('{"noteCreatePosition":"bottom"}');
    await create('third', null, batch);
    await create('first', null, batch);
    expect(await order()).toEqual(['first', 'second', 'third', 'old']);
  });
  it('已移到别处或被置顶的批次项不被移动，其他账号不能成为锚点', async () => {
    await seed('parent', 0);
    await seed('first', 0, 'parent');
    await seed('pinned', 0, null, 1);
    await seed('foreign', 0, null, 0, 'other');
    await seed('old', 1);
    const before = await read();
    await setPreference('{"noteCreatePosition":"top"}');
    await create('new', null, ['first', 'pinned', 'foreign', 'new']);
    expect(await order()).toEqual(['pinned', 'new', 'parent', 'old']);
    expect(withoutSort((await read()).filter((r) => r.id !== 'new'))).toEqual(withoutSort(before));
  });
  it.each(['top', 'bottom'])('空目录并发创建与连续创建不会重复位置：%s', async (position) => {
    await setPreference(JSON.stringify({ noteCreatePosition: position }));
    await Promise.all(['a', 'b', 'c'].map((id) => create(id)));
    const before = await order();
    await create('d');
    expect(await order()).toEqual(position === 'top' ? ['d', ...before] : [...before, 'd']);
    const rows = await read();
    expect(new Set(rows.map((r) => r.sort)).size).toBe(4);
  });
  it('根层恢复展示的孤儿及环节点保留相对顺序与原父级', async () => {
    await seed('regular', 0);
    await seed('orphan', 1, 'missing');
    await seed('cycle-a', 2, 'cycle-b');
    await seed('cycle-b', 3, 'cycle-a');
    const before = await read();
    const rootIds = (rows) => getNoteTreeChildren(buildNoteTree(rows)).map((node) => node.id);
    await setPreference('{"noteCreatePosition":"top"}');
    await create('new');
    const after = await read();
    expect(rootIds(after)).toEqual(['new', ...rootIds(before)]);
    expect(withoutSort(after.filter((row) => row.id !== 'new'))).toEqual(withoutSort(before));
  });
  it('排序整数已到上界时收口但保持顺序', async () => {
    await seed('a', 2147483647);
    await create('new');
    expect(await order()).toEqual(['a', 'new']);
  });
  it('分块腾位置中途失败时全部回滚，没有旧笔记顺序或内容变化', async () => {
    const rows = Array.from({ length: 650 }, (_, i) => [`n${i}`, 'owner', i, '2026-09-01 12:00:00']);
    await db.query('INSERT INTO note (id,create_by,sort,update_time) VALUES ?', [rows]);
    await setPreference('{"noteCreatePosition":"top"}');
    await db.query("INSERT INTO fixture_fault VALUES ('n600')");
    const before = await read();
    await expect(create('new')).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
    expect(await read()).toEqual(before);
  });
});
