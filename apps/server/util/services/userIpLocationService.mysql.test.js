import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: {} }));
const { createUserIpLocationRefresher } = await import('./userIpLocationService.js');
const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `user_ip_${randomUUID().replaceAll('-', '')}`;
const location = { status: '1', city: '测试城市', province: '测试省份', rectangle: '' };

describe.skipIf(!socket)('账号 IP 定位回写 · 隔离 MySQL', () => {
  let admin, db, created;
  beforeAll(async () => {
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    created = true;
    db = mysql.createPool({ socketPath: socket, user: 'root', database: schema, connectionLimit: 3 });
    await db.query(
      'CREATE TABLE user (id VARCHAR(64) PRIMARY KEY,ip VARCHAR(45) NULL,location TEXT,del_flag TINYINT NOT NULL DEFAULT 0) ENGINE=InnoDB',
    );
  });
  beforeEach(async () => {
    await db.query('DELETE FROM user');
    await db.query(
      "INSERT INTO user(id,ip,location) VALUES ('owner','203.0.113.1','original'),('other','203.0.113.1','other-location')",
    );
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });

  const refresher = (get = vi.fn().mockResolvedValue({ data: location })) =>
    createUserIpLocationRefresher({ db, http: { get }, apiKey: () => 'test-key', warn: vi.fn() });
  const read = async () => (await db.query('SELECT * FROM user ORDER BY id'))[0];

  it.each([null, '', '203.0.113.1'])('兼容旧 IP %s，只更新当前账号', async (previousIp) => {
    await db.query("UPDATE user SET ip=? WHERE id='owner'", [previousIp]);
    expect(await refresher()({ id: 'owner', ip: previousIp }, '203.0.113.2')).toBe(true);
    const rows = await read();
    expect(rows.find((row) => row.id === 'other')).toMatchObject({ ip: '203.0.113.1', location: 'other-location' });
    const owner = rows.find((row) => row.id === 'owner');
    expect(owner.ip).toBe('203.0.113.2');
    expect(JSON.parse(owner.location).city).toBe('测试城市');
  });

  it.each(['network-changed', 'disabled', 'deleted'])('定位迟到时不覆盖 %s 后的账号', async (change) => {
    let finish;
    const get = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = refresher(get)({ id: 'owner', ip: '203.0.113.1' }, '203.0.113.2');
    if (change === 'network-changed') await db.query("UPDATE user SET ip='203.0.113.3' WHERE id='owner'");
    if (change === 'disabled') await db.query("UPDATE user SET del_flag=1 WHERE id='owner'");
    if (change === 'deleted') await db.query("DELETE FROM user WHERE id='owner'");
    finish({ data: location });
    expect(await pending).toBe(false);
    const owner = (await read()).find((row) => row.id === 'owner');
    if (change === 'deleted') expect(owner).toBeUndefined();
    else {
      expect(owner.location).toBe('original');
      expect(owner.ip).toBe(change === 'network-changed' ? '203.0.113.3' : '203.0.113.1');
    }
  });
});
