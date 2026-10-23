import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ dashboard: vi.fn(), lock: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('./growth.js', () => ({ getGrowthDashboard: mocks.dashboard, lockGrowthAccount: mocks.lock }));
import { preparePointsEarningC8 } from './pointsEarningC8Preparation.js';
import { POINTS_EARNING_C8_SNAPSHOT_MARKER } from './pointsEarningPolicy.js';

function fixture() {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  };
  const db = {
    getConnection: vi.fn().mockResolvedValue(connection),
    query: vi.fn(async (sql, params) => {
      if (sql.includes('SELECT id, role')) return [params[0] ? [] : [{ id: 'user-1', role: 'user' }]];
      return [[]];
    }),
  };
  return { db, connection };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('POINTS_EARNING_C8_ENABLED', 'false');
  mocks.dashboard.mockResolvedValue({
    achievementPolicyVersion: 'points-earning-c6',
    achievements: [
      {
        key: 'bookmark_500',
        unlocked: true,
        unlockedAt: null,
        reward: 400,
        frameId: 'frame_bookmark_archive',
        policyVersion: 'points-earning-c6',
      },
      {
        key: 'streak_7',
        unlocked: true,
        unlockedAt: '2026-09-01 12:00:00',
        reward: 30,
        rewardSnapshot: { points: 50, frameId: 'frame_streak_seed', policyVersion: 'points-earning-legacy' },
      },
      { key: 'note_500', unlocked: false, reward: 600 },
    ],
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('C8 旧成就承诺准备', () => {
  it('默认只读预览，不取写锁、不写快照和迁移标记', async () => {
    const { db } = fixture();
    expect(await preparePointsEarningC8({ db })).toEqual({ already: false, users: 1, achievements: 2 });
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(db.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  });

  it('只固化已经解锁的奖励，旧快照优先，全部完成后才记准备标记', async () => {
    const { db, connection } = fixture();
    await preparePointsEarningC8({ db, apply: true });
    expect(mocks.lock).toHaveBeenCalledWith(connection, 'user-1');
    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(user_achievements.reward_points_snapshot'),
      [
        'user-1',
        'bookmark_500',
        null,
        400,
        'frame_bookmark_archive',
        'points-earning-c6',
        'user-1',
        'streak_7',
        '2026-09-01 12:00:00',
        50,
        'frame_streak_seed',
        'points-earning-legacy',
      ],
    );
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT IGNORE INTO points_economy_migration_state'),
      [POINTS_EARNING_C8_SNAPSHOT_MARKER, expect.any(String)],
    );
  });

  it('完成标记使重复运行直接返回，不把后来解锁的成就重新固化成旧奖励', async () => {
    const { db } = fixture();
    db.query.mockResolvedValueOnce([[{ migration_key: POINTS_EARNING_C8_SNAPSHOT_MARKER }]]);
    expect(await preparePointsEarningC8({ db, apply: true })).toMatchObject({ already: true });
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('C8 目录已配置时失败关闭，回滚当前账号且不写准备标记', async () => {
    const { db, connection } = fixture();
    mocks.dashboard.mockResolvedValueOnce({ achievementPolicyVersion: 'points-earning-c8' });
    await expect(preparePointsEarningC8({ db, apply: true })).rejects.toThrow(
      'POINTS_EARNING_C8_PREPARATION_MUST_PRECEDE_CONFIGURATION',
    );
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
});
