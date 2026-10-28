import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { accountEmailSnapshot, emailDigest } from './accountEmailPolicy.js';
import { persistAccountEmailChange } from './accountEmailChangeService.js';
import {
  accountEmailHealthSchemaReady,
  migrateAccountEmailHealthSchema,
  runAccountEmailHealthBatch,
} from './accountEmailHealthService.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `account_email_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socketPath)('邮箱检查与更换（隔离 MySQL）', () => {
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
    db = mysql.createPool({ socketPath, user: 'root', database: schema, multipleStatements: true, connectionLimit: 6 });
    await db.query(`CREATE TABLE user (
      id VARCHAR(64) PRIMARY KEY, email VARCHAR(254) UNIQUE, github_id VARCHAR(32), password VARCHAR(255),
      login_password_set INT, login_type VARCHAR(20), role VARCHAR(20), del_flag INT DEFAULT 0, alias VARCHAR(100)
    ) ENGINE=InnoDB;
    CREATE TABLE user_sessions (sid VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), expires_at DATETIME NOT NULL DEFAULT '2099-01-01 00:00:00', KEY user_id(user_id)) ENGINE=InnoDB;
    CREATE TABLE notification (id CHAR(36) PRIMARY KEY, user_id VARCHAR(255), type VARCHAR(32), title VARCHAR(255), content TEXT,
      link VARCHAR(255), meta JSON, source_type VARCHAR(32), source_id VARCHAR(64), batch_id CHAR(36), is_read INT, del_flag INT DEFAULT 0,
      browser_push_pending INT, browser_push_created_at DATETIME(6),
      UNIQUE KEY uk_source(user_id,source_type,source_id)) ENGINE=InnoDB`);
    await db.query(
      await readFile(new URL('../../migrations/20260726_email_delivery_logs.sql', import.meta.url), 'utf8'),
    );
    await migrateAccountEmailHealthSchema(db);
    await migrateAccountEmailHealthSchema(db); // 结构安装可重入，不创建或修改账号。
  });
  beforeEach(async () => {
    await db.query(
      'DELETE FROM user_sessions; DELETE FROM user; DELETE FROM notification; DELETE FROM account_email_health_runs; DELETE FROM account_email_health_notices; DELETE FROM email_delivery_logs',
    );
    await db.query(`INSERT INTO user(id,email,password,login_password_set,login_type,role,github_id,alias) VALUES
      ('owner','owner@example.com','original-hash',1,'local','user','123','original alias'),
      ('other','other@example.com','other-hash',1,'local','user',NULL,'other alias')`);
    await db.query(
      "INSERT INTO user_sessions(sid,user_id) VALUES ('owner-session','owner'),('owner-other-device','owner'),('other-session','other')",
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
  const row = async (id = 'owner') => (await db.query('SELECT * FROM user WHERE id = ?', [id]))[0][0];
  const batch = (month = '2026-10', options = {}) =>
    runAccountEmailHealthBatch({
      db,
      now: new Date(`${month}-23T12:00:00Z`),
      inspectDomain: async () => null,
      ...options,
    });
  const prepared = async (id = 'owner', email = 'new@example.com') => ({
    userId: id,
    email,
    snapshot: accountEmailSnapshot(await row(id)),
    sidDigest: emailDigest(`${id}-session`),
  });

  it('每月扫描可分批续跑，完成后重启不再扫描', async () => {
    const inspectDomain = vi.fn().mockResolvedValue(null);
    expect(await batch('2026-10', { batchSize: 1, inspectDomain })).toMatchObject({ checked: 1, completed: false });
    expect(await batch('2026-10', { batchSize: 1, inspectDomain })).toMatchObject({ checked: 1 });
    expect(await batch('2026-10', { batchSize: 1, inspectDomain })).toMatchObject({ checked: 0, completed: true });
    inspectDomain.mockClear();
    expect(await batch('2026-10', { inspectDomain })).toMatchObject({ checked: 0, completed: true });
    expect(inspectDomain).not.toHaveBeenCalled();
    expect(await batch('2026-11')).toMatchObject({ checked: 2, completed: true });
  });
  it('同邮箱同问题跨月只通知一次，用户删除通知也不重发；不同问题可通知', async () => {
    const inspectDomain = async () => 'DOMAIN_NOT_FOUND';
    expect(await batch('2026-10', { inspectDomain })).toMatchObject({ notified: 2 });
    await db.query('DELETE FROM notification');
    expect(await batch('2026-11', { inspectDomain })).toMatchObject({ notified: 0 });
    expect((await db.query('SELECT * FROM notification'))[0]).toHaveLength(0);
    expect(await batch('2026-12', { inspectDomain: async () => 'DOMAIN_NO_MAIL' })).toMatchObject({ notified: 2 });
    const [notices] = await db.query('SELECT * FROM notification');
    expect(notices.every((item) => item.browser_push_pending === 0 && item.link === '/settings?section=account')).toBe(
      true,
    );
  });
  it('通知失败时去重事实一起回滚，后续可重新投递一次', async () => {
    await expect(
      batch('2026-10', {
        inspectDomain: async () => 'DOMAIN_NOT_FOUND',
        notify: async () => {
          throw new Error('notification unavailable');
        },
      }),
    ).rejects.toThrow();
    expect((await db.query('SELECT * FROM account_email_health_notices'))[0]).toHaveLength(0);
    expect(await batch('2026-10', { inspectDomain: async () => 'DOMAIN_NOT_FOUND' })).toMatchObject({ notified: 2 });
  });
  it('多实例同时扫描不会重复通知', async () => {
    const results = await Promise.all([
      batch('2026-10', { inspectDomain: async () => 'DOMAIN_NOT_FOUND' }),
      batch('2026-10', { inspectDomain: async () => 'DOMAIN_NOT_FOUND' }),
    ]);
    expect(results.reduce((sum, value) => sum + value.notified, 0)).toBe(2);
    expect((await db.query('SELECT * FROM notification'))[0]).toHaveLength(2);
  });
  it('DNS 判断期间邮箱已变化时不发旧邮箱提醒；停用与占位邮箱不误报', async () => {
    await db.query("UPDATE user SET email='123@users.noreply.github.com' WHERE id='owner'");
    const inspectDomain = vi.fn(async () => {
      await db.query("UPDATE user SET email='corrected@example.com' WHERE id='other'");
      return 'DOMAIN_NOT_FOUND';
    });
    expect(await batch('2026-10', { inspectDomain })).toMatchObject({ notified: 0 });
    expect(inspectDomain).toHaveBeenCalledOnce();
    await db.query('UPDATE user SET del_flag=1');
    expect(await batch('2026-11', { inspectDomain })).toMatchObject({ checked: 0, notified: 0 });
  });
  it('格式错误无需 DNS 探测，数字邮箱和未知可达性不误报', async () => {
    await db.query(
      "UPDATE user SET email='not-an-address' WHERE id='owner'; UPDATE user SET email='123456@qq.com' WHERE id='other'",
    );
    const inspectDomain = vi.fn().mockResolvedValue(null);
    expect(await batch('2026-10', { inspectDomain })).toMatchObject({ notified: 1 });
    expect(inspectDomain).toHaveBeenCalledExactlyOnceWith('qq.com');
  });
  it('巡检不误报标准 IP 邮箱，也不向其发起 DNS 或网络探测', async () => {
    await db.query(
      "UPDATE user SET email='name@[192.0.2.1]' WHERE id='owner'; UPDATE user SET email='name@[IPv6:2001:db8::1]' WHERE id='other'",
    );
    const inspectDomain = vi.fn().mockResolvedValue('DOMAIN_NOT_FOUND');
    expect(await batch('2026-10', { inspectDomain })).toMatchObject({ notified: 0 });
    expect(inspectDomain).not.toHaveBeenCalled();
    expect((await db.query('SELECT * FROM notification'))[0]).toHaveLength(0);
    await db.query("UPDATE user SET email='name@ai' WHERE id='owner'");
    inspectDomain.mockResolvedValue(null);
    expect(await batch('2026-11', { inspectDomain })).toMatchObject({ notified: 0 });
    expect(inspectDomain).toHaveBeenCalledExactlyOnceWith('ai');
  });
  it('只使用实际投递的明确邮箱不存在结果；较新受理及同秒不确定结果阻止误报', async () => {
    await db.query(`INSERT INTO email_delivery_logs(id,email_type,recipient_email,subject,status,error_code,create_time) VALUES
      ('one','verification','owner@example.com','test','failed','EMAIL_MAILBOX_NOT_FOUND','2026-10-21 01:00:00'),
      ('two','verification','other@example.com','test','failed','EMAIL_MAILBOX_NOT_FOUND','2026-10-21 01:00:00'),
      ('three','verification','other@example.com','test','accepted',NULL,'2026-10-21 01:00:00')`);
    expect(await batch()).toMatchObject({ notified: 1 });
    const [notices] = await db.query('SELECT * FROM notification');
    expect(notices[0].user_id).toBe('owner');
    expect(notices[0].meta.issueCode).toBe('MAILBOX_NOT_FOUND');
  });
  it('加法 Schema 与只读断言均通过，删除必要索引能够被门禁发现', async () => {
    expect(await accountEmailHealthSchemaReady(db)).toBe(true);
    const source = (await readFile(new URL('../../migrations/schema-assertions.sql', import.meta.url), 'utf8'))
      .split('-- Account email health:')[1]
      .split('\n-- ')[0];
    const statements = source
      .split('\n')
      .slice(1)
      .join('\n')
      .split(';')
      .map((sql) => sql.trim())
      .filter(Boolean);
    for (const sql of statements) expect((await db.query(sql))[0]).toEqual([]);
    await db.query('ALTER TABLE email_delivery_logs DROP INDEX idx_email_delivery_recipient_time');
    expect(await accountEmailHealthSchemaReady(db)).toBe(false);
    expect(
      (
        await db.query(statements.find((sql) => sql.includes('email_delivery_logs.idx_email_delivery_recipient_time')))
      )[0],
    ).toHaveLength(1);
    await db.query(
      'ALTER TABLE email_delivery_logs ADD INDEX idx_email_delivery_recipient_time (recipient_email,create_time,id)',
    );
  });
  it('更换后原账号、密码、GitHub 与资料保持不变，新邮箱可定位原账号且旧邮箱不能定位', async () => {
    const before = await row();
    const result = await persistAccountEmailChange(await prepared(), { db, sid: 'owner-session' });
    expect(result.revokedSids).toHaveLength(2);
    expect(await row()).toEqual({ ...before, email: 'new@example.com' });
    expect((await db.query("SELECT id FROM user WHERE email='owner@example.com'"))[0]).toEqual([]);
    expect((await db.query("SELECT id FROM user WHERE email='new@example.com'"))[0][0].id).toBe('owner');
    expect((await db.query('SELECT sid, user_id FROM user_sessions'))[0]).toEqual([
      { sid: 'other-session', user_id: 'other' },
    ]);
  });
  it('目标邮箱已占用时回滚全部变更，不合并账号或删除会话', async () => {
    await expect(
      persistAccountEmailChange(await prepared('owner', 'other@example.com'), { db, sid: 'owner-session' }),
    ).rejects.toHaveProperty('code', 'EMAIL_CHANGE_EMAIL_IN_USE');
    expect((await row()).email).toBe('owner@example.com');
    expect((await db.query('SELECT * FROM user_sessions'))[0]).toHaveLength(3);
  });
  it.each(['revoked', 'expired', 'other-owner'])('验证码发出后会话 %s，确认事务拒绝并保留邮箱', async (state) => {
    const claim = await prepared();
    if (state === 'revoked') await db.query("DELETE FROM user_sessions WHERE sid='owner-session'");
    if (state === 'expired')
      await db.query("UPDATE user_sessions SET expires_at='2020-01-01' WHERE sid='owner-session'");
    if (state === 'other-owner') await db.query("UPDATE user_sessions SET user_id='other' WHERE sid='owner-session'");
    await expect(persistAccountEmailChange(claim, { db, sid: 'owner-session' })).rejects.toHaveProperty(
      'code',
      'EMAIL_CHANGE_IDENTITY_REQUIRED',
    );
    expect((await row()).email).toBe('owner@example.com');
    expect((await db.query("SELECT * FROM user_sessions WHERE sid='owner-other-device'"))[0]).toHaveLength(1);
  });
  it('并发更换同一个目标邮箱时只有一个账号成功', async () => {
    const results = await Promise.allSettled([
      persistAccountEmailChange(await prepared(), { db, sid: 'owner-session' }),
      persistAccountEmailChange(await prepared('other'), { db, sid: 'other-session' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await db.query("SELECT * FROM user WHERE email='new@example.com'"))[0]).toHaveLength(1);
  });
  it('验证码发出后密码或关联变化，旧证明不能继续更换邮箱', async () => {
    const claim = await prepared();
    await db.query("UPDATE user SET password='changed' WHERE id='owner'");
    await expect(persistAccountEmailChange(claim, { db, sid: 'owner-session' })).rejects.toHaveProperty(
      'code',
      'EMAIL_CHANGE_ACCOUNT_CHANGED',
    );
    expect((await row()).email).toBe('owner@example.com');
    expect((await db.query('SELECT * FROM user_sessions'))[0]).toHaveLength(3);
  });
  it('COMMIT 已成功但回包丢失时复核持久结果，避免误报失败', async () => {
    const recoveringDb = {
      query: (...args) => db.query(...args),
      getConnection: async () => {
        const connection = await db.getConnection();
        return {
          query: (...args) => connection.query(...args),
          beginTransaction: () => connection.beginTransaction(),
          rollback: () => connection.rollback(),
          release: () => connection.release(),
          commit: async () => {
            await connection.commit();
            throw Object.assign(new Error(), { code: 'ECONNRESET' });
          },
        };
      },
    };
    expect(await persistAccountEmailChange(await prepared(), { db: recoveringDb, sid: 'owner-session' })).toMatchObject(
      {
        email: 'new@example.com',
      },
    );
    expect((await row()).password).toBe('original-hash');
    expect((await db.query("SELECT * FROM user_sessions WHERE user_id='owner'"))[0]).toEqual([]);
  });
  it('新邮箱被并发注册抢先占用时唯一键裁决，不覆盖新账号', async () => {
    const claim = await prepared();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        "INSERT INTO user (id,email,password,role,login_password_set) VALUES ('new-user','new@example.com','new-user-hash','user',1)",
      );
      const changing = persistAccountEmailChange(claim, { db, sid: 'owner-session' });
      // 提前安装 rejection handler，避免提交前可能返回的错误成为未处理 rejection。
      const checked = expect(changing).rejects.toHaveProperty('code', 'EMAIL_CHANGE_EMAIL_IN_USE');
      await connection.commit();
      await checked;
      expect((await row()).email).toBe('owner@example.com');
      expect((await row('new-user')).password).toBe('new-user-hash');
    } finally {
      connection.release();
    }
  });
});
