import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runBookmarkImportTransaction } from './bookmarkImportService.js';

const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `bookmark_import_${randomUUID().replaceAll('-', '')}`;

describe.skipIf(!socket)('Excel 书签描述导入 · 隔离 MySQL', () => {
  let admin,
    db,
    created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    const [[runtime]] = await admin.query('SELECT VERSION() AS version, @@skip_networking AS isolated');
    if (!/^(5\.7\.|8\.)/.test(runtime.version) || Number(runtime.isolated) !== 1)
      throw Error('Isolated MySQL 5.7/8 required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({ socketPath: socket, user: 'root', database: schema });
    await db.query(`CREATE TABLE bookmark (
      id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36), name VARCHAR(255), url VARCHAR(255),
      description VARCHAR(255), del_flag INT NOT NULL DEFAULT 0, url_exact_hash BINARY(32)
    ) ENGINE=InnoDB`);
    await db.query(
      'CREATE TABLE tag (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36), name VARCHAR(255), del_flag INT DEFAULT 0) ENGINE=InnoDB',
    );
    await db.query(`CREATE TABLE resource_tag_relations (
      tag_id VARCHAR(36), resource_type VARCHAR(16), resource_id VARCHAR(36), user_id VARCHAR(36), source VARCHAR(16),
      UNIQUE KEY relation_key (tag_id,resource_type,resource_id,user_id)
    ) ENGINE=InnoDB`);
  });
  afterAll(async () => {
    if (db) await db.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    if (admin) await admin.end();
  });
  beforeEach(async () => {
    await db.query('DELETE FROM resource_tag_relations');
    await db.query('DELETE FROM tag');
    await db.query('DELETE FROM bookmark');
    await db.query('INSERT INTO bookmark(id,user_id,name,url,description) VALUES ?', [
      [
        ['same', 'owner', '原名称', 'https://same.example/Doc', '原描述'],
        ['named', 'owner', '同名', 'https://old.example/', '保留描述'],
        ['empty', 'owner', '空描述', 'https://empty.example/', null],
        ['other', 'other-owner', '其他账号', 'https://same.example/Doc', '其他账号的描述'],
      ],
    ]);
  });
  const run = (items, overwriteDescriptions = true, pool = db) =>
    runBookmarkImportTransaction(pool, { userId: 'owner', items, overwriteDescriptions });
  const read = async (id) => (await db.query('SELECT name,url,description FROM bookmark WHERE id=?', [id]))[0][0];

  it('同网址覆盖最后一条非空描述，保留名称、空白描述和其他账号，重复计一次', async () => {
    const stats = await run([
      { name: '文件名称', url: 'https://same.example/Doc', description: '第一条' },
      { url: 'https://same.example/Doc', description: ' 最后一条 ' },
      { url: 'https://same.example/Doc', description: '\n  ' },
      { url: 'https://empty.example/', description: '' },
    ]);
    expect(stats).toMatchObject({ createdBookmarks: 0, updatedBookmarks: 1 });
    expect(await read('same')).toMatchObject({ name: '原名称', description: '最后一条' });
    expect((await read('empty')).description).toBeNull();
    expect((await read('other')).description).toBe('其他账号的描述');
  });

  it('只在实际值变化时计数，NULL 可补齐，大小写变化不会被数据库排序规则吞掉', async () => {
    await db.query("UPDATE bookmark SET description='ABC' WHERE id='same'");
    expect((await run([{ url: 'https://same.example/Doc', description: 'ABC' }])).updatedBookmarks).toBe(0);
    expect(
      (
        await run([
          { url: 'https://same.example/Doc', description: 'abc' },
          { url: 'https://empty.example/', description: '补齐' },
        ])
      ).updatedBookmarks,
    ).toBe(2);
    expect((await read('same')).description).toBe('abc');
    expect((await read('empty')).description).toBe('补齐');
  });

  it('同名不同网址及路径大小写不同都不覆盖，HTML 默认不更新描述', async () => {
    expect(
      (
        await run([
          { name: '同名', url: 'https://different.example/', description: '不应写入' },
          { name: '原名称', url: 'https://same.example/doc', description: '不应写入' },
        ])
      ).updatedBookmarks,
    ).toBe(0);
    expect((await run([{ url: 'https://same.example/Doc', description: 'HTML 描述' }], false)).updatedBookmarks).toBe(
      0,
    );
    expect((await read('same')).description).toBe('原描述');
    expect((await read('named')).description).toBe('保留描述');
  });

  it('同批新书签重复出现可采用最后的非空描述，只计入新增数量', async () => {
    const stats = await run([
      { name: '新书签', url: 'https://new.example/', description: '第一条' },
      { name: '新书签', url: 'https://new.example/', description: '最后一条' },
    ]);
    expect(stats).toMatchObject({ createdBookmarks: 1, updatedBookmarks: 0 });
    const row = await read(stats.createdBookmarkIds[0]);
    expect(row.description).toBe('最后一条');
  });

  it.each(['url', 'user_id', 'del_flag'])('预加载后 %s 改变，写入时复核并跳过', async (field) => {
    const connection = await db.getConnection();
    const originalQuery = connection.query;
    const query = connection.query.bind(connection);
    let changed = false;
    connection.query = async (sql, params) => {
      if (sql.startsWith('UPDATE bookmark SET description') && !changed) {
        changed = true;
        const next = { url: 'https://changed.example/', user_id: 'other-owner', del_flag: 1 }[field];
        await db.query(`UPDATE bookmark SET ${field}=? WHERE id='same'`, [next]);
      }
      return query(sql, params);
    };
    let stats;
    try {
      stats = await run([{ url: 'https://same.example/Doc', description: '不应写入' }], true, {
        getConnection: async () => connection,
      });
    } finally {
      connection.query = originalQuery;
    }
    expect(stats.updatedBookmarks).toBe(0);
    expect((await read('same')).description).toBe('原描述');
  });

  it('后续描述更新失败时整批回滚，包括已更新描述、新书签及新标签关系', async () => {
    const connection = await db.getConnection();
    const originalQuery = connection.query;
    const query = connection.query.bind(connection);
    connection.query = (sql, params) => {
      if (sql.startsWith('UPDATE bookmark SET description') && params[1] === 'empty') throw Error('fixture failure');
      return query(sql, params);
    };
    try {
      await expect(
        run(
          [
            { name: '新书签', url: 'https://new.example/', tagNames: ['新标签'] },
            { url: 'https://same.example/Doc', description: '应回滚' },
            { url: 'https://empty.example/', description: '触发失败' },
          ],
          true,
          { getConnection: async () => connection },
        ),
      ).rejects.toThrow('fixture failure');
    } finally {
      connection.query = originalQuery;
    }
    expect((await read('same')).description).toBe('原描述');
    for (const table of ['tag', 'resource_tag_relations']) {
      const [[row]] = await db.query(`SELECT COUNT(*) total FROM ${table}`);
      expect(row.total).toBe(0);
    }
    const [[row]] = await db.query("SELECT COUNT(*) total FROM bookmark WHERE name='新书签'");
    expect(row.total).toBe(0);
  });
});
