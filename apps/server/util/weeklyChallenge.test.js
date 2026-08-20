import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getMeaningfulActivityFacts: vi.fn(),
  resolveWeeklyEarningPolicyVersion: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: { query: mocks.query },
}));
vi.mock('./points.js', () => ({
  earnPoints: vi.fn(),
}));
vi.mock('./meaningfulActivity.js', () => ({
  getMeaningfulActivityFacts: mocks.getMeaningfulActivityFacts,
}));
vi.mock('./pointsEarningPolicyState.js', () => ({
  resolveWeeklyEarningPolicyVersion: mocks.resolveWeeklyEarningPolicyVersion,
}));

const { getWeeklyChallenges } = await import('./weeklyChallenge.js');

describe('weeklyChallenge 示例资源隔离', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.getMeaningfulActivityFacts.mockReset();
    mocks.resolveWeeklyEarningPolicyVersion.mockReset().mockResolvedValue('points-earning-legacy');
  });

  it('每周书签与笔记进度不统计注册时自动生成的示例', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ bookmark: 0, note: 0, checkin: 0, todo: 0, organize: 0 }]])
      .mockResolvedValueOnce([[]]);

    const result = await getWeeklyChallenges('user-1', {
      calendar: {
        timezone: 'Asia/Shanghai',
        utcOffsetMinutes: 480,
        shiftMinutes: 0,
        weekKey: '202630',
      },
    });

    const progressSql = String(mocks.query.mock.calls[0][0]);
    expect(progressSql.match(/onboarding_seed_resources/g)).toHaveLength(3);
    expect(progressSql).toContain('td.completed_at');
    expect(progressSql).not.toContain('td.update_time');
    expect(result.challenges.find((challenge) => challenge.metric === 'bookmark')).toMatchObject({
      cur: 0,
      done: false,
      claimable: false,
    });
    expect(result.challenges.find((challenge) => challenge.metric === 'note')).toMatchObject({
      cur: 0,
      done: false,
      claimable: false,
    });
  });

  it('C5 返回今天是否已计入有效活跃日，供前端避免继续展示去完成', async () => {
    mocks.resolveWeeklyEarningPolicyVersion.mockResolvedValue('points-earning-c5');
    mocks.getMeaningfulActivityFacts
      .mockResolvedValueOnce({
        byType: { bookmark: 2, note: 1, file: 0, todo: 1, organize: 0 },
        activeDays: 4,
        variety: 3,
        total: 4,
        events: [],
      })
      .mockResolvedValueOnce({ byType: { note: 1 }, activeDays: 1, variety: 1, total: 1, events: [] });
    mocks.query.mockResolvedValueOnce([[]]);

    const result = await getWeeklyChallenges('user-1', {
      calendar: {
        timezone: 'Asia/Shanghai',
        utcOffsetMinutes: 480,
        shiftMinutes: 0,
        dayKey: '20260820',
        weekKey: '202634',
      },
    });

    expect(result.todayActive).toBe(true);
    expect(result.challenges.find((challenge) => challenge.metric === 'activeDays')).toMatchObject({
      cur: 4,
      done: false,
    });
    expect(mocks.getMeaningfulActivityFacts).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({ dayKey: '20260820' }),
    );
  });
});
