import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../db/index.js', () => ({ default: {} }));
import dbProxy from '../db/index.js';
import { createSession, getSession } from './sessionStore.js';

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
    dbProxy.getConnection = () => db.getConnection();
    await db.query(`CREATE TABLE user (id VARCHAR(64) PRIMARY KEY, last_active_time DATETIME, password VARCHAR(255));
      CREATE TABLE user_sessions (
        sid VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), role VARCHAR(20),
        expires_at DATETIME, create_time DATETIME DEFAULT CURRENT_TIMESTAMP, last_active_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip VARCHAR(255), user_agent TEXT, device_key VARCHAR(64), INDEX(user_id,device_key)
      ) ENGINE=InnoDB;
      INSERT INTO user VALUES ('owner',NULL,'original')`);
  });
  beforeEach(async () => {
    await db.query(`DELETE FROM user_sessions;
      UPDATE user SET password='original';
      INSERT INTO user_sessions(sid,user_id,role,expires_at,create_time,last_active_time) VALUES ('sid','owner','user',DATE_ADD(NOW(), INTERVAL 1 HOUR),NOW(),NOW())`);
  });
  afterAll(async () => {
    await db?.end();
    try {
      if (created) await admin.query(`DROP DATABASE ${schema}`);
    } finally {
      await admin?.end();
    }
  });
  it('一分钟内只确认不写，超过一分钟才续期，同秒重复访问不误退出', async () => {
    const first = await getSession('sid');
    expect(first).toMatchObject({ user_id: 'owner' });
    expect(first.expires_in_seconds).toBeLessThanOrEqual(3_600);
    const [[untouched]] = await db.query(
      'SELECT TIMESTAMPDIFF(SECOND,NOW(),expires_at) AS remaining FROM user_sessions',
    );
    expect(untouched.remaining).toBeLessThanOrEqual(3_600);

    await db.query('UPDATE user_sessions SET last_active_time = DATE_SUB(NOW(), INTERVAL 2 MINUTE)');
    const startedAt = Date.now();
    expect(await getSession('sid')).toMatchObject({ user_id: 'owner', expires_in_seconds: 86_400 });
    expect(await getSession('sid')).toMatchObject({ user_id: 'owner' });
    const [[value]] = await db.query(
      'SELECT TIMESTAMPDIFF(SECOND,NOW(),expires_at) AS remaining, TIMESTAMPDIFF(SECOND,last_active_time,NOW()) AS idle FROM user_sessions',
    );
    expect(value.remaining).toBeGreaterThanOrEqual(86_400 - Math.ceil((Date.now() - startedAt) / 1000) - 1);
    expect(value.remaining).toBeLessThanOrEqual(86_400);
    expect(value.idle).toBeLessThan(60);
  });
  it.each(['deleted', 'expired'])('数据库会话 %s 时拒绝，重复请求也不能放行', async (state) => {
    if (state === 'deleted') await db.query('DELETE FROM user_sessions');
    if (state === 'expired') await db.query("UPDATE user_sessions SET expires_at='2020-01-01'");
    expect(await getSession('sid')).toBeNull();
    expect(await getSession('sid')).toBeNull();
  });
  it('确认会话时等待撤销事务提交，不能凭撤销前的快照放行', async () => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("DELETE FROM user_sessions WHERE sid='sid'");
      const reading = getSession('sid');
      await connection.commit();
      expect(await reading).toBeNull();
    } finally {
      await connection.rollback();
      connection.release();
    }
  });
  it('改密事务先获得账号锁时，旧凭据不能在其提交后新建会话', async () => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("UPDATE user SET password='changed' WHERE id='owner'");
      const creating = createSession({
        userId: 'owner',
        role: 'user',
        maxAgeMs: 1000,
        validateAccount: (account) => {
          if (account.password !== 'original') throw new Error('credentials changed');
        },
      });
      const rejection = expect(creating).rejects.toThrow('credentials changed');
      await connection.commit();
      await rejection;
      expect((await db.query('SELECT sid FROM user_sessions'))[0]).toEqual([{ sid: 'sid' }]);
    } finally {
      await connection.rollback();
      connection.release();
    }
  });
  it('签发先获得账号锁时，后续改密撤销能够覆盖刚创建的会话', async () => {
    let releaseValidation, locked;
    const gate = new Promise((resolve) => {
      releaseValidation = resolve;
    });
    const held = new Promise((resolve) => {
      locked = resolve;
    });
    const creating = createSession({
      userId: 'owner',
      role: 'user',
      maxAgeMs: 1000,
      validateAccount: async (account) => {
        expect(account.password).toBe('original');
        locked();
        await gate;
      },
    });
    await held;
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const changing = connection.query("UPDATE user SET password='changed' WHERE id='owner'");
      releaseValidation();
      await creating;
      await changing;
      await connection.query("DELETE FROM user_sessions WHERE user_id='owner'");
      await connection.commit();
      expect((await db.query('SELECT sid FROM user_sessions'))[0]).toHaveLength(0);
    } finally {
      releaseValidation();
      await connection.rollback();
      connection.release();
    }
  });
});
