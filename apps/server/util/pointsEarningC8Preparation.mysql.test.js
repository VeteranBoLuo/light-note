import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ dashboard: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('./growth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getGrowthDashboard: mocks.dashboard,
}));
import { preparePointsEarningC8 } from './pointsEarningC8Preparation.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `c8_prepare_${randomUUID().replaceAll('-', '')}`;

describe.skipIf(!socketPath)('C8 奖励快照准备（隔离 MySQL）', () => {
  let admin;
  let db;
  let created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[server]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4`);
    created = true;
    db = mysql.createPool({ socketPath, user: 'root', database: schema });
    for (const sql of [
      'CREATE TABLE user (id VARCHAR(64) PRIMARY KEY, role VARCHAR(16), del_flag TINYINT NOT NULL DEFAULT 0) ENGINE=InnoDB',
      'CREATE TABLE user_growth (user_id VARCHAR(64) PRIMARY KEY, points BIGINT NOT NULL DEFAULT 1234) ENGINE=InnoDB',
      `CREATE TABLE user_achievements (
        user_id VARCHAR(64), achievement_key VARCHAR(64), unlocked_at DATETIME NOT NULL,
        claimed_at DATETIME NULL, reward_points_snapshot INT NULL,
        reward_frame_id_snapshot VARCHAR(64) NULL, policy_version VARCHAR(32) NULL,
        PRIMARY KEY (user_id, achievement_key)
      ) ENGINE=InnoDB`,
      'CREATE TABLE points_economy_migration_state (migration_key VARCHAR(96) PRIMARY KEY, meta JSON NULL) ENGINE=InnoDB',
    ])
      await db.query(sql);
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('POINTS_EARNING_C8_ENABLED', 'false');
    for (const table of ['user', 'user_growth', 'user_achievements', 'points_economy_migration_state'])
      await db.query(`DELETE FROM ${table}`);
    await db.query("INSERT INTO user (id, role) VALUES ('user-1', 'user')");
    await db.query("INSERT INTO user_growth (user_id, points) VALUES ('user-1', 1234)");
    mocks.dashboard.mockResolvedValue({
      achievementPolicyVersion: 'points-earning-c6',
      achievements: [
        {
          key: 'streak_7',
          unlocked: true,
          unlockedAt: '2026-10-01 00:00:00',
          reward: 30,
          frameId: 'frame_streak_seed',
          policyVersion: 'points-earning-c6',
        },
        {
          key: 'bookmark_500',
          unlocked: true,
          unlockedAt: null,
          reward: 400,
          frameId: 'frame_bookmark_archive',
          policyVersion: 'points-earning-c6',
        },
        { key: 'note_500', unlocked: false, reward: 600 },
      ],
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('补缺快照而不覆盖历史承诺、领取时间或余额，标记后重跑不再扫描', async () => {
    await db.query(`INSERT INTO user_achievements VALUES
      ('user-1', 'streak_7', '2026-09-01', '2026-09-02', 50, 'frame_streak_seed', 'points-earning-legacy')`);
    await preparePointsEarningC8({ db, apply: true });
    const [rows] = await db.query(`SELECT achievement_key, reward_points_snapshot, policy_version,
      DATE_FORMAT(claimed_at, '%Y-%m-%d') AS claimed FROM user_achievements ORDER BY achievement_key`);
    expect(rows).toEqual([
      {
        achievement_key: 'bookmark_500',
        reward_points_snapshot: 400,
        policy_version: 'points-earning-c6',
        claimed: null,
      },
      {
        achievement_key: 'streak_7',
        reward_points_snapshot: 50,
        policy_version: 'points-earning-legacy',
        claimed: '2026-09-02',
      },
    ]);
    const [[growth]] = await db.query('SELECT points FROM user_growth');
    expect(Number(growth.points)).toBe(1234);
    mocks.dashboard.mockClear();
    expect(await preparePointsEarningC8({ db, apply: true })).toMatchObject({ already: true });
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });

  it('写入后的异常回滚本账号快照，不记完成标记，修复后可以重试', async () => {
    const failing = {
      query: db.query.bind(db),
      getConnection: async () => {
        const conn = await db.getConnection();
        return new Proxy(conn, {
          get(target, key) {
            if (key === 'query')
              return async (...args) => {
                const result = await target.query(...args);
                if (args[0].includes('INSERT INTO user_achievements')) throw new Error('INJECTED_AFTER_INSERT');
                return result;
              };
            return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
          },
        });
      },
    };
    await expect(preparePointsEarningC8({ db: failing, apply: true })).rejects.toThrow('INJECTED_AFTER_INSERT');
    const [[snapshots]] = await db.query('SELECT COUNT(*) AS total FROM user_achievements');
    const [[markers]] = await db.query('SELECT COUNT(*) AS total FROM points_economy_migration_state');
    expect(Number(snapshots.total)).toBe(0);
    expect(Number(markers.total)).toBe(0);
    expect(await preparePointsEarningC8({ db, apply: true })).toMatchObject({ users: 1, achievements: 2 });
  });

  it('默认预览对真实数据库只读，不产生快照和完成标记', async () => {
    expect(await preparePointsEarningC8({ db })).toMatchObject({ users: 1, achievements: 2 });
    const [[snapshots]] = await db.query('SELECT COUNT(*) AS total FROM user_achievements');
    const [[markers]] = await db.query('SELECT COUNT(*) AS total FROM points_economy_migration_state');
    expect(Number(snapshots.total)).toBe(0);
    expect(Number(markers.total)).toBe(0);
  });
});
