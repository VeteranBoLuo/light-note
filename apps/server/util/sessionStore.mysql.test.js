import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../db/index.js', () => ({ default: {} }));
import dbProxy from '../db/index.js';
import redis from './redisClient.js';
import { getSession } from './sessionStore.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `session_authority_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socketPath)('会话撤销与续期（隔离 MySQL）', () => {
  let db,
    admin,
    created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Disposable socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    db = mysql.createPool({ socketPath, user: 'root', database: schema, multipleStatements: true, connectionLimit: 4 });
    dbProxy.query = (...args) => db.query(...args);
    await db.query(`CREATE TABLE user (id VARCHAR(64) PRIMARY KEY, last_active_time DATETIME);
      CREATE TABLE user_sessions (
        sid VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), role VARCHAR(20),
        expires_at DATETIME, create_time DATETIME, last_active_time DATETIME
      ) ENGINE=InnoDB;
      INSERT INTO user VALUES ('owner',NULL)`);
  });
  beforeEach(async () => {
    await db.query(`DELETE FROM user_sessions;
      INSERT INTO user_sessions VALUES ('sid','owner','user',DATE_ADD(NOW(), INTERVAL 1 HOUR),NOW(),NOW())`);
    const [[session]] = await db.query('SELECT * FROM user_sessions WHERE sid=?', ['sid']);
    redis.get.mockResolvedValue(JSON.stringify(session));
    redis.setEx.mockReset().mockResolvedValue('OK');
    redis.del.mockReset().mockResolvedValue(1);
  });
  afterAll(async () => {
    await db?.end();
    try {
      if (created) await admin.query(`DROP DATABASE ${schema}`);
    } finally {
      await admin?.end();
    }
  });
  it('正常缓存命中仍可续期，同秒重复访问不误退出', async () => {
    const startedAt = Date.now();
    const session = await getSession('sid');
    expect(session).toMatchObject({ user_id: 'owner' });
    expect(session.expires_in_seconds).toBeGreaterThanOrEqual(86_400 - Math.ceil((Date.now() - startedAt) / 1000));
    expect(session.expires_in_seconds).toBeLessThanOrEqual(86_400);
    expect(await getSession('sid')).toMatchObject({ user_id: 'owner' });
    const [[value]] = await db.query('SELECT TIMESTAMPDIFF(SECOND,NOW(),expires_at) AS remaining FROM user_sessions');
    expect(value.remaining).toBeGreaterThanOrEqual(86_400 - Math.ceil((Date.now() - startedAt) / 1000));
    expect(value.remaining).toBeLessThanOrEqual(86_400);
  });
  it.each(['deleted', 'expired', 'different-owner'])('Redis 仍有缓存但数据库会话 %s 时拒绝', async (state) => {
    if (state === 'deleted') await db.query('DELETE FROM user_sessions');
    if (state === 'expired') await db.query("UPDATE user_sessions SET expires_at='2020-01-01'");
    if (state === 'different-owner') await db.query("UPDATE user_sessions SET user_id='other'");
    redis.del.mockRejectedValue(new Error('cache cleanup unavailable'));
    expect(await getSession('sid')).toBeNull();
    expect(await getSession('sid')).toBeNull();
    expect(redis.setEx).not.toHaveBeenCalled();
  });
  it('续期等待撤销事务提交后，不能凭之前命中的缓存放行', async () => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("DELETE FROM user_sessions WHERE sid='sid'");
      const reading = getSession('sid');
      await connection.commit();
      expect(await reading).toBeNull();
      expect(redis.setEx).not.toHaveBeenCalled();
    } finally {
      await connection.rollback();
      connection.release();
    }
  });
});
