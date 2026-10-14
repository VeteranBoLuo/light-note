import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/index.js', () => ({
  default: {
    query: (...args) => state.db.query(...args),
    getConnection: (...args) => state.db.getConnection(...args),
  },
}));
const { buyItem, equipBackground, ensurePointsSchema } = await import('./points.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `backgrounds_${randomUUID().replaceAll('-', '')}`;
let admin;
const request = (id = randomUUID()) => ({
  clientRequestId: id,
  economyVersion: 'points-economy-c9',
  expectedCost: 600,
});

describe.skipIf(!socketPath)('个人背景真实事务与迁移', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[version]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(version.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema}`);
    state.db = mysql.createPool({
      socketPath,
      user: 'root',
      database: schema,
      connectionLimit: 6,
      multipleStatements: true,
    });
    await state.db.query(
      'CREATE TABLE user_growth (user_id VARCHAR(64) PRIMARY KEY, level INT DEFAULT 1, points INT DEFAULT 0, streak_protect_cards INT DEFAULT 0) ENGINE=InnoDB',
    );
    const migration = await readFile(
      new URL('../migrations/20261014_profile_backgrounds.sql', import.meta.url),
      'utf8',
    );
    await state.db.query(migration);
    await state.db.query(migration);
    await ensurePointsSchema();
    await ensurePointsSchema();
  });
  beforeEach(async () => {
    vi.stubEnv('POINTS_ECONOMY_C9_ENABLED', 'true');
    await state.db.query('DELETE FROM points_economy_operations');
    await state.db.query('DELETE FROM user_cosmetics');
    await state.db.query('DELETE FROM points_log');
    await state.db.query('DELETE FROM user_growth');
    await state.db.query("INSERT INTO user_growth (user_id, points) VALUES ('u1', 3000), ('u2', 3000)");
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await state.db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
  });
  async function balance() {
    const [[row]] = await state.db.query("SELECT points, equipped_background FROM user_growth WHERE user_id = 'u1'");
    return row;
  }

  it('运行时补列与显式迁移产生相同结构且不修改资产', async () => {
    const readColumn = async () =>
      (await state.db.query("SHOW COLUMNS FROM user_growth LIKE 'equipped_background'"))[0];
    const before = await readColumn();
    await state.db.query('ALTER TABLE user_growth DROP COLUMN equipped_background');
    await ensurePointsSchema();
    expect(await readColumn()).toEqual(before);
    expect(await balance()).toMatchObject({ points: 3000, equipped_background: null });
  });

  it('兑换一次入永久装扮，不自动使用；可切换与恢复默认，另一账号不可使用', async () => {
    expect(await buyItem('u1', 'background_mountains', request())).toMatchObject({
      ok: true,
      cost: 600,
      effect: { type: 'background', backgroundId: 'background_mountains' },
    });
    expect(await balance()).toMatchObject({ points: 2400, equipped_background: null });
    expect(await equipBackground('u2', 'background_mountains')).toMatchObject({ ok: false, reason: 'not_owned' });
    expect(await equipBackground('u1', 'background_mountains')).toEqual({ ok: true, equipped: 'background_mountains' });
    expect((await balance()).equipped_background).toBe('background_mountains');
    expect(await equipBackground('u1', null)).toEqual({ ok: true, equipped: null });
    expect(await equipBackground('u1', 'background_mountains')).toMatchObject({ ok: true });
    expect((await balance()).points).toBe(2400);
  });
  it('并发同请求只扣一次，并原样回放成功收据', async () => {
    const input = request();
    const results = await Promise.all([
      buyItem('u1', 'background_mountains', input),
      buyItem('u1', 'background_mountains', input),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.filter((result) => result.idempotent)).toHaveLength(1);
    expect((await balance()).points).toBe(2400);
  });
  it('并发不同请求不能重复购买，不重复扣分', async () => {
    const results = await Promise.all([
      buyItem('u1', 'background_mountains', request()),
      buyItem('u1', 'background_mountains', request()),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ reason: 'owned' });
    expect((await balance()).points).toBe(2400);
    const [[row]] = await state.db.query('SELECT COUNT(*) AS n FROM points_log');
    expect(row.n).toBe(1);
  });
  it('余额不足、旧价格、旧版本均不扣分', async () => {
    await state.db.query("UPDATE user_growth SET points = 599 WHERE user_id = 'u1'");
    expect(await buyItem('u1', 'background_mountains', request())).toMatchObject({ ok: false, reason: 'insufficient' });
    await expect(buyItem('u1', 'background_mountains', { ...request(), expectedCost: 1 })).rejects.toMatchObject({
      code: 'ECONOMY_CATALOG_CHANGED',
    });
    await expect(
      buyItem('u1', 'background_mountains', { ...request(), economyVersion: 'points-economy-c8' }),
    ).rejects.toMatchObject({ code: 'ECONOMY_CATALOG_CHANGED' });
    expect((await balance()).points).toBe(599);
  });
  it.each([undefined, '', {}, 'frame_mint', 'https://example.com/a.png'])('拒绝非目录 ID %j', async (id) => {
    expect(await equipBackground('u1', id)).toMatchObject({ ok: false, reason: 'invalid_background' });
  });
  it('回退目录后已拥有背景仍可使用、旧成功收据仍可回放', async () => {
    const input = request();
    await buyItem('u1', 'background_mountains', input);
    vi.stubEnv('POINTS_ECONOMY_C9_ENABLED', 'false');
    vi.stubEnv('POINTS_ECONOMY_C8_ENABLED', 'true');
    expect(await equipBackground('u1', 'background_mountains')).toMatchObject({ ok: true });
    expect(await buyItem('u1', 'background_mountains', input)).toMatchObject({ ok: true, idempotent: true, cost: 600 });
    expect((await balance()).points).toBe(2400);
  });
});
