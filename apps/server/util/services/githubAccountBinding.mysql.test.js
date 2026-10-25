import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { githubBindingCandidate, confirmGithubAccountBinding } from './githubAccountBindingService.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `github_binding_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socketPath)('GitHub 确认绑定（隔离 MySQL）', () => {
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
    db = mysql.createPool({ socketPath, user: 'root', database: schema, multipleStatements: true, connectionLimit: 5 });
    await db.query(`CREATE TABLE user (
      id VARCHAR(64) PRIMARY KEY, email VARCHAR(254) UNIQUE, github_id VARCHAR(40) UNIQUE,
      password VARCHAR(255), login_password_set INT, login_type VARCHAR(20), role VARCHAR(20),
      del_flag INT DEFAULT 0, alias VARCHAR(100), preferences TEXT
    ) ENGINE=InnoDB;
    CREATE TABLE user_sessions (sid VARCHAR(64) PRIMARY KEY,user_id VARCHAR(64)) ENGINE=InnoDB;
    CREATE TABLE user_growth (user_id VARCHAR(64) PRIMARY KEY,points INT) ENGINE=InnoDB`);
  });
  beforeEach(async () => {
    await db.query(`DELETE FROM user_sessions; DELETE FROM user_growth; DELETE FROM user;
      INSERT INTO user(id,email,password,login_password_set,login_type,role,alias,preferences) VALUES
      ('owner','owner@example.com','original-hash',1,'email','root','原资料','{"theme":"day"}'),
      ('other','other@example.com','other-hash',1,'email','user','其他资料','{}');
      INSERT INTO user_sessions VALUES ('existing-device','owner');
      INSERT INTO user_growth VALUES ('owner',12345),('other',10)`);
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
  const candidate = async (id = 'owner', githubId = '123') => {
    const user = await row(id);
    return githubBindingCandidate(user, { id: githubId, login: 'octo', email: user.email, emailMissing: false });
  };
  it('只更新 GitHub ID，保留密码、邮箱、Root 角色、资料、积分和设备会话', async () => {
    const before = await row();
    await confirmGithubAccountBinding(await candidate(), { db });
    expect(await row()).toEqual({ ...before, github_id: '123' });
    expect((await db.query("SELECT * FROM user_sessions WHERE user_id='owner'"))[0]).toHaveLength(1);
    expect((await db.query("SELECT points FROM user_growth WHERE user_id='owner'"))[0][0].points).toBe(12345);
  });
  it.each([
    { password: 'changed' },
    { email: 'new@example.com' },
    { github_id: '999' },
    { del_flag: 1 },
    { role: 'visitor' },
  ])('确认前变化 %j 时不绑定', async (patch) => {
    const binding = await candidate();
    await db.query('UPDATE user SET ? WHERE id=?', [patch, 'owner']);
    await expect(confirmGithubAccountBinding(binding, { db })).rejects.toHaveProperty('stage', 'ACCOUNT_BIND');
    expect((await row()).github_id).toBe(patch.github_id || null);
  });
  it('同账号不同 GitHub 并发确认不能覆盖先完成的关联', async () => {
    const bindings = await Promise.all([candidate('owner', '123'), candidate('owner', '456')]);
    const results = await Promise.allSettled(bindings.map((binding) => confirmGithubAccountBinding(binding, { db })));
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(['123', '456']).toContain((await row()).github_id);
  });
  it('不同账号争抢同一个 GitHub 时唯一键只允许一方成功', async () => {
    const bindings = await Promise.all([candidate('owner'), candidate('other')]);
    const results = await Promise.allSettled(bindings.map((binding) => confirmGithubAccountBinding(binding, { db })));
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await db.query("SELECT id FROM user WHERE github_id='123'"))[0]).toHaveLength(1);
  });
  it('数据库已提交但回包丢失时复核结果，重试也不改动密码和资料', async () => {
    const binding = await candidate();
    const uncertain = {
      query: (...args) => db.query(...args),
      getConnection: async () => {
        const c = await db.getConnection();
        return {
          query: (...args) => c.query(...args),
          beginTransaction: () => c.beginTransaction(),
          rollback: () => c.rollback(),
          release: () => c.release(),
          commit: async () => {
            await c.commit();
            throw Object.assign(new Error(), { code: 'ECONNRESET' });
          },
        };
      },
    };
    expect(await confirmGithubAccountBinding(binding, { db: uncertain })).toMatchObject({
      id: 'owner',
      github_id: '123',
      password: 'original-hash',
    });
    expect(await confirmGithubAccountBinding(binding, { db })).toMatchObject({ id: 'owner', github_id: '123' });
  });
  it('原本没有独立密码的账号不会因绑定被标记为有密码', async () => {
    await db.query("UPDATE user SET login_type='github',login_password_set=0 WHERE id='owner'");
    await confirmGithubAccountBinding(await candidate(), { db });
    expect(await row()).toMatchObject({ password: 'original-hash', login_password_set: 0, login_type: 'github' });
  });
  it('COMMIT 与复核同时断线时标记结果不确定，后续只能恢复现存关联', async () => {
    const binding = await candidate();
    const uncertain = {
      query: async () => {
        throw Object.assign(new Error(), { code: 'ECONNRESET' });
      },
      getConnection: async () => {
        const c = await db.getConnection();
        return {
          query: (...a) => c.query(...a),
          beginTransaction: () => c.beginTransaction(),
          rollback: () => c.rollback(),
          release: () => c.release(),
          commit: async () => {
            await c.commit();
            throw Object.assign(new Error(), { code: 'ECONNRESET' });
          },
        };
      },
    };
    await expect(confirmGithubAccountBinding(binding, { db: uncertain })).rejects.toMatchObject({
      bindingMayHaveCommitted: true,
    });
    expect(await confirmGithubAccountBinding(binding, { db, resumeOnly: true })).toMatchObject({ github_id: '123' });
  });
  it('兼容历史空字符串关联，仍只修改 GitHub ID', async () => {
    await db.query("UPDATE user SET github_id='' WHERE id='owner'");
    const before = await row();
    await confirmGithubAccountBinding(await candidate(), { db });
    expect(await row()).toEqual({ ...before, github_id: '123' });
  });
  it('过期处理租约仅恢复仍存在的同一关联，不能借旧票据重新建立已解除的关联', async () => {
    const binding = await candidate();
    await expect(confirmGithubAccountBinding(binding, { db, resumeOnly: true })).rejects.toHaveProperty(
      'code',
      'GITHUB_OAUTH_ACCOUNT_CHANGED',
    );
    await confirmGithubAccountBinding(binding, { db });
    expect(await confirmGithubAccountBinding(binding, { db, resumeOnly: true })).toMatchObject({ github_id: '123' });
    await db.query("UPDATE user SET github_id=NULL WHERE id='owner'");
    await expect(confirmGithubAccountBinding(binding, { db, resumeOnly: true })).rejects.toHaveProperty(
      'code',
      'GITHUB_OAUTH_ACCOUNT_CHANGED',
    );
    expect((await row()).github_id).toBeNull();
  });
});
