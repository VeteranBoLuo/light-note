import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./cloudFileDeletionService.js', () => ({ softDeleteOwnedCloudFiles: vi.fn() }));
const { reorderOwnedCloudFolders } = await import('./cloudFolderTreeService.js');
const socketPath = process.env.API_SORT_MYSQL_SOCKET;

describe.skipIf(!socketPath)('文件夹排序分块写入（隔离 MySQL）', () => {
  const schema = `api_folder_sort_test_${randomUUID().replaceAll('-', '')}`;
  let admin, db;
  let created = false;
  beforeAll(async () => {
    if (!socketPath.startsWith('/tmp/') && !socketPath.startsWith('/private/tmp/')) throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 2 });
    await db.query('CREATE TABLE user (id varchar(64) PRIMARY KEY)');
    await db.query("INSERT INTO user VALUES ('owner'),('other')");
    await db.query('CREATE TABLE folders (id bigint PRIMARY KEY,name varchar(64),create_by varchar(64),parent_id bigint,sort int,del_flag int,create_time datetime)');
    await db.query('CREATE TABLE fixture_fault (id bigint)');
    await db.query(`CREATE TRIGGER fail_sort BEFORE UPDATE ON folders FOR EACH ROW BEGIN
      IF NEW.sort<>OLD.sort AND EXISTS(SELECT 1 FROM fixture_fault WHERE id=NEW.id)
      THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'; END IF; END`);
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    await db.query('DELETE FROM fixture_fault');
    await db.query('DELETE FROM folders');
    const rows = Array.from({ length: 450 }, (_, i) => [i + 1, 'Folder '+i, 'owner', null, i, 0, '2026-09-01']);
    rows.push([500, 'Nested', 'owner', 1, 7, 0, '2026-09-01'], [600, 'Foreign', 'other', null, 0, 0, '2026-09-01']);
    await db.query('INSERT INTO folders VALUES ?', [rows]);
  });
  const read = async () => (await db.query('SELECT * FROM folders ORDER BY id'))[0];
  const items = () => Array.from({ length: 450 }, (_, i) => ({ id: 450 - i }));
  it('450个完整同级目录分三块排序，仅改变该层sort，保留子目录和其他账号数据', async () => {
    const before = await read();
    expect(await reorderOwnedCloudFolders({ userId: 'owner', items: items(), database: db })).toEqual({
      parentId: null, items: items().map(({ id }) => String(id)),
    });
    expect(await read()).toEqual(before.map((row) => ({ ...row, sort: row.id <= 450 ? 450 - row.id : row.sort })));
  });
  it('缺项或混入子目录仍拒绝且整表不变', async () => {
    const before = await read();
    for (const input of [[{ id: 1 }], [...items().slice(1), { id: 500 }]]) {
      await expect(reorderOwnedCloudFolders({ userId: 'owner', items: input, database: db })).rejects.toMatchObject({ code: 'FOLDER_SORT_INVALID' });
      expect(await read()).toEqual(before);
    }
  });
  it('第二块更新失败时第一块的排序完整回滚', async () => {
    const before = await read();
    await db.query('INSERT INTO fixture_fault VALUES (100)');
    await expect(reorderOwnedCloudFolders({ userId: 'owner', items: items(), database: db })).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
    expect(await read()).toEqual(before);
  });
});
