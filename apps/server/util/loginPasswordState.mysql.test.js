import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('密码状态迁移（隔离 MySQL）', () => {
  const schema = `password_state_${randomUUID().replaceAll('-', '')}`;
  let db;
  let created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    db = await mysql.createConnection({ socketPath, user: 'root', multipleStatements: true });
    const [[server]] = await db.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
    await db.query(`CREATE DATABASE ${schema}`);
    created = true;
    await db.query(`USE ${schema}`);
    await db.query(
      'CREATE TABLE user (id varchar(50) PRIMARY KEY, email varchar(100), password varchar(255), password_method varchar(20))',
    );
    await db.query("INSERT INTO user VALUES ('legacy', 'fixture@example.com', 'existing-hash', 'scrypt')");
  });
  afterAll(async () => {
    if (created) await db.query(`DROP DATABASE ${schema}`);
    await db?.end();
  });
  it('迁移可重复执行，保留旧密码与未知状态；密码并发更新失败关闭', async () => {
    const migration = await readFile(
      new URL('../migrations/20260924_login_password_state.sql', import.meta.url),
      'utf8',
    );
    await db.query(migration);
    await db.query(migration);
    const [[legacy]] = await db.query("SELECT password, login_password_set FROM user WHERE id='legacy'");
    expect(legacy).toEqual({ password: 'existing-hash', login_password_set: null });
    const update =
      'UPDATE user SET password = ?, password_method = ?, login_password_set = 1 WHERE id = ? AND password <=> ? AND email <=> ?';
    const [first] = await db.execute(update, ['new-hash', 'scrypt', 'legacy', 'existing-hash', 'fixture@example.com']);
    const [stale] = await db.execute(update, [
      'stale-hash',
      'scrypt',
      'legacy',
      'existing-hash',
      'fixture@example.com',
    ]);
    expect(first.affectedRows).toBe(1);
    expect(stale.affectedRows).toBe(0);
    const [[current]] = await db.query("SELECT password, login_password_set FROM user WHERE id='legacy'");
    expect(current).toEqual({ password: 'new-hash', login_password_set: 1 });
  });
});
