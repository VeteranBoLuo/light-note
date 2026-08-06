import { describe, expect, it } from 'vitest';
import { dailyQuestClaimLogText, resolveDailyQuestClaimFeedback } from './dailyQuestClaim';

describe('resolveDailyQuestClaimFeedback', () => {
  it('已领过只提醒，不报成功', () => {
    expect(resolveDailyQuestClaimFeedback({ already: true })).toEqual({
      level: 'info',
      key: 'growth.questClaimedAlready',
      params: {},
    });
  });

  it('撞上经验日顶时提示明天再来', () => {
    expect(resolveDailyQuestClaimFeedback({ capped: true, expGained: 0, pointsEarned: 30 })).toEqual({
      level: 'info',
      key: 'growth.questCapped',
      params: {},
    });
  });

  it('经验没入账但拿到积分时只说积分（root 的情况）', () => {
    // 关键回归:不能报「经验 +0、积分 +30」——那会让 root 以为白领了一次
    expect(resolveDailyQuestClaimFeedback({ expGained: 0, pointsEarned: 30 })).toEqual({
      level: 'success',
      key: 'growth.questClaimOkPointsOnly',
      params: { p: 30 },
    });
  });

  it('经验和积分都拿到时两者都报', () => {
    expect(resolveDailyQuestClaimFeedback({ expGained: 15, pointsEarned: 30 })).toEqual({
      level: 'success',
      key: 'growth.questClaimOkPts',
      params: { n: 15, p: 30 },
    });
  });

  it('只有经验时沿用旧文案（积分已按天领过）', () => {
    expect(resolveDailyQuestClaimFeedback({ expGained: 15, pointsEarned: 0 })).toEqual({
      level: 'success',
      key: 'growth.questClaimOk',
      params: { n: 15 },
    });
  });

  it('空结果不抛错，按「无奖励」处理', () => {
    expect(resolveDailyQuestClaimFeedback(null)).toEqual({
      level: 'success',
      key: 'growth.questClaimOk',
      params: { n: 0 },
    });
  });
});

describe('dailyQuestClaimLogText', () => {
  it('缺字段时补 0，日志文案始终完整', () => {
    expect(dailyQuestClaimLogText({ pointsEarned: 30 })).toBe('领取每日任务奖励（经验+0、积分+30）');
    expect(dailyQuestClaimLogText({ expGained: 15, pointsEarned: 30 })).toBe('领取每日任务奖励（经验+15、积分+30）');
  });
});
