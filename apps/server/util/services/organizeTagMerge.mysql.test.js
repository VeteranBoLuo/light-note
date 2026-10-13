import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mergeOwnedTags, prepareTagMergeProposal, readTagMergeCandidates } from './organizeTagMerge.js';
const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `tag_merge_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socket)('标签合并 (isolated MySQL)', () => {
  let admin,
    db,
    created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = await mysql.createConnection({ socketPath: socket, user: 'root', database: schema });
    await db.query(
      'CREATE TABLE organize_suggestion_items (run_id VARCHAR(36),user_id VARCHAR(255),resource_type VARCHAR(20),resource_id VARCHAR(255)) ENGINE=InnoDB',
    );
    await db.query(
      'CREATE TABLE tag (id VARCHAR(255) PRIMARY KEY,user_id VARCHAR(255),name VARCHAR(255),description VARCHAR(500),icon_url TEXT,del_flag INT DEFAULT 0) ENGINE=InnoDB',
    );
    await db.query(
      'CREATE TABLE resource_tag_relations (tag_id VARCHAR(255),resource_type VARCHAR(20),resource_id VARCHAR(255),user_id VARCHAR(255),source VARCHAR(30),PRIMARY KEY(tag_id,resource_type,resource_id),FOREIGN KEY(tag_id) REFERENCES tag(id) ON DELETE CASCADE) ENGINE=InnoDB',
    );
    await db.query(
      'CREATE TABLE todo_tag_relations (tag_id VARCHAR(255),target_type VARCHAR(20),target_id VARCHAR(255),user_id VARCHAR(255),PRIMARY KEY(target_type,target_id,tag_id),FOREIGN KEY(tag_id) REFERENCES tag(id) ON DELETE CASCADE) ENGINE=InnoDB',
    );
    await db.query(
      'CREATE TABLE collection_form_tags (id VARCHAR(36) PRIMARY KEY,form_id VARCHAR(36),tag_id VARCHAR(255),user_id VARCHAR(255),UNIQUE(form_id,tag_id)) ENGINE=InnoDB',
    );
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    for (const table of [
      'resource_tag_relations',
      'todo_tag_relations',
      'collection_form_tags',
      'tag',
      'organize_suggestion_items',
    ])
      await db.query(`DELETE FROM ${table}`);
    await db.query(
      "INSERT INTO tag(id,user_id,name,description,icon_url) VALUES ('a','u','JavaScript','语言',''),('b','u','JS','开发笔记','source-icon'),('x','other','JS','','')",
    );
    await db.query(
      "INSERT INTO resource_tag_relations VALUES ('a','note','n','u','manual'),('b','note','n','u','manual'),('b','file','trashed-file','u','manual'),('b','bookmark','bookmark','u','manual'),('x','note','other-note','other','manual')",
    );
    await db.query(
      "INSERT INTO todo_tag_relations VALUES ('a','todo','todo','u'),('b','todo','todo','u'),('b','series','series','u')",
    );
    await db.query("INSERT INTO collection_form_tags VALUES ('f1','form','a','u'),('f2','form','b','u')");
  });
  const proposal = () =>
    prepareTagMergeProposal(
      db,
      'u',
      { id: 'b', title: 'JS', description: '开发笔记' },
      { targetId: 'a', targetName: 'JavaScript', targetDescription: '语言' },
    );
  const apply = async (p, value = { confirmMerge: true, targetId: 'a' }) => {
    await db.beginTransaction();
    try {
      const result = await mergeOwnedTags(db, { userId: 'u', sourceId: 'b', proposal: p, value });
      await db.commit();
      return result;
    } catch (error) {
      await db.rollback();
      throw error;
    }
  };
  it('候选读取只比较当前账号冻结范围，数据库字符集兼容', async () => {
    await db.query(
      "INSERT INTO organize_suggestion_items VALUES ('run','u','tag','a'),('run','u','tag','b'),('run','other','tag','x'),('other-run','u','tag','a')",
    );
    expect(await readTagMergeCandidates(db, 'u', 'run', 'b')).toEqual([
      { id: 'a', name: 'JavaScript', description: '语言' },
    ]);
  });
  it('合并三类资料、待办、系列和表单关联并去重，保留回收站恢复关系与标签说明', async () => {
    const p = await proposal();
    expect(p.associationCount).toBe(6);
    expect(await apply(p)).toMatchObject({ deleted: true, applied: { targetId: 'a', associationCount: 6 } });
    expect((await db.query("SELECT name,description,icon_url FROM tag WHERE id='a'"))[0][0]).toEqual({
      name: 'JavaScript',
      description: '语言\n开发笔记',
      icon_url: 'source-icon',
    });
    expect((await db.query("SELECT * FROM tag WHERE id='b'"))[0]).toHaveLength(0);
    expect((await db.query("SELECT * FROM resource_tag_relations WHERE tag_id='a'"))[0]).toHaveLength(3);
    expect((await db.query("SELECT * FROM todo_tag_relations WHERE tag_id='a'"))[0]).toHaveLength(2);
    expect((await db.query("SELECT * FROM collection_form_tags WHERE tag_id='a'"))[0]).toHaveLength(1);
    expect((await db.query("SELECT * FROM resource_tag_relations WHERE user_id='other'"))[0]).toHaveLength(1);
  });
  it('源关联新增后拒绝旧预览，目标跨账号也拒绝，且不部分写入', async () => {
    const p = await proposal();
    await db.query("INSERT INTO resource_tag_relations VALUES ('b','note','new','u','manual')");
    await expect(apply(p)).rejects.toMatchObject({ code: 'ORGANIZE_RESOURCE_CHANGED' });
    const fresh = await proposal();
    await expect(
      apply(
        { ...fresh, targetId: 'x', targetName: 'JS', targetDescription: '' },
        { confirmMerge: true, targetId: 'x' },
      ),
    ).rejects.toMatchObject({ code: 'ORGANIZE_RESOURCE_CHANGED' });
    expect((await db.query("SELECT * FROM resource_tag_relations WHERE tag_id='b'"))[0]).toHaveLength(4);
  });
  it('拒绝未确认、目标改名及说明溢出；保留全部原关系', async () => {
    const p = await proposal();
    await expect(apply(p, {})).rejects.toMatchObject({ code: 'ORGANIZE_MERGE_CONFIRM_REQUIRED' });
    await db.query("UPDATE tag SET name='Java' WHERE id='a'");
    await expect(apply(p)).rejects.toMatchObject({ code: 'ORGANIZE_RESOURCE_CHANGED' });
    await db.query("UPDATE tag SET name='JavaScript',description=? WHERE id='a'", ['文'.repeat(500)]);
    await expect(apply({ ...p, targetDescription: '文'.repeat(500) })).rejects.toThrow('500');
    expect((await db.query("SELECT * FROM todo_tag_relations WHERE tag_id='b'"))[0]).toHaveLength(2);
  });
});
