import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordResourceReuse } from './resourceReuseService.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('资料再次使用真实 MySQL', () => {
  const schema = `reuse_test_${randomUUID().replaceAll('-', '')}`;
  let admin,
    db,
    created = false;
  const run = (resourceType, resourceId, userId = 'owner') =>
    recordResourceReuse(userId, { resourceType, resourceId }, { db });
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    await admin.query(`USE ${schema}`);
    for (const sql of [
      'CREATE TABLE user (id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY, role VARCHAR(32), del_flag INT)',
      'CREATE TABLE note (id VARCHAR(255) PRIMARY KEY, create_by VARCHAR(255), create_time DATETIME, del_flag VARCHAR(255)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
      'CREATE TABLE bookmark (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255), create_time DATETIME, del_flag INT) CHARACTER SET utf8 COLLATE utf8_general_ci',
      'CREATE TABLE files (id INT PRIMARY KEY, create_by VARCHAR(255), create_time DATETIME, del_flag INT) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
      'CREATE TABLE onboarding_seed_resources (user_id VARBINARY(255), resource_type VARCHAR(32), resource_id VARBINARY(255), PRIMARY KEY(user_id,resource_type,resource_id))',
    ])
      await admin.query(sql);
    const migration = (await readFile(new URL('../../migrations/20260914_resource_reuse.sql', import.meta.url), 'utf8'))
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .filter((sql) => sql.trim());
    for (let pass = 0; pass < 2; pass++) for (const sql of migration) await admin.query(sql);
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 4 });
    db.on('connection', (c) => {
      c.query("SET SESSION time_zone='+08:00'");
      c.query("SET timestamp=UNIX_TIMESTAMP('2026-09-14 00:00:01')");
    });
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    for (const table of ['resource_reuse_milestones', 'user', 'note', 'bookmark', 'files', 'onboarding_seed_resources'])
      await admin.query(`DELETE FROM ${table}`);
    await admin.query(
      "INSERT INTO user VALUES ('owner','user',0),('other','user',0),('disabled','user',1),('internal','root',0)",
    );
    await admin.query(`INSERT INTO note VALUES
      ('old','owner','2026-09-13 23:59:59','0'),('today','owner','2026-09-14 00:00:00','0'),
      ('foreign','other','2026-09-13 23:59:59','0'),('deleted','owner','2026-09-13 23:59:59','1'),
      ('seed','owner','2026-09-13 23:59:59','0')`);
    await admin.query("INSERT INTO bookmark VALUES ('b','owner','2026-09-12 12:00:00',0)");
    await admin.query("INSERT INTO files VALUES (12,'owner','2026-09-12 12:00:00',0)");
    await admin.query("INSERT INTO onboarding_seed_resources VALUES ('owner','note','seed')");
  });
  it('午夜边界、示例、删除、归属和账号状态均使用权威数据', async () => {
    for (const id of ['today', 'foreign', 'deleted', 'seed', 'missing'])
      expect(await run('note', id)).toEqual({ accepted: false });
    for (const owner of ['disabled', 'internal', 'missing'])
      expect(await run('note', 'old', owner)).toEqual({ accepted: false });
    expect(await run('note', 'old')).toEqual({ accepted: true });
    const [rows] = await admin.query(
      'SELECT user_id, resource_type, DATE_FORMAT(first_opened_at,"%Y-%m-%d %H:%i:%s") AS t FROM resource_reuse_milestones',
    );
    expect(rows).toEqual([{ user_id: 'owner', resource_type: 'note', t: '2026-09-14 00:00:01' }]);
  });
  it('并发打开只记一次，每账号最多三类里程碑，不留内容身份', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => run('note', 'old')));
    expect(results.every((r) => r.accepted)).toBe(true);
    expect(await run('bookmark', 'b')).toEqual({ accepted: true });
    expect(await run('file', 12)).toEqual({ accepted: true });
    expect((await admin.query('SELECT COUNT(*) AS n FROM resource_reuse_milestones'))[0][0].n).toBe(3);
    const [columns] = await admin.query('SHOW COLUMNS FROM resource_reuse_milestones');
    expect(columns.map((c) => c.Field)).toEqual(['user_id', 'resource_type', 'first_opened_at']);
  });
  it('建表不伪造覆盖起点，Schema 断言通过且能发现缺失索引', async () => {
    expect(
      (await admin.query('SELECT started_at FROM resource_reuse_metadata WHERE id=1'))[0][0].started_at,
    ).toBeNull();
    const assertions = (await readFile(new URL('../../migrations/schema-assertions.sql', import.meta.url), 'utf8'))
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .filter((sql) => sql.includes('[resource-reuse]'));
    expect(assertions).toHaveLength(4);
    for (const sql of assertions) expect((await admin.query(sql))[0]).toEqual([]);
    await admin.query('ALTER TABLE resource_reuse_milestones DROP INDEX idx_reuse_user_time');
    try {
      expect((await admin.query(assertions[1]))[0]).toHaveLength(1);
    } finally {
      await admin.query('ALTER TABLE resource_reuse_milestones ADD INDEX idx_reuse_user_time(user_id,first_opened_at)');
    }
  });
});
