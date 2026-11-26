import { describe, expect, it } from 'vitest';
import {
  canViewLeaderboard,
  getLeaderboardConfig,
  leaderboardRange,
  leaderboardAwards,
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

  it('仅在首个发奖周明确设为开榜周时允许首周计奖', () => {
    const config = getLeaderboardConfig({ POINTS_LEADERBOARD_OPEN_WEEK: '2026-11-16', POINTS_LEADERBOARD_FIRST_REWARD_WEEK: '2026-11-09' });
    expect(leaderboardWeekMode('2026-11-16', config)).toBe('observation');
    expect(leaderboardWeekMode('2026-11-23', config)).toBe('reward');
    const launch = getLeaderboardConfig({
      POINTS_LEADERBOARD_OPEN_WEEK: '2026-11-23',
      POINTS_LEADERBOARD_FIRST_REWARD_WEEK: '2026-11-23',
      POINTS_LEADERBOARD_REWARDS_ENABLED: 'true',
    });
    expect(leaderboardWeekMode('2026-11-16', launch)).toBe('observation');
    expect(leaderboardWeekMode('2026-11-23', launch)).toBe('reward');
    expect(leaderboardWeekMode('2026-11-23', { ...launch, firstRewardWeek: null })).toBe('observation');
    expect(() => getLeaderboardConfig({ POINTS_LEADERBOARD_OPEN_WEEK: '2026-11-17' })).toThrow(/Beijing Monday/);
  });

  it('按榜分、有效日、达分时间和账号稳定排序', () => {
    const scores = ['b', 'c', 'a', 'd'].map((userId, index) => ({
      userId, score: 100, activeDays: index === 1 ? 2 : 3, reachedAt: index === 3 ? '2026-11-17' : '2026-11-16',
    }));
    const ordered = orderLeaderboard(scores, new Set(scores.map((row) => row.userId)));
    expect(ordered.map((row) => row.userId)).toEqual(['a', 'b', 'd', 'c']);
  });

  it.each([
    [[false, false, false], []],
    [[true, false, false], [[1, 88]]],
    [[true, true, false], [[1, 88], [2, 77]]],
    [[true, true, true], [[1, 88], [2, 77], [3, 66]]],
    [[false, true, true], [[2, 77], [3, 66]]],
    [[true, false, true], [[1, 88], [3, 66]]],
  ])('只给达标的前三名按实际名次定奖（%j）', (eligibility, entries) => {
    const candidates = [...eligibility, true].map((qualified, index) => ({
      rank: index + 1, score: 100, activeDays: qualified ? 3 : 2,
    }));
    expect(leaderboardAwards(candidates, 'reward')).toEqual({
      qualifiedCount: eligibility.filter(Boolean).length + 1,
      awards: new Map(entries),
    });
    expect(leaderboardAwards(candidates, 'observation').awards.size).toBe(0);
  });
});
