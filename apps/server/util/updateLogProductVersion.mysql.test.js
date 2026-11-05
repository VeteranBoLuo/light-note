import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `update_log_version_${randomUUID().replaceAll('-', '')}`;
const title = '知识庄园开放：资料处理、公开分享与创作体验升级';
const migration = await readFile(
  new URL('../migrations/20261105_update_logs_product_version.sql', import.meta.url),
  'utf8',
);

const assertions = await readFile(new URL('../migrations/schema-assertions.sql', import.meta.url), 'utf8');
const gateStart = assertions.indexOf("SELECT '[update_logs] missing_product_version'");
const versionGate = assertions.slice(gateStart, assertions.indexOf(';', gateStart) + 1);

async function applyMigration(db) {
  let delimiter = ';';
  let buffer = '';
  for (const line of migration.split('\n')) {
    const directive = line.trim().match(/^DELIMITER (\S+)$/);
    if (directive) {
      delimiter = directive[1];
      continue;
    }
    buffer += `${line}\n`;
    if (buffer.trimEnd().endsWith(delimiter)) {
      await db.query(buffer.trimEnd().slice(0, -delimiter.length));
      buffer = '';
    }
  }
  if (buffer.trim()) throw new Error('Incomplete migration statement');
}

describe.skipIf(!socketPath)('更新日志产品版本迁移（隔离 MySQL）', () => {
  let db,
    admin,
    created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Disposable socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = await mysql.createConnection({ socketPath, user: 'root', database: schema, multipleStatements: true });
  });
  beforeEach(async () => {
    await db.query(`DROP TABLE IF EXISTS update_logs;
      CREATE TABLE update_logs (
        id VARCHAR(64) PRIMARY KEY, title VARCHAR(200), publish_date DATE, status VARCHAR(20),
        content_markdown LONGTEXT, updated_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await db.query(
      `INSERT INTO update_logs VALUES
      ('milestone', ?, '2026-10-30', 'published', '原始正文', '2026-10-30 10:00:00'),
      ('older', '新版社区上线', '2026-09-18', 'published', '历史正文', '2026-09-18 10:00:00'),
      ('draft', ?, '2026-10-30', 'draft', '草稿正文', '2026-10-30 11:00:00'),
      ('other', '当天其他更新', '2026-10-30', 'published', '其他正文', '2026-10-30 12:00:00')`,
      [title, title],
    );
  });
  afterAll(async () => {
    await db?.end();
    try {
      if (created) await admin.query(`DROP DATABASE ${schema}`);
    } finally {
      await admin?.end();
    }
  });
  const rows = async () => (await db.query('SELECT * FROM update_logs ORDER BY id'))[0];

  it('只为唯一已发布里程碑补记 1.0.0，保留其他内容、日期与更新时间', async () => {
    const before = await rows();
    expect((await db.query(versionGate))[0]).toHaveLength(1);
    await applyMigration(db);
    expect((await db.query(versionGate))[0]).toEqual([]);
    expect(await rows()).toEqual(
      before.map((row) => ({ ...row, product_version: row.id === 'milestone' ? '1.0.0' : null })),
    );
    const [columns] = await db.query("SHOW COLUMNS FROM update_logs LIKE 'product_version'");
    expect(columns[0]).toMatchObject({ Type: 'varchar(32)', Null: 'YES', Default: null });
  });
  it('可重复执行，不创建 1.1.0，也不改变已补记记录', async () => {
    await applyMigration(db);
    const before = await rows();
    await applyMigration(db);
    expect(await rows()).toEqual(before);
    expect(before.some((row) => row.product_version === '1.1.0')).toBe(false);
  });
  it('已有不同产品版本时拒绝覆盖', async () => {
    await applyMigration(db);
    await db.query("UPDATE update_logs SET product_version='1.0.1' WHERE id='milestone'");
    await expect(applyMigration(db)).rejects.toThrow('UPDATE_LOG_MILESTONE_VERSION_CONFLICT');
    expect((await rows()).find((row) => row.id === 'milestone').product_version).toBe('1.0.1');
  });
  it('同日期同标题存在多条已发布记录时终止，不猜选目标', async () => {
    await db.query("INSERT INTO update_logs VALUES ('duplicate', ?, '2026-10-30', 'published', '其他副本', NOW())", [
      title,
    ]);
    await expect(applyMigration(db)).rejects.toThrow('UPDATE_LOG_MILESTONE_AMBIGUOUS');
    expect((await rows()).every((row) => row.product_version === null)).toBe(true);
  });
  it('目标标题变化时终止；全新数据没有该日期时不捏造记录', async () => {
    await db.query("UPDATE update_logs SET title='里程碑标题已改动' WHERE id='milestone'");
    await expect(applyMigration(db)).rejects.toThrow('UPDATE_LOG_MILESTONE_TARGET_CHANGED');
    await db.query("DELETE FROM update_logs WHERE id <> 'older'");
    await applyMigration(db);
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0].product_version).toBeNull();
  });
});
