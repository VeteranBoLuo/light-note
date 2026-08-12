import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../db/index.js', () => ({
  default: { query },
}));
vi.mock('./points.js', () => ({
  earnPoints: vi.fn(),
}));

const { getWeeklyChallenges } = await import('./weeklyChallenge.js');

describe('weeklyChallenge 示例资源隔离', () => {
  beforeEach(() => query.mockReset());

  it('每周书签与笔记进度不统计注册时自动生成的示例', async () => {
    query
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

    const progressSql = String(query.mock.calls[0][0]);
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
});
