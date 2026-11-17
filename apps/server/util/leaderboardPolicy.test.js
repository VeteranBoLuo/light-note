import { describe, expect, it } from 'vitest';
import {
  canViewLeaderboard,
  getLeaderboardConfig,
  leaderboardRange,
  leaderboardSeats,
  leaderboardServerShift,
  leaderboardSqlDate,
  leaderboardWeekMode,
  orderLeaderboard,
} from './leaderboardPolicy.js';

describe('积分排行榜周期与门槛', () => {
  it('开放普通账号和 Root 本人的查看权限，管理员代看仍受限', () => {
    const root = { id: 'owner', role: 'root' };
    expect(canViewLeaderboard({ user: root })).toBe(true);
    expect(canViewLeaderboard({ user: { id: 'player', role: 'user' } })).toBe(true);
    expect(canViewLeaderboard({ user: root, adminContext: {} })).toBe(false);
    expect(canViewLeaderboard({ user: { id: 'tester', role: 'test' } })).toBe(false);
    expect(canViewLeaderboard({ user: { id: 'visitor', role: 'visitor' } })).toBe(false);
    expect(canViewLeaderboard({ user: { role: 'root' } })).toBe(false);
    expect(canViewLeaderboard({})).toBe(false);
  });

  it('以北京时间归期，计算跨年周、月和非北京时间数据库边界', () => {
    expect(leaderboardRange('week', new Date('2026-12-27T15:59:59Z'))).toEqual({ start: '2026-12-21', end: '2026-12-28' });
    expect(leaderboardRange('week', new Date('2026-12-27T16:00:00Z'))).toEqual({ start: '2026-12-28', end: '2027-01-04' });
    expect(leaderboardRange('month', new Date('2026-12-31T16:00:00Z'))).toEqual({ start: '2027-01-01', end: '2027-02-01' });
    expect(leaderboardSqlDate('2027-01-04', leaderboardServerShift(0))).toBe('2027-01-03 16:00:00');
  });

  it('始终保留首个完整周的观察模式', () => {
    const config = getLeaderboardConfig({ POINTS_LEADERBOARD_OPEN_WEEK: '2026-11-16', POINTS_LEADERBOARD_FIRST_REWARD_WEEK: '2026-11-09' });
    expect(leaderboardWeekMode('2026-11-16', config)).toBe('observation');
    expect(leaderboardWeekMode('2026-11-23', config)).toBe('reward');
    expect(() => getLeaderboardConfig({ POINTS_LEADERBOARD_OPEN_WEEK: '2026-11-17' })).toThrow(/Beijing Monday/);
  });

  it('按排序和达标人数确定 0 至 3 个席位', () => {
    const scores = ['b', 'c', 'a', 'd'].map((userId, index) => ({
      userId, score: 100, activeDays: index === 1 ? 2 : 3, reachedAt: index === 3 ? '2026-11-17' : '2026-11-16',
    }));
    const ordered = orderLeaderboard(scores, new Set(scores.map((row) => row.userId)));
    expect(ordered.map((row) => row.userId)).toEqual(['a', 'b', 'd', 'c']);
    for (const [qualifiedCount, slots] of [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 3], [7, 3]]) {
      const candidates = Array.from({ length: qualifiedCount }, () => ({ score: 100, activeDays: 3 }));
      expect(leaderboardSeats(candidates, 'reward')).toMatchObject({ qualifiedCount, slots });
      expect(leaderboardSeats(candidates, 'observation').slots).toBe(0);
    }
  });
});
