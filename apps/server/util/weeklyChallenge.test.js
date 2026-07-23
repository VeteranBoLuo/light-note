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
      .mockResolvedValueOnce([[{ wk: 202630 }]])
      .mockResolvedValueOnce([[{ bookmark: 0, note: 0, checkin: 0 }]])
      .mockResolvedValueOnce([[]]);

    const result = await getWeeklyChallenges('user-1');

    const progressSql = String(query.mock.calls[1][0]);
    expect(progressSql.match(/onboarding_seed_resources/g)).toHaveLength(2);
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
